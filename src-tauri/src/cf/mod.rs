use crate::error::{AppError, AppResult};
use crate::models::{CfBucketInfo, Jurisdiction, LocationHint, StorageClass};
use serde::Deserialize;
use serde_json::Value;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

const REST_BASE: &str = "https://api.cloudflare.com/client/v4";

const OPS_QUERY: &str = r#"
query R2Volume($accountTag: string!, $startDate: Time, $endDate: Time) {
	viewer {
		accounts(filter: { accountTag: $accountTag }) {
			r2OperationsAdaptiveGroups(
				limit: 10000
				filter: { datetime_geq: $startDate, datetime_leq: $endDate }
			) {
				sum { requests }
				dimensions { actionType }
			}
		}
	}
}
"#;

pub struct CfClient {
	http: reqwest::Client,
	cache: Mutex<Vec<CacheEntry>>,
}

struct CacheEntry {
	key: String,
	value: Value,
	expires: Instant,
}

impl Default for CfClient {
	fn default() -> Self {
		Self::new()
	}
}

impl CfClient {
	pub fn new() -> Self {
		Self {
			http: reqwest::Client::new(),
			cache: Mutex::new(Vec::new()),
		}
	}

	async fn cached(&self, key: &str) -> Option<Value> {
		let cache = self.cache.lock().await;
		cache
			.iter()
			.find(|e| e.key == key && e.expires > Instant::now())
			.map(|e| e.value.clone())
	}

	async fn put_cache(&self, key: String, value: Value) {
		let mut cache = self.cache.lock().await;
		cache.retain(|e| e.expires > Instant::now() && e.key != key);
		cache.push(CacheEntry {
			key,
			value,
			expires: Instant::now() + Duration::from_secs(60),
		});
	}

	async fn request(
		&self,
		token: &str,
		method: reqwest::Method,
		path: &str,
		body: Option<Value>,
	) -> AppResult<Value> {
		self.request_full(token, method, path, body, &[]).await
	}

	async fn request_full(
		&self,
		token: &str,
		method: reqwest::Method,
		path: &str,
		body: Option<Value>,
		extra_headers: &[(&str, &str)],
	) -> AppResult<Value> {
		let mut req = self
			.http
			.request(method.clone(), format!("{REST_BASE}{path}"))
			.bearer_auth(token)
			.header("Content-Type", "application/json");
		for (name, value) in extra_headers {
			req = req.header(*name, *value);
		}
		if let Some(b) = body {
			req = req.json(&b);
		}
		let resp = req.send().await?;
		let status = resp.status();
		let json: CfEnvelope = resp.json().await.unwrap_or(CfEnvelope {
			success: false,
			result: Value::Null,
			errors: vec![CfError {
				code: status.as_u16() as i64,
				message: status.to_string(),
			}],
		});
		if status.as_u16() == 401 || json.errors.iter().any(|e| e.code == 10002) {
			return Err(AppError::InvalidCredentials(
				"Cloudflare REST API rejected this token. Object-level R2 tokens cannot call REST."
					.into(),
			));
		}
		if status.as_u16() == 403 || json.errors.iter().any(|e| e.code == 10000) {
			return Err(AppError::AccessDenied(
				"Cloudflare REST authentication error (token may be bucket-scoped)".into(),
			));
		}
		if !json.success && !status.is_success() {
			let msg = json
				.errors
				.iter()
				.map(|e| format!("{}: {}", e.code, e.message))
				.collect::<Vec<_>>()
				.join("; ");
			return Err(AppError::Other(msg));
		}
		Ok(json.result)
	}

	pub async fn list_buckets(
		&self,
		token: &str,
		account_id: &str,
	) -> AppResult<Vec<CfBucketInfo>> {
		let cache_key = format!("buckets:{account_id}");
		if let Some(v) = self.cached(&cache_key).await {
			return Ok(parse_buckets(v));
		}
		let result = self
			.request(
				token,
				reqwest::Method::GET,
				&format!("/accounts/{account_id}/r2/buckets"),
				None,
			)
			.await?;
		self.put_cache(cache_key, result.clone()).await;
		Ok(parse_buckets(result))
	}

