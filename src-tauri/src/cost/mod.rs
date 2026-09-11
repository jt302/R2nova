//! Class A / B / 免费操作分类。浏览是 Class A，比下载贵 12.5 倍。

use chrono::{DateTime, Datelike, Days, Months, TimeZone, Utc};
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

/// 线性边际估算：Class A $4.50 / 百万，Class B $0.36 / 百万。未扣免费额度。
/// Cloudflare 实际按月汇总后向上取整到百万，不适用于会话计数。
pub fn estimate_usd(class_a: u64, class_b: u64) -> f64 {
	class_a as f64 * 4.50 / 1_000_000.0 + class_b as f64 * 0.36 / 1_000_000.0
}

/// GraphQL `actionType` → 计费档。未知操作返回 `None`。
pub fn classify_action(action: &str) -> Option<OpClass> {
	match action {
		"ListBuckets"
		| "PutBucket"
		| "CreateBucket"
		| "ListObjects"
		| "ListObjectsV2"
		| "PutObject"
		| "CopyObject"
		| "CompleteMultipartUpload"
		| "CreateMultipartUpload"
		| "LifecycleStorageTierTransition"
		| "ListMultipartUploads"
		| "UploadPart"
		| "UploadPartCopy"
		| "ListParts"
		| "PutBucketEncryption"
		| "PutBucketCors"
		| "PutBucketLifecycleConfiguration" => Some(OpClass::A),
		"HeadBucket"
		| "HeadObject"
		| "GetObject"
		| "UsageSummary"
		| "GetBucketEncryption"
		| "GetBucketLocation"
		| "GetBucketCors"
		| "GetBucketLifecycleConfiguration" => Some(OpClass::B),
		"DeleteObject" | "DeleteObjects" | "DeleteBucket" | "AbortMultipartUpload" => {
			Some(OpClass::Free)
		}
		_ => None,
	}
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpsUsage {
	pub from: String,
	pub to: String,
	pub class_a: u64,
	pub class_b: u64,
	pub free: u64,
	pub other: u64,
}

fn utc_ymd(year: i32, month: u32, day: u32) -> DateTime<Utc> {
	Utc.with_ymd_and_hms(year, month, day, 0, 0, 0)
		.single()
		.unwrap_or_else(Utc::now)
}

fn last_day_of_month(year: i32, month: u32) -> u32 {
	utc_ymd(year, month, 1)
		.checked_add_months(Months::new(1))
		.and_then(|next| next.checked_sub_days(Days::new(1)))
		.map(|d| d.day())
		.unwrap_or(28)
}

fn period_start(year: i32, month: u32, day: u8) -> DateTime<Utc> {
	let last = last_day_of_month(year, month);
	utc_ymd(year, month, u32::from(day).clamp(1, last))
}

/// 计费周期：起点为本月或上月的起始日 00:00 UTC，终点为下一次起始日。
pub fn billing_period(now: DateTime<Utc>, day: u8) -> (DateTime<Utc>, DateTime<Utc>) {
	let day = day.clamp(1, 31);
	let this_start = period_start(now.year(), now.month(), day);
	let start = if now >= this_start {
		this_start
	} else {
		let prev = this_start
			.checked_sub_months(Months::new(1))
			.unwrap_or(this_start);
		period_start(prev.year(), prev.month(), day)
	};
	let next = start.checked_add_months(Months::new(1)).unwrap_or(start);
	let end = period_start(next.year(), next.month(), day);
	(start, end)
}

pub fn summarize_actions(actions: impl Iterator<Item = (impl AsRef<str>, u64)>) -> OpsUsage {
	let mut usage = OpsUsage::default();
	for (action, count) in actions {
		match classify_action(action.as_ref()) {
			Some(OpClass::A) => usage.class_a += count,
			Some(OpClass::B) => usage.class_b += count,
			Some(OpClass::Free) => usage.free += count,
			None => usage.other += count,
		}
	}
	usage
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
	fn estimate_is_linear() {
		assert!((estimate_usd(1_000_000, 0) - 4.50).abs() < 1e-12);
		assert!((estimate_usd(0, 1_000_000) - 0.36).abs() < 1e-12);
		assert!((estimate_usd(21, 44) - 0.00011034).abs() < 1e-10);
		assert!(estimate_usd(0, 0).abs() < 1e-12);
	}

	#[test]
	fn classify_action_maps_pricing_names() {
		assert_eq!(classify_action("ListObjects"), Some(OpClass::A));
		assert_eq!(classify_action("GetObject"), Some(OpClass::B));
		assert_eq!(classify_action("DeleteObject"), Some(OpClass::Free));
		assert_eq!(classify_action("UnknownOp"), None);
	}

	#[test]
	fn summarize_actions_buckets_unknown() {
		let usage = summarize_actions(
			[
				("ListObjects", 10_u64),
				("GetObject", 20),
				("DeleteObject", 3),
				("WeirdOp", 7),
			]
			.into_iter(),
		);
		assert_eq!(usage.class_a, 10);
		assert_eq!(usage.class_b, 20);
		assert_eq!(usage.free, 3);
		assert_eq!(usage.other, 7);
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
		assert!((snap.estimated_usd - 9.36e-6).abs() < 1e-12);
	}

	fn ymd(year: i32, month: u32, day: u32) -> DateTime<Utc> {
		Utc.with_ymd_and_hms(year, month, day, 12, 0, 0)
			.single()
			.expect("valid utc")
	}

	#[test]
	fn billing_period_after_start_day() {
		let (from, to) = billing_period(ymd(2026, 9, 11), 10);
		assert_eq!(from.date_naive().to_string(), "2026-09-10");
		assert_eq!(to.date_naive().to_string(), "2026-10-10");
	}

	#[test]
	fn billing_period_before_start_day() {
		let (from, to) = billing_period(ymd(2026, 9, 5), 10);
		assert_eq!(from.date_naive().to_string(), "2026-08-10");
		assert_eq!(to.date_naive().to_string(), "2026-09-10");
	}

	#[test]
	fn billing_period_clamps_day_31() {
		let (from, to) = billing_period(ymd(2026, 3, 1), 31);
		assert_eq!(from.date_naive().to_string(), "2026-02-28");
		assert_eq!(to.date_naive().to_string(), "2026-03-31");
	}

	#[test]
	fn billing_period_day_one_is_calendar_month() {
		let (from, to) = billing_period(ymd(2026, 9, 11), 1);
		assert_eq!(from.date_naive().to_string(), "2026-09-01");
		assert_eq!(to.date_naive().to_string(), "2026-10-01");
	}
}
