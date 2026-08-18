use crate::error::{AppError, AppResult};
use crate::models::CfBucketInfo;
use serde::Deserialize;
use serde_json::Value;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

const REST_BASE: &str = "https://api.cloudflare.com/client/v4";

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
		let mut req = self
			.http
			.request(method.clone(), format!("{REST_BASE}{path}"))
			.bearer_auth(token)
			.header("Content-Type", "application/json");
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

	pub async fn create_bucket(&self, token: &str, account_id: &str, name: &str) -> AppResult<()> {
		self.request(
			token,
			reqwest::Method::POST,
			&format!("/accounts/{account_id}/r2/buckets"),
			Some(serde_json::json!({ "name": name })),
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
}