	pub async fn probe_admin(&self, token: &str, account_id: &str) -> bool {
		self.list_buckets(token, account_id).await.is_ok()
	}

	pub async fn create_bucket(
		&self,
		token: &str,
		account_id: &str,
		name: &str,
		jurisdiction: Jurisdiction,
		location_hint: Option<LocationHint>,
		storage_class: Option<StorageClass>,
	) -> AppResult<()> {
		self.request_full(
			token,
			reqwest::Method::POST,
			&format!("/accounts/{account_id}/r2/buckets"),
			Some(create_bucket_body(name, location_hint, storage_class)),
			jurisdiction_header(jurisdiction).as_slice(),
		)
		.await?;
		self.invalidate_prefix(&format!("buckets:{account_id}"))
			.await;
		Ok(())
	}

	pub async fn delete_bucket(&self, token: &str, account_id: &str, name: &str) -> AppResult<()> {
		self.request(
			token,
			reqwest::Method::DELETE,
			&format!("/accounts/{account_id}/r2/buckets/{name}"),
			None,
		)
		.await?;
		self.invalidate_prefix(&format!("buckets:{account_id}"))
			.await;
		Ok(())
	}

	async fn cached_get(&self, token: &str, path: &str, cache_key: String) -> AppResult<Value> {
		if let Some(v) = self.cached(&cache_key).await {
			return Ok(v);
		}
		let result = self
			.request(token, reqwest::Method::GET, path, None)
			.await?;
		self.put_cache(cache_key, result.clone()).await;
		Ok(result)
	}

	async fn invalidate_prefix(&self, prefix: &str) {
		let mut cache = self.cache.lock().await;
		cache.retain(|e| !e.key.starts_with(prefix));
	}

	pub async fn get_cors(&self, token: &str, account_id: &str, bucket: &str) -> AppResult<Value> {
		self.cached_get(
			token,
			&format!("/accounts/{account_id}/r2/buckets/{bucket}/cors"),
			format!("cors:{account_id}:{bucket}"),
		)
		.await
	}

	pub async fn put_cors(
		&self,
		token: &str,
		account_id: &str,
		bucket: &str,
		rules: Value,
	) -> AppResult<()> {
		self.request(
			token,
			reqwest::Method::PUT,
			&format!("/accounts/{account_id}/r2/buckets/{bucket}/cors"),
			Some(rules),
		)
		.await?;
		self.invalidate_prefix(&format!("cors:{account_id}:{bucket}"))
			.await;
		Ok(())
	}

	pub async fn get_lifecycle(
		&self,
		token: &str,
		account_id: &str,
		bucket: &str,
	) -> AppResult<Value> {
		self.cached_get(
			token,
			&format!("/accounts/{account_id}/r2/buckets/{bucket}/lifecycle"),
			format!("lifecycle:{account_id}:{bucket}"),
		)
		.await
	}

	pub async fn put_lifecycle(
		&self,
		token: &str,
		account_id: &str,
		bucket: &str,
		rules: Value,
	) -> AppResult<()> {
		self.request(
			token,
			reqwest::Method::PUT,
			&format!("/accounts/{account_id}/r2/buckets/{bucket}/lifecycle"),
			Some(rules),
		)
		.await?;
		self.invalidate_prefix(&format!("lifecycle:{account_id}:{bucket}"))
			.await;
		Ok(())
	}

	pub async fn get_managed_domain(
		&self,
		token: &str,
		account_id: &str,
		bucket: &str,
	) -> AppResult<Value> {
		self.cached_get(
			token,
			&format!("/accounts/{account_id}/r2/buckets/{bucket}/domains/managed"),
			format!("devurl:{account_id}:{bucket}"),
		)
		.await
	}

