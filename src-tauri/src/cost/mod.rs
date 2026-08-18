//! Class A / B / 免费操作分类。浏览是 Class A，比下载贵 12.5 倍。

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OpClass {
	A,
	B,
	Free,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum S3Op {
	ListBuckets,
	ListObjectsV2,
	PutObject,
	CopyObject,
	CreateMultipartUpload,
	CompleteMultipartUpload,
	ListMultipartUploads,
	UploadPart,
	UploadPartCopy,
	ListParts,
	PutBucketCors,
	PutBucketLifecycle,
	HeadBucket,
	HeadObject,
	GetObject,
	GetBucketCors,
	GetBucketLifecycle,
	GetBucketLocation,
	GetBucketEncryption,
	DeleteObject,
	DeleteObjects,
	DeleteBucket,
	AbortMultipartUpload,
	CreateBucket,
}

pub fn classify(op: S3Op) -> OpClass {
	match op {
		S3Op::ListBuckets
		| S3Op::ListObjectsV2
		| S3Op::PutObject
		| S3Op::CopyObject
		| S3Op::CreateMultipartUpload
		| S3Op::CompleteMultipartUpload
		| S3Op::ListMultipartUploads
		| S3Op::UploadPart
		| S3Op::UploadPartCopy
		| S3Op::ListParts
		| S3Op::PutBucketCors
		| S3Op::PutBucketLifecycle
		| S3Op::CreateBucket => OpClass::A,
		S3Op::HeadBucket
		| S3Op::HeadObject
		| S3Op::GetObject
		| S3Op::GetBucketCors
		| S3Op::GetBucketLifecycle
		| S3Op::GetBucketLocation
		| S3Op::GetBucketEncryption => OpClass::B,
		S3Op::DeleteObject
		| S3Op::DeleteObjects
		| S3Op::DeleteBucket
		| S3Op::AbortMultipartUpload => OpClass::Free,
	}
}

/// Standard 定价：Class A $4.50 / 百万，Class B $0.36 / 百万。按百万次向上取整。
pub fn estimate_usd(class_a: u64, class_b: u64) -> f64 {
	let a_blocks = class_a.div_ceil(1_000_000) as f64;
	let b_blocks = class_b.div_ceil(1_000_000) as f64;
	a_blocks * 4.50 + b_blocks * 0.36
}

/// 列举一个 prefix 下全部对象需要的 Class A 次数（每页 1000）。
pub fn list_pages_for(object_count: u64) -> u64 {
	object_count.div_ceil(1000).max(1)
}

#[derive(Debug, Default)]
pub struct CostCounter {
	class_a: AtomicU64,
	class_b: AtomicU64,
	free: AtomicU64,
}

impl CostCounter {
	pub fn record(&self, op: S3Op) {
		match classify(op) {
			OpClass::A => {
				self.class_a.fetch_add(1, Ordering::Relaxed);
			}
			OpClass::B => {
				self.class_b.fetch_add(1, Ordering::Relaxed);
			}
			OpClass::Free => {
				self.free.fetch_add(1, Ordering::Relaxed);
			}
		}
	}

	pub fn snapshot(&self) -> CostSnapshot {
		let class_a = self.class_a.load(Ordering::Relaxed);
		let class_b = self.class_b.load(Ordering::Relaxed);
		CostSnapshot {
			class_a,
			class_b,
			free: self.free.load(Ordering::Relaxed),
			estimated_usd: estimate_usd(class_a, class_b),
		}
	}

	pub fn reset(&self) {
		self.class_a.store(0, Ordering::Relaxed);
		self.class_b.store(0, Ordering::Relaxed);
		self.free.store(0, Ordering::Relaxed);
	}
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CostSnapshot {
	pub class_a: u64,
	pub class_b: u64,
	pub free: u64,
	pub estimated_usd: f64,
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn browsing_is_class_a() {
		assert_eq!(classify(S3Op::ListObjectsV2), OpClass::A);
		assert_eq!(classify(S3Op::GetObject), OpClass::B);
		assert_eq!(classify(S3Op::DeleteObject), OpClass::Free);
		assert_eq!(classify(S3Op::AbortMultipartUpload), OpClass::Free);
	}

	#[test]
	fn billing_rounds_up_to_million() {
		assert_eq!(estimate_usd(1, 0), 4.50);
		assert_eq!(estimate_usd(1_000_000, 0), 4.50);
		assert_eq!(estimate_usd(1_000_001, 0), 9.00);
		assert_eq!(estimate_usd(0, 1), 0.36);
	}

	#[test]
	fn list_pages() {
		assert_eq!(list_pages_for(1), 1);
		assert_eq!(list_pages_for(1000), 1);
		assert_eq!(list_pages_for(1001), 2);
	}

	#[test]
	fn counter_records() {
		let c = CostCounter::default();
		c.record(S3Op::ListObjectsV2);
		c.record(S3Op::ListObjectsV2);
		c.record(S3Op::GetObject);
		c.record(S3Op::DeleteObject);
		let snap = c.snapshot();
		assert_eq!(snap.class_a, 2);
		assert_eq!(snap.class_b, 1);
		assert_eq!(snap.free, 1);
		assert_eq!(snap.estimated_usd, 4.86);
	}
}
