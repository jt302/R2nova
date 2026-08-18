pub mod keys;
pub mod multipart;

use crate::cost::{CostCounter, S3Op};
use crate::error::{AppError, AppResult};
use crate::models::{BucketItem, ListObjectsPage, ObjectDetail, ObjectItem, Profile};
use crate::s3::keys::{display_name, is_placeholder_dir, normalize_prefix};
use aws_config::Region;
use aws_credential_types::Credentials;
use aws_sdk_s3::error::{DisplayErrorContext, ProvideErrorMetadata, SdkError};
use aws_sdk_s3::Client;
use std::collections::HashMap;
use std::sync::Arc;

pub struct S3Pool {
	clients: HashMap<String, Client>,
}

impl S3Pool {
	pub fn new() -> Self {
		Self {
			clients: HashMap::new(),
		}
	}

	pub fn evict(&mut self, profile_id: &str) {
		self.clients
			.retain(|k, _| !k.starts_with(&format!("{profile_id}:")));
	}

	pub async fn client(
		&mut self,
		profile: &Profile,
		secret: &str,
		cost: &Arc<CostCounter>,
	) -> AppResult<LiveClient> {
		let key = format!("{}:{:?}", profile.id, profile.jurisdiction);
		if !self.clients.contains_key(&key) {
			let client = build_client(profile, secret).await?;
			self.clients.insert(key.clone(), client);
		}
		Ok(LiveClient {
			inner: self.clients.get(&key).unwrap().clone(),
			cost: cost.clone(),
		})
	}
}

pub struct LiveClient {
	inner: Client,
	cost: Arc<CostCounter>,
}

impl LiveClient {
	pub fn raw(&self) -> &Client {
		&self.inner
	}

	pub fn record(&self, op: S3Op) {
		self.cost.record(op);
	}

	pub async fn list_buckets(&self) -> AppResult<Vec<BucketItem>> {
		self.record(S3Op::ListBuckets);
		// ponytail: R2 returns 501 for ListBuckets max-buckets. First page only (~1000).
		// Upgrade: paginate via cf-list-bucket-truncated / cf-list-bucket-cursor response headers.
		let resp = self.inner.list_buckets().send().await.map_err(sdk_err)?;
		Ok(resp
			.buckets()
			.iter()
			.map(|b| BucketItem {
				name: b.name().unwrap_or_default().to_string(),
				creation_date: b.creation_date().map(|d| d.to_string()),
			})
			.collect())
	}

	pub async fn list_objects(
		&self,
		bucket: &str,
		prefix: &str,
		continuation: Option<String>,
	) -> AppResult<ListObjectsPage> {
		self.record(S3Op::ListObjectsV2);
		let prefix = normalize_prefix(prefix);
		let mut req = self
			.inner
			.list_objects_v2()
			.bucket(bucket)
			.delimiter("/")
			.max_keys(1000)
			.prefix(&prefix);
		if let Some(token) = continuation {
			req = req.continuation_token(token);
		}
		let resp = req.send().await.map_err(sdk_err)?;

		let prefixes = resp
			.common_prefixes()
			.iter()
			.filter_map(|p| p.prefix().map(|s| s.to_string()))
			.map(|key| ObjectItem {
				name: display_name(&key, &prefix),
				key,
				size: 0,
				last_modified: None,
				etag: None,
				storage_class: None,
				is_prefix: true,
			})
			.collect();

		let objects = resp
			.contents()
			.iter()
			.filter_map(|obj| {
				let key = obj.key()?.to_string();
				let size = obj.size().unwrap_or(0);
				if is_placeholder_dir(&key, size) || key == prefix {
					return None;
				}
				Some(ObjectItem {
					name: display_name(&key, &prefix),
					key,
					size,
					last_modified: obj.last_modified().map(|d| d.to_string()),
					etag: obj.e_tag().map(|s| s.to_string()),
					storage_class: obj.storage_class().map(|s| s.as_str().to_string()),
					is_prefix: false,
				})
			})
			.collect();

		Ok(ListObjectsPage {
			objects,
			prefixes,
			is_truncated: resp.is_truncated().unwrap_or(false),
			next_continuation_token: resp.next_continuation_token().map(|s| s.to_string()),
		})
	}