	pub async fn set_managed_domain(
		&self,
		token: &str,
		account_id: &str,
		bucket: &str,
		enabled: bool,
	) -> AppResult<Value> {
		self.request(
			token,
			reqwest::Method::PUT,
			&format!("/accounts/{account_id}/r2/buckets/{bucket}/domains/managed"),
			Some(serde_json::json!({ "enabled": enabled })),
		)
		.await?;
		self.invalidate_prefix(&format!("devurl:{account_id}:{bucket}"))
			.await;
		Ok(serde_json::json!({ "enabled": enabled }))
	}

	pub async fn list_custom_domains(
		&self,
		token: &str,
		account_id: &str,
		bucket: &str,
	) -> AppResult<Value> {
		self.cached_get(
			token,
			&format!("/accounts/{account_id}/r2/buckets/{bucket}/domains/custom"),
			format!("domains:{account_id}:{bucket}"),
		)
		.await
	}

	pub async fn get_lock(&self, token: &str, account_id: &str, bucket: &str) -> AppResult<Value> {
		self.cached_get(
			token,
			&format!("/accounts/{account_id}/r2/buckets/{bucket}/lock"),
			format!("lock:{account_id}:{bucket}"),
		)
		.await
	}

	pub async fn put_lock(
		&self,
		token: &str,
		account_id: &str,
		bucket: &str,
		body: Value,
	) -> AppResult<()> {
		self.request(
			token,
			reqwest::Method::PUT,
			&format!("/accounts/{account_id}/r2/buckets/{bucket}/lock"),
			Some(body),
		)
		.await?;
		self.invalidate_prefix(&format!("lock:{account_id}:{bucket}"))
			.await;
		Ok(())
	}

	pub async fn get_events(
		&self,
		token: &str,
		account_id: &str,
		bucket: &str,
	) -> AppResult<Value> {
		self.cached_get(
			token,
			&format!("/accounts/{account_id}/event_notifications/r2/{bucket}/configuration"),
			format!("events:{account_id}:{bucket}"),
		)
		.await
	}

	pub async fn put_events(
		&self,
		token: &str,
		account_id: &str,
		bucket: &str,
		body: Value,
	) -> AppResult<()> {
		self.request(
			token,
			reqwest::Method::PUT,
			&format!("/accounts/{account_id}/event_notifications/r2/{bucket}/configuration"),
			Some(body),
		)
		.await?;
		self.invalidate_prefix(&format!("events:{account_id}:{bucket}"))
			.await;
		Ok(())
	}

	pub async fn metrics(&self, token: &str, account_id: &str) -> AppResult<Value> {
		let cache_key = format!("metrics:{account_id}");
		if let Some(v) = self.cached(&cache_key).await {
			return Ok(v);
		}
		let result = self
			.request(
				token,
				reqwest::Method::GET,
				&format!("/accounts/{account_id}/r2/metrics"),
				None,
			)
			.await?;
		self.put_cache(cache_key, result.clone()).await;
		Ok(result)
	}

	pub async fn r2_operations(
		&self,
		token: &str,
		account_id: &str,
		from: &str,
		to: &str,
	) -> AppResult<Vec<(String, u64)>> {
		let cache_key = format!("ops:{account_id}:{from}");
		if let Some(v) = self.cached(&cache_key).await {
			return Ok(parse_operations(&v));
		}
		let body = serde_json::json!({
			"query": OPS_QUERY,
			"variables": {
				"accountTag": account_id,
				"startDate": from,
				"endDate": to,
			}
		});
		let resp = self
			.http
			.request(reqwest::Method::POST, format!("{REST_BASE}/graphql"))
			.bearer_auth(token)
			.header("Content-Type", "application/json")
			.json(&body)
			.send()
			.await?;
		let status = resp.status();
		let json: Value = match resp.json().await {
			Ok(v) => v,
			Err(_) => {
				return Err(AppError::Other(format!(
					"Cloudflare GraphQL returned a non-JSON response (HTTP {status})"
				)));
			}
		};
		let data = map_gql_response(status.as_u16(), &json)?;
		self.put_cache(cache_key, data.clone()).await;
		Ok(parse_operations(&data))
	}
}

