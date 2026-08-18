//! 对象 key / prefix 辅助。R2 没有真正的文件夹，只靠 delimiter + prefix 模拟。

/// 规范化目录 prefix：空表示桶根；非空时保证以 `/` 结尾。
pub fn normalize_prefix(prefix: &str) -> String {
	let trimmed = prefix.trim_start_matches('/');
	if trimmed.is_empty() {
		return String::new();
	}
	if trimmed.ends_with('/') {
		trimmed.to_string()
	} else {
		format!("{trimmed}/")
	}
}

/// 从完整 key 取出当前 prefix 下的短名。
pub fn display_name(key: &str, prefix: &str) -> String {
	let rest = key.strip_prefix(prefix).unwrap_or(key);
	rest.trim_end_matches('/').to_string()
}

/// 是否是「伪目录占位对象」（key 以 `/` 结尾，Dashboard 会渲染成无名对象）。
pub fn is_placeholder_dir(key: &str, size: i64) -> bool {
	key.ends_with('/') && size == 0
}

/// 拼接子路径。
pub fn join_key(prefix: &str, name: &str) -> String {
	let prefix = normalize_prefix(prefix);
	let name = name.trim_start_matches('/');
	format!("{prefix}{name}")
}

/// 父目录 prefix。桶根返回空。
#[allow(dead_code)]
pub fn parent_prefix(prefix: &str) -> String {
	let prefix = normalize_prefix(prefix);
	if prefix.is_empty() {
		return String::new();
	}
	let without = prefix.trim_end_matches('/');
	match without.rfind('/') {
		Some(i) => format!("{}/", &without[..i]),
		None => String::new(),
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn normalizes_prefix() {
		assert_eq!(normalize_prefix(""), "");
		assert_eq!(normalize_prefix("foo"), "foo/");
		assert_eq!(normalize_prefix("foo/"), "foo/");
		assert_eq!(normalize_prefix("/foo/bar"), "foo/bar/");
	}

	#[test]
	fn display_name_strips_prefix() {
		assert_eq!(display_name("photos/cat.png", "photos/"), "cat.png");
		assert_eq!(display_name("photos/2024/", "photos/"), "2024");
	}

	#[test]
	fn placeholder_detection() {
		assert!(is_placeholder_dir("photos/", 0));
		assert!(!is_placeholder_dir("photos/", 12));
		assert!(!is_placeholder_dir("photos/cat.png", 0));
	}

	#[test]
	fn parent_of_nested() {
		assert_eq!(parent_prefix("a/b/c/"), "a/b/");
		assert_eq!(parent_prefix("a/"), "");
		assert_eq!(parent_prefix(""), "");
	}
}