	pub async fn head_object(&self, bucket: &str, key: &str) -> AppResult<ObjectDetail> {
		self.record(S3Op::HeadObject);
		let resp = self
			.inner
			.head_object()
			.bucket(bucket)
			.key(key)
			.send()
			.await
			.map_err(sdk_err)?;
		let metadata = resp
			.metadata()
			.map(|m| m.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
			.unwrap_or_default();
		Ok(ObjectDetail {
			key: key.to_string(),
			size: resp.content_length().unwrap_or(0),
			last_modified: resp.last_modified().map(|d| d.to_string()),
			etag: resp.e_tag().map(|s| s.to_string()),
			content_type: resp.content_type().map(|s| s.to_string()),
			storage_class: resp.storage_class().map(|s| s.as_str().to_string()),
			metadata,
		})
	}

	pub async fn delete_objects(&self, bucket: &str, keys: &[String]) -> AppResult<u64> {
		if keys.is_empty() {
			return Ok(0);
		}
		self.record(S3Op::DeleteObjects);
		let mut deleted = 0u64;
		for chunk in keys.chunks(1000) {
			let objects: Vec<aws_sdk_s3::types::ObjectIdentifier> = chunk
				.iter()
				.filter_map(|k| {
					aws_sdk_s3::types::ObjectIdentifier::builder()
						.key(k)
						.build()
						.ok()
				})
				.collect();
			let delete = aws_sdk_s3::types::Delete::builder()
				.set_objects(Some(objects))
				.quiet(true)
				.build()
				.map_err(|e| AppError::Other(e.to_string()))?;
			self.inner
				.delete_objects()
				.bucket(bucket)
				.delete(delete)
				.send()
				.await
				.map_err(sdk_err)?;
			deleted += chunk.len() as u64;
		}
		Ok(deleted)
	}

	pub async fn copy_object(
		&self,
		src_bucket: &str,
		src_key: &str,
		dst_bucket: &str,
		dst_key: &str,
	) -> AppResult<()> {
		let head = self.head_object(src_bucket, src_key).await?;
		let size = head.size.max(0) as u64;
		if size > crate::s3::multipart::COPY_MAX {
			return self
				.copy_multipart(src_bucket, src_key, dst_bucket, dst_key, size)
				.await;
		}
		self.record(S3Op::CopyObject);
		let source = format!("{src_bucket}/{src_key}");
		self.inner
			.copy_object()
			.bucket(dst_bucket)
			.key(dst_key)
			.copy_source(encode_copy_source(&source))
			.send()
			.await
			.map_err(sdk_err)?;
		Ok(())
	}

	async fn copy_multipart(
		&self,
		src_bucket: &str,
		src_key: &str,
		dst_bucket: &str,
		dst_key: &str,
		size: u64,
	) -> AppResult<()> {
		use crate::s3::multipart::{part_count, part_range, part_size};
		let chunk = part_size(size);
		let n = part_count(size, chunk);
		self.record(S3Op::CreateMultipartUpload);
		let created = self
			.inner
			.create_multipart_upload()
			.bucket(dst_bucket)
			.key(dst_key)
			.send()
			.await
			.map_err(sdk_err)?;
		let upload_id = created
			.upload_id()
			.ok_or_else(|| AppError::Other("missing upload id".into()))?
			.to_string();
		let source = encode_copy_source(&format!("{src_bucket}/{src_key}"));
		let mut parts = Vec::new();
		for part_number in 1..=n {
			let (start, end) = part_range(size, chunk, part_number);
			self.record(S3Op::UploadPartCopy);
			let resp = self
				.inner
				.upload_part_copy()
				.bucket(dst_bucket)
				.key(dst_key)
				.upload_id(&upload_id)
				.part_number(part_number as i32)
				.copy_source(&source)
				.copy_source_range(format!("bytes={}-{}", start, end.saturating_sub(1)))
				.send()
				.await
				.map_err(sdk_err)?;
			let etag = resp
				.copy_part_result()
				.and_then(|r| r.e_tag())
				.ok_or_else(|| AppError::Other("missing copy etag".into()))?
				.to_string();
			parts.push(
				aws_sdk_s3::types::CompletedPart::builder()
					.part_number(part_number as i32)
					.e_tag(etag)
					.build(),
			);
		}
		self.record(S3Op::CompleteMultipartUpload);
		let completed = aws_sdk_s3::types::CompletedMultipartUpload::builder()
			.set_parts(Some(parts))
			.build();
		self.inner
			.complete_multipart_upload()
			.bucket(dst_bucket)
			.key(dst_key)
			.upload_id(upload_id)
			.multipart_upload(completed)
			.send()
			.await
			.map_err(sdk_err)?;
		Ok(())
	}

	pub async fn list_all_keys(&self, bucket: &str, prefix: &str) -> AppResult<Vec<String>> {
		let mut keys = Vec::new();
		let mut token: Option<String> = None;
		let prefix = normalize_prefix(prefix);
		loop {
			self.record(S3Op::ListObjectsV2);
			let mut req = self
				.inner
				.list_objects_v2()
				.bucket(bucket)
				.max_keys(1000)
				.prefix(&prefix);
			if let Some(t) = token.clone() {
				req = req.continuation_token(t);
			}
			let resp = req.send().await.map_err(sdk_err)?;
			for obj in resp.contents() {
				if let Some(k) = obj.key() {
					keys.push(k.to_string());
				}
			}
			if !resp.is_truncated().unwrap_or(false) {
				break;
			}
			token = resp.next_continuation_token().map(|s| s.to_string());
			if token.is_none() {
				break;
			}
		}
		Ok(keys)
	}

	pub async fn abort_multipart(&self, bucket: &str, key: &str, upload_id: &str) -> AppResult<()> {
		self.record(S3Op::AbortMultipartUpload);
		self.inner
			.abort_multipart_upload()
			.bucket(bucket)
			.key(key)
			.upload_id(upload_id)
			.send()
			.await
			.map_err(sdk_err)?;
		Ok(())
	}

	pub async fn list_multipart(
		&self,
		bucket: &str,
	) -> AppResult<Vec<crate::models::MultipartUploadItem>> {
		self.record(S3Op::ListMultipartUploads);
		let resp = self
			.inner
			.list_multipart_uploads()
			.bucket(bucket)
			.send()
			.await
			.map_err(sdk_err)?;
		Ok(resp
			.uploads()
			.iter()
			.map(|u| crate::models::MultipartUploadItem {
				key: u.key().unwrap_or_default().to_string(),
				upload_id: u.upload_id().unwrap_or_default().to_string(),
				initiated: u.initiated().map(|d| d.to_string()),
			})
			.collect())
	}
}

pub(crate) fn encode_copy_source(source: &str) -> String {
	source
		.split('/')
		.map(|seg| {
			let mut out = String::new();
			for b in seg.bytes() {
				match b {
					b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
						out.push(b as char);
					}
					_ => out.push_str(&format!("%{b:02X}")),
				}
			}
			out
		})
		.collect::<Vec<_>>()
		.join("/")
}

