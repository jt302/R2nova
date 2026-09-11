use crate::error::{AppError, AppResult};
use crate::models::{normalize_avatar_emoji, Profile, ProfileAvatar};
use image::imageops::FilterType;
use image::{GenericImageView, ImageFormat, ImageReader, Limits};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const MAX_SOURCE_BYTES: u64 = 25 * 1024 * 1024;
const MAX_DIMENSION: u32 = 8192;
const OUTPUT_SIZE: u32 = 256;

pub fn resolve_avatar(
	avatar: Option<ProfileAvatar>,
	dir: &Path,
) -> AppResult<Option<ProfileAvatar>> {
	match avatar {
		None => Ok(None),
		Some(ProfileAvatar::Emoji { value }) => Ok(Some(ProfileAvatar::Emoji {
			value: normalize_avatar_emoji(&value)?,
		})),
		Some(ProfileAvatar::Image { path }) => {
			let path = validate_image_path(&path, dir)?;
			Ok(Some(ProfileAvatar::Image {
				path: path.to_string_lossy().into_owned(),
			}))
		}
	}
}

pub fn image_path(avatar: &Option<ProfileAvatar>) -> Option<&str> {
	match avatar {
		Some(ProfileAvatar::Image { path }) => Some(path.as_str()),
		_ => None,
	}
}

pub fn remove_avatar_file(avatar: &Option<ProfileAvatar>) {
	if let Some(path) = image_path(avatar) {
		remove_image(path);
	}
}

pub fn replace_avatar(old: &Option<ProfileAvatar>, new: &Option<ProfileAvatar>) {
	let Some(old_path) = image_path(old) else {
		return;
	};
	if let Some(new_path) = image_path(new) {
		if paths_eq(old_path, new_path) {
			return;
		}
	}
	remove_image(old_path);
}

pub fn remove_image(path: &str) {
	let _ = std::fs::remove_file(path);
}

pub fn import_image(source: &Path, dir: &Path) -> AppResult<PathBuf> {
	let meta = std::fs::metadata(source)?;
	if !meta.is_file() {
		return Err(AppError::Other("avatar source is not a file".into()));
	}
	if meta.len() > MAX_SOURCE_BYTES {
		return Err(AppError::Other(
			"avatar image must be 25 MiB or smaller".into(),
		));
	}

	let mut reader = ImageReader::open(source).map_err(|e| AppError::Io(e.to_string()))?;
	reader = reader
		.with_guessed_format()
		.map_err(|e| AppError::Other(e.to_string()))?;
	let mut limits = Limits::default();
	limits.max_image_width = Some(MAX_DIMENSION);
	limits.max_image_height = Some(MAX_DIMENSION);
	reader.limits(limits);
	// image 0.25 applies EXIF orientation inside decode().
	let img = reader
		.decode()
		.map_err(|e| AppError::Other(format!("cannot decode image: {e}")))?;
	let (width, height) = img.dimensions();
	if width == 0 || height == 0 {
		return Err(AppError::Other("avatar image has no pixels".into()));
	}
	let side = width.min(height);
	let x = (width - side) / 2;
	let y = (height - side) / 2;
	let cropped = img.crop_imm(x, y, side, side);
	let resized = cropped.resize_exact(OUTPUT_SIZE, OUTPUT_SIZE, FilterType::Lanczos3);

	std::fs::create_dir_all(dir)?;
	let dest = dir.join(format!("{}.png", Uuid::new_v4()));
	let tmp = dir.join(format!(
		"{}.png.tmp",
		dest.file_stem()
			.and_then(|s| s.to_str())
			.unwrap_or("avatar")
	));
	resized
		.save_with_format(&tmp, ImageFormat::Png)
		.map_err(|e| {
			let _ = std::fs::remove_file(&tmp);
			AppError::Io(e.to_string())
		})?;
	if let Err(e) = std::fs::rename(&tmp, &dest) {
		let _ = std::fs::remove_file(&tmp);
		return Err(e.into());
	}
	Ok(dest.canonicalize().unwrap_or(dest))
}