#[derive(Deserialize)]
struct CfEnvelope {
	success: bool,
	#[serde(default)]
	result: Value,
	#[serde(default)]
	errors: Vec<CfError>,
}

#[derive(Deserialize)]
struct CfError {
	#[serde(default)]
	code: i64,
	#[serde(default)]
	message: String,
}

fn gql_errors(body: &Value) -> &[Value] {
	body.get("errors").and_then(Value::as_array).map_or(&[], Vec::as_slice)
}

fn gql_error_messages(body: &Value) -> String {
	gql_errors(body)
		.iter()
		.filter_map(|e| e.get("message").and_then(Value::as_str))
		.collect::<Vec<_>>()
		.join("; ")
}

fn gql_has_authz(body: &Value) -> bool {
	gql_errors(body).iter().any(|e| {
		e.pointer("/extensions/code")
			.and_then(Value::as_str)
			.is_some_and(|code| code == "authz")
	})
}

fn map_gql_response(status: u16, body: &Value) -> AppResult<Value> {
	if status == 401 {
		return Err(AppError::InvalidCredentials(
			"Cloudflare GraphQL rejected this token.".into(),
		));
	}
	if status == 429 {
		return Err(AppError::RateLimited(
			"Cloudflare GraphQL rate limited this request.".into(),
		));
	}
	if status == 403 || gql_has_authz(body) {
		return Err(AppError::AccessDenied(
			"Cloudflare GraphQL rejected this token. Account Analytics: Read is required for request usage.".into(),
		));
	}
	let data = body.get("data").cloned().unwrap_or(Value::Null);
	if !gql_errors(body).is_empty() && data.is_null() {
		return Err(AppError::Other(gql_error_messages(body)));
	}
	if !(200..300).contains(&status) {
		return Err(AppError::Other(status.to_string()));
	}
	Ok(data)
}

fn parse_operations(data: &Value) -> Vec<(String, u64)> {
	let groups = data
		.pointer("/viewer/accounts/0/r2OperationsAdaptiveGroups")
		.or_else(|| data.pointer("/data/viewer/accounts/0/r2OperationsAdaptiveGroups"))
		.and_then(|v| v.as_array())
		.cloned()
		.unwrap_or_default();
	groups
		.iter()
		.filter_map(|item| {
			let action = item.pointer("/dimensions/actionType")?.as_str()?.to_string();
			let requests = item
				.pointer("/sum/requests")
				.and_then(|v| v.as_u64().or_else(|| v.as_f64().map(|n| n as u64)))
				.unwrap_or(0);
			Some((action, requests))
		})
		.collect()
}

fn create_bucket_body(
	name: &str,
	location_hint: Option<LocationHint>,
	storage_class: Option<StorageClass>,
) -> Value {
	let mut map = serde_json::Map::new();
	map.insert("name".into(), Value::String(name.to_string()));
	if let Some(hint) = location_hint {
		map.insert(
			"locationHint".into(),
			Value::String(hint.as_str().to_string()),
		);
	}
	if let Some(class) = storage_class {
		map.insert(
			"storageClass".into(),
			Value::String(class.api_value().to_string()),
		);
	}
	Value::Object(map)
}

fn jurisdiction_header(jurisdiction: Jurisdiction) -> Option<(&'static str, &'static str)> {
	match jurisdiction {
		Jurisdiction::Default => None,
		Jurisdiction::Eu | Jurisdiction::Fedramp => {
			Some(("cf-r2-jurisdiction", jurisdiction.as_str()))
		}
	}
}