pub fn sdk_err<E, R>(err: SdkError<E, R>) -> AppError
where
	E: std::error::Error + ProvideErrorMetadata + Send + Sync + 'static,
	R: Send + Sync + std::fmt::Debug + 'static,
{
	let detailed = DisplayErrorContext(&err).to_string();
	log::warn!("s3 error: {detailed}");
	let svc = err.as_service_error();
	map_s3_meta(
		svc.and_then(ProvideErrorMetadata::code),
		svc.and_then(ProvideErrorMetadata::message),
		&detailed,
	)
}

fn map_s3_meta(code: Option<&str>, message: Option<&str>, fallback: &str) -> AppError {
	match code {
		Some(code) => {
			let msg = match message {
				Some(m) if !m.is_empty() => m,
				_ => fallback,
			};
			AppError::from_s3_code(code, msg)
		}
		None => AppError::Network(fallback.to_string()),
	}
}

async fn build_client(profile: &Profile, secret: &str) -> AppResult<Client> {
	let endpoint = format!(
		"https://{}",
		profile.jurisdiction.endpoint_host(&profile.account_id)
	);
	let creds = Credentials::new(
		profile.access_key_id.clone(),
		secret.to_string(),
		None,
		None,
		"r2nova",
	);
	let shared = aws_config::defaults(aws_config::BehaviorVersion::latest())
		.region(Region::new("auto"))
		.endpoint_url(endpoint)
		.credentials_provider(creds)
		.load()
		.await;
	let conf = aws_sdk_s3::config::Builder::from(&shared)
		.force_path_style(true)
		.build();
	Ok(Client::from_conf(conf))
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn maps_invalid_access_key() {
		let err = map_s3_meta(
			Some("InvalidAccessKeyId"),
			Some("not found"),
			"service error",
		);
		assert_eq!(err.kind(), "invalidCredentials");
		assert!(err.to_string().contains("not found"));
	}

	#[test]
	fn fallback_without_code_keeps_chain() {
		let err = map_s3_meta(None, None, "dispatch failure: dns");
		assert_eq!(err.kind(), "network");
		assert!(err.to_string().contains("dns"));
	}
}