pub fn validate_image_path(path: &str, dir: &Path) -> AppResult<PathBuf> {
	let dir = dir
		.canonicalize()
		.map_err(|e| AppError::Other(format!("avatars directory: {e}")))?;
	let canon = Path::new(path).canonicalize().map_err(|_| {
		AppError::Other("avatar image must be a PNG inside the app avatars directory".into())
	})?;
	if !canon.is_file() {
		return Err(AppError::Other(
			"avatar image must be a PNG inside the app avatars directory".into(),
		));
	}
	let is_png = canon
		.extension()
		.and_then(|ext| ext.to_str())
		.is_some_and(|ext| ext.eq_ignore_ascii_case("png"));
	if !is_png || !canon.starts_with(&dir) {
		return Err(AppError::Other(
			"avatar image must be a PNG inside the app avatars directory".into(),
		));
	}
	Ok(canon)
}

pub fn referenced_paths(profiles: &[Profile]) -> HashSet<PathBuf> {
	profiles
		.iter()
		.filter_map(|profile| match &profile.avatar {
			Some(ProfileAvatar::Image { path }) => {
				let path = PathBuf::from(path);
				Some(path.canonicalize().unwrap_or(path))
			}
			_ => None,
		})
		.collect()
}

pub fn gc(dir: &Path, referenced: &HashSet<PathBuf>) {
	let Ok(entries) = std::fs::read_dir(dir) else {
		return;
	};
	for entry in entries.flatten() {
		let path = entry.path();
		let is_png = path
			.extension()
			.and_then(|ext| ext.to_str())
			.is_some_and(|ext| ext.eq_ignore_ascii_case("png"));
		if !is_png {
			continue;
		}
		let canon = path.canonicalize().unwrap_or_else(|_| path.clone());
		if referenced.contains(&canon) || referenced.contains(&path) {
			continue;
		}
		let _ = std::fs::remove_file(&path);
	}
}

fn paths_eq(left: &str, right: &str) -> bool {
	if left == right {
		return true;
	}
	match (
		Path::new(left).canonicalize(),
		Path::new(right).canonicalize(),
	) {
		(Ok(a), Ok(b)) => a == b,
		_ => false,
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use image::{Rgb, RgbImage};

	fn write_rgb_png(path: &Path, width: u32, height: u32) {
		let mut img = RgbImage::new(width, height);
		for (x, y, pixel) in img.enumerate_pixels_mut() {
			*pixel = Rgb([(x % 256) as u8, (y % 256) as u8, 80]);
		}
		img.save(path).unwrap();
	}

	#[test]
	fn import_image_center_crops_and_resizes() {
		let dir = tempfile::tempdir().unwrap();
		let source = dir.path().join("src.png");
		write_rgb_png(&source, 300, 200);
		let dest = import_image(&source, &dir.path().join("out")).unwrap();
		let loaded = image::open(&dest).unwrap();
		assert_eq!(loaded.dimensions(), (OUTPUT_SIZE, OUTPUT_SIZE));
		assert_eq!(dest.extension().and_then(|e| e.to_str()).unwrap(), "png");
	}

	#[test]
	fn validate_image_path_rejects_outside_dir() {
		let inside = tempfile::tempdir().unwrap();
		let outside = tempfile::tempdir().unwrap();
		let allowed = inside.path().join("ok.png");
		let denied = outside.path().join("no.png");
		write_rgb_png(&allowed, 8, 8);
		write_rgb_png(&denied, 8, 8);
		assert!(validate_image_path(allowed.to_str().unwrap(), inside.path()).is_ok());
		assert!(validate_image_path(denied.to_str().unwrap(), inside.path()).is_err());
	}

	#[test]
	fn gc_removes_unreferenced_png_only() {
		let dir = tempfile::tempdir().unwrap();
		let keep = dir.path().join("keep.png");
		let drop = dir.path().join("drop.png");
		let notes = dir.path().join("notes.txt");
		std::fs::write(&keep, b"keep").unwrap();
		std::fs::write(&drop, b"drop").unwrap();
		std::fs::write(&notes, b"notes").unwrap();
		let mut referenced = HashSet::new();
		referenced.insert(keep.canonicalize().unwrap());
		gc(dir.path(), &referenced);
		assert!(keep.exists());
		assert!(!drop.exists());
		assert!(notes.exists());
	}

	#[test]
	fn resolve_avatar_normalizes_emoji() {
		let dir = tempfile::tempdir().unwrap();
		let avatar = resolve_avatar(
			Some(ProfileAvatar::Emoji {
				value: " ☁️ ".into(),
			}),
			dir.path(),
		)
		.unwrap();
		assert_eq!(
			avatar,
			Some(ProfileAvatar::Emoji {
				value: "☁️".into()
			})
		);
	}
}
