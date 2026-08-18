use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Jurisdiction {
	Default,
	Eu,
	Fedramp,
}

impl Jurisdiction {
	pub fn endpoint_host(self, account_id: &str) -> String {
		match self {
			Self::Default => format!("{account_id}.r2.cloudflarestorage.com"),
			Self::Eu => format!("{account_id}.eu.r2.cloudflarestorage.com"),
			Self::Fedramp => format!("{account_id}.fedramp.r2.cloudflarestorage.com"),
		}
	}

	#[allow(dead_code)]
	pub fn as_str(self) -> &'static str {
		match self {
			Self::Default => "default",
			Self::Eu => "eu",
			Self::Fedramp => "fedramp",
		}
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TokenCapability {
	Unknown,
	Invalid,
	Object,
	Admin,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
	pub id: String,
	pub name: String,
	pub account_id: String,
	pub access_key_id: String,
	pub jurisdiction: Jurisdiction,
	pub has_cf_token: bool,
	pub capability: TokenCapability,
	/// Last probe failure. Cleared on a successful ListBuckets. Never store secrets here.
	#[serde(default)]
	pub last_error: Option<String>,
}

/// Cloudflare Account ID is exactly 32 ASCII hex digits (dashboard, not an email).
pub fn is_r2_account_id(id: &str) -> bool {
	let id = id.trim();
	id.len() == 32 && id.bytes().all(|b| b.is_ascii_hexdigit())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BucketItem {
	pub name: String,
	pub creation_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectItem {
	pub key: String,
	pub name: String,
	pub size: i64,
	pub last_modified: Option<String>,
	pub etag: Option<String>,
	pub storage_class: Option<String>,
	pub is_prefix: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListObjectsPage {
	pub objects: Vec<ObjectItem>,
	pub prefixes: Vec<ObjectItem>,
	pub is_truncated: bool,
	pub next_continuation_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectDetail {
	pub key: String,
	pub size: i64,
	pub last_modified: Option<String>,
	pub etag: Option<String>,
	pub content_type: Option<String>,
	pub storage_class: Option<String>,
	pub metadata: Vec<(String, String)>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferProgress {
	pub transfer_id: String,
	pub key: String,
	pub direction: TransferDirection,
	pub bytes_done: u64,
	pub bytes_total: u64,
	pub status: TransferStatus,
	pub error: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TransferDirection {
	Upload,
	Download,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TransferStatus {
	Queued,
	Running,
	Paused,
	Completed,
	Failed,
	Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CostQuote {
	pub class_a: u64,
	pub class_b: u64,
	pub free: u64,
	pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultipartUploadItem {
	pub key: String,
	pub upload_id: String,
	pub initiated: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresignResult {
	pub url: String,
	pub expires_in_secs: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CfBucketInfo {
	pub name: String,
	pub location: Option<String>,
	pub storage_class: Option<String>,
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn account_id_rejects_email_and_short_strings() {
		assert!(!is_r2_account_id("1403131830@qq.com"));
		assert!(!is_r2_account_id("abc"));
		assert!(!is_r2_account_id(""));
		assert!(!is_r2_account_id("0123456789abcdef0123456789abcde"));
		assert!(is_r2_account_id("0123456789abcdef0123456789abcdef"));
		assert!(is_r2_account_id("  0123456789ABCDEF0123456789abcdef  "));
	}

	#[test]
	fn profile_last_error_defaults_on_old_json() {
		let json = r#"{
			"id":"p1","name":"n","accountId":"a","accessKeyId":"k",
			"jurisdiction":"default","hasCfToken":false,"capability":"invalid"
		}"#;
		let p: Profile = serde_json::from_str(json).unwrap();
		assert_eq!(p.last_error, None);
	}
}
