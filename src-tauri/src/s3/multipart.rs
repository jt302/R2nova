//! R2 分片大小：非末尾分片必须等长，最小 5 MiB，最多 10_000 片。
//! 见 docs/r2-constraints.md。

pub const MIN_PART: u64 = 5 * 1024 * 1024;
pub const DEFAULT_PART: u64 = 8 * 1024 * 1024;
pub const MAX_PARTS: u64 = 10_000;
pub const MIB: u64 = 1024 * 1024;
/// 超过此体积走分片上传；文档建议单次 PUT 适合 ~100 MB 以下。
pub const MULTIPART_THRESHOLD: u64 = 100 * 1024 * 1024;
pub const SINGLE_PUT_MAX: u64 = 5 * 1024 * 1024 * 1024;
pub const COPY_MAX: u64 = 5 * 1024 * 1024 * 1024;

/// 固定分片大小：`max(8 MiB, ceil(size / 10000))` 再向上取整到 MiB。
pub fn part_size(object_size: u64) -> u64 {
	if object_size == 0 {
		return DEFAULT_PART;
	}
	let min_for_max_parts = object_size.div_ceil(MAX_PARTS);
	let raw = DEFAULT_PART.max(min_for_max_parts);
	let rounded = raw.div_ceil(MIB) * MIB;
	rounded.max(MIN_PART)
}

pub fn part_count(object_size: u64, chunk: u64) -> u64 {
	if object_size == 0 || chunk == 0 {
		return 1;
	}
	object_size.div_ceil(chunk)
}

pub fn should_multipart(object_size: u64) -> bool {
	object_size > MULTIPART_THRESHOLD || object_size > SINGLE_PUT_MAX
}

/// 第 `part_number`（从 1 起）这一片的字节范围 `[start, end)`。
pub fn part_range(object_size: u64, chunk: u64, part_number: u64) -> (u64, u64) {
	let start = (part_number - 1) * chunk;
	let end = (start + chunk).min(object_size);
	(start, end)
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn small_file_uses_default_8mib() {
		assert_eq!(part_size(1), DEFAULT_PART);
		assert_eq!(part_size(DEFAULT_PART), DEFAULT_PART);
	}

	#[test]
	fn huge_file_grows_chunk_to_stay_under_10000_parts() {
		let size = 80 * 1024 * 1024 * 1024; // 80 GiB
		let chunk = part_size(size);
		assert!(chunk >= MIN_PART);
		assert!(part_count(size, chunk) <= MAX_PARTS);
		assert_eq!(chunk % MIB, 0);
	}

	#[test]
	fn all_non_trailing_parts_are_equal() {
		let size = 123 * 1024 * 1024 + 17;
		let chunk = part_size(size);
		let n = part_count(size, chunk);
		for i in 1..n {
			let (start, end) = part_range(size, chunk, i);
			assert_eq!(end - start, chunk, "part {i} must be exactly chunk-sized");
		}
		let (start, end) = part_range(size, chunk, n);
		assert!(end - start <= chunk);
		assert!(end - start > 0);
		assert_eq!(end, size);
	}

	#[test]
	fn last_part_is_not_larger_than_previous() {
		let size = DEFAULT_PART * 3 + 1;
		let chunk = part_size(size);
		let n = part_count(size, chunk);
		let (_, last_end) = part_range(size, chunk, n);
		let (prev_start, prev_end) = part_range(size, chunk, n - 1);
		assert!(last_end - (n - 1) * chunk <= prev_end - prev_start);
	}

	#[test]
	fn threshold_boundary() {
		assert!(!should_multipart(MULTIPART_THRESHOLD));
		assert!(should_multipart(MULTIPART_THRESHOLD + 1));
		assert!(should_multipart(SINGLE_PUT_MAX));
	}
}
