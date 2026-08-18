use serde::Serialize;
use thiserror::Error;

/// 结构化错误。前端按 `kind` 分支，不要解析 message。
#[derive(Debug, Error)]
pub enum AppError {
	#[error("invalid credentials: {0}")]
	InvalidCredentials(String),
	#[error("access denied: {0}")]
	AccessDenied(String),
	#[error("not found: {0}")]
	NotFound(String),
	#[error("conflict: {0}")]
	Conflict(String),
	#[error("rate limited: {0}")]
	RateLimited(String),
	#[error("r2 constraint: {0}")]
	R2Constraint(String),
	#[error("object locked: {0}")]
	ObjectLocked(String),
	#[error("capability insufficient: {0}")]
	Capability(String),
	#[error("io: {0}")]
	Io(String),
	#[error("keyring: {0}")]
	Keyring(String),
	#[error("network: {0}")]
	Network(String),
	#[error("{0}")]
	Other(String),
}

impl AppError {
	pub fn kind(&self) -> &'static str {
		match self {
			Self::InvalidCredentials(_) => "invalidCredentials",
			Self::AccessDenied(_) => "accessDenied",
			Self::NotFound(_) => "notFound",
			Self::Conflict(_) => "conflict",
			Self::RateLimited(_) => "rateLimited",
			Self::R2Constraint(_) => "r2Constraint",
			Self::ObjectLocked(_) => "objectLocked",
			Self::Capability(_) => "capability",
			Self::Io(_) => "io",
			Self::Keyring(_) => "keyring",
			Self::Network(_) => "network",
			Self::Other(_) => "other",
		}
	}

	/// 将 R2 / S3 错误码映射为用户可处理的 kind。
	/// 详见 docs/r2-constraints.md。
	pub fn from_s3_code(code: &str, message: impl Into<String>) -> Self {
		let message = message.into();
		match code {
			"Unauthorized" | "InvalidAccessKeyId" | "ExpiredToken" => {
				Self::InvalidCredentials(message)
			}
			"AccessDenied" | "SignatureDoesNotMatch" | "NotEntitled" => Self::AccessDenied(message),
			"NoSuchKey" | "NoSuchBucket" | "NotFound" => Self::NotFound(message),
			"BucketNotEmpty" | "BucketAlreadyExists" | "BucketConflict" => Self::Conflict(message),
			"TooManyRequests" | "SlowDown" => Self::RateLimited(message),
			"InvalidPart" | "EntityTooSmall" | "EntityTooLarge" => Self::R2Constraint(message),
			"ObjectLockedByBucketPolicy" => Self::ObjectLocked(message),
			_ => Self::Other(format!("{code}: {message}")),
		}
	}
}

impl Serialize for AppError {
	fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
		#[derive(Serialize)]
		struct Payload<'a> {
			kind: &'a str,
			message: String,
		}
		Payload {
			kind: self.kind(),
			message: self.to_string(),
		}
		.serialize(serializer)
	}
}

impl From<std::io::Error> for AppError {
	fn from(value: std::io::Error) -> Self {
		Self::Io(value.to_string())
	}
}

impl From<serde_json::Error> for AppError {
	fn from(value: serde_json::Error) -> Self {
		Self::Other(value.to_string())
	}
}

impl From<reqwest::Error> for AppError {
	fn from(value: reqwest::Error) -> Self {
		Self::Network(value.to_string())
	}
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn maps_invalid_part_to_r2_constraint() {
		let err = AppError::from_s3_code("InvalidPart", "unequal part sizes");
		assert_eq!(err.kind(), "r2Constraint");
	}

	#[test]
	fn maps_unauthorized_to_invalid_credentials() {
		let err = AppError::from_s3_code("Unauthorized", "object token hit REST");
		assert_eq!(err.kind(), "invalidCredentials");
	}

	#[test]
	fn serializes_tagged_payload() {
		let err = AppError::NotFound("missing".into());
		let json = serde_json::to_value(&err).unwrap();
		assert_eq!(json["kind"], "notFound");
		assert!(json["message"].as_str().unwrap().contains("missing"));
	}
}