fn parse_buckets(result: Value) -> Vec<CfBucketInfo> {
	let buckets = result
		.get("buckets")
		.cloned()
		.or_else(|| result.as_array().cloned().map(Value::Array))
		.unwrap_or(Value::Array(vec![]));
	buckets
		.as_array()
		.unwrap_or(&vec![])
		.iter()
		.filter_map(|b| {
			Some(CfBucketInfo {
				name: b.get("name")?.as_str()?.to_string(),
				location: b
					.get("location")
					.and_then(|v| v.as_str())
					.map(|s| s.to_string()),
				storage_class: b
					.get("storageClass")
					.or_else(|| b.get("storage_class"))
					.and_then(|v| v.as_str())
					.map(|s| s.to_string()),
			})
		})
		.collect()
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn parse_buckets_from_wrapped() {
		let v = serde_json::json!({
			"buckets": [{ "name": "a" }, { "name": "b", "location": "WNAM" }]
		});
		let items = parse_buckets(v);
		assert_eq!(items.len(), 2);
		assert_eq!(items[0].name, "a");
	}

	#[test]
	fn parse_operations_from_graphql_data() {
		let v = serde_json::json!({
			"viewer": {
				"accounts": [{
					"r2OperationsAdaptiveGroups": [
						{ "dimensions": { "actionType": "ListObjects" }, "sum": { "requests": 12 } },
						{ "dimensions": { "actionType": "GetObject" }, "sum": { "requests": 7.0 } }
					]
				}]
			}
		});
		let items = parse_operations(&v);
		assert_eq!(items, vec![("ListObjects".into(), 12), ("GetObject".into(), 7)]);
	}

	#[test]
	fn map_gql_treats_null_errors_as_success() {
		let body = serde_json::json!({
			"data": { "viewer": { "accounts": [] } },
			"errors": null
		});
		let data = map_gql_response(200, &body).unwrap();
		assert!(data.get("viewer").is_some());
	}

	#[test]
	fn map_gql_authz_is_access_denied() {
		let body = serde_json::json!({
			"data": null,
			"errors": [{ "message": "not authorized", "extensions": { "code": "authz" } }]
		});
		let err = map_gql_response(200, &body).unwrap_err();
		assert_eq!(err.kind(), "accessDenied");
	}

	#[test]
	fn map_gql_error_messages_are_other() {
		let body = serde_json::json!({
			"data": null,
			"errors": [{ "message": "cannot request data older than 2678400s" }]
		});
		let err = map_gql_response(200, &body).unwrap_err();
		assert_eq!(err.kind(), "other");
		assert!(err.to_string().contains("cannot request data older than 2678400s"));
	}

	#[test]
	fn map_gql_401_is_invalid_credentials() {
		let err = map_gql_response(401, &serde_json::json!({})).unwrap_err();
		assert_eq!(err.kind(), "invalidCredentials");
	}

	#[test]
	fn create_bucket_body_name_only() {
		assert_eq!(
			create_bucket_body("example-bucket", None, None),
			serde_json::json!({ "name": "example-bucket" })
		);
	}

	#[test]
	fn create_bucket_body_includes_optional_fields() {
		assert_eq!(
			create_bucket_body(
				"example-bucket",
				Some(LocationHint::Wnam),
				Some(StorageClass::InfrequentAccess)
			),
			serde_json::json!({
				"name": "example-bucket",
				"locationHint": "wnam",
				"storageClass": "InfrequentAccess"
			})
		);
	}

	#[test]
	fn jurisdiction_header_omits_default() {
		assert_eq!(jurisdiction_header(Jurisdiction::Default), None);
	}

	#[test]
	fn jurisdiction_header_sends_eu() {
		assert_eq!(
			jurisdiction_header(Jurisdiction::Eu),
			Some(("cf-r2-jurisdiction", "eu"))
		);
	}
}
