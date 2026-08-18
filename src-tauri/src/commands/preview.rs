use crate::commands::live_client;
use crate::error::{AppError, AppResult};
use crate::models::PresignResult;
use crate::state::AppState;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

const PREVIEW_MAX_BYTES: i64 = 8 * 1024 * 1024;

fn safe_seg(s: &str) -> String {
	s.chars()
		.map(|c| {
			if c.is_ascii_alphanumeric() || c == '.' || c == '-' {
				c
			} else {
				'_'
			}
		})
		.take(80)
		.collect()
}

fn preview_dest(cache: &Path, profile_id: &str, bucket: &str, key: &str) -> PathBuf {
	cache
		.join("preview")
		.join(safe_seg(profile_id))
		.join(safe_seg(bucket))
		.join(safe_seg(key))
}

#[tauri::command]
pub async fn preview_object(
	app: AppHandle,
	state: State<'_, AppState>,
	profile_id: String,
	bucket: String,
	key: String,
) -> AppResult<String> {
	let cache = app
		.path()
		.app_cache_dir()
		.map_err(|e| AppError::Io(e.to_string()))?;
	let dest = preview_dest(&cache, &profile_id, &bucket, &key);
	if let Some(parent) = dest.parent() {
		tokio::fs::create_dir_all(parent).await?;
	}
	let client = live_client(&state, &profile_id).await?;
	let head = client.head_object(&bucket, &key).await?;
	if head.size > PREVIEW_MAX_BYTES {
		return Err(AppError::R2Constraint(format!(
			"preview limited to {PREVIEW_MAX_BYTES} bytes"
		)));
	}
	state
		.transfers
		.download_silent(&client, &bucket, &key, dest.clone())
		.await?;
	Ok(dest.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn presign_get(
	state: State<'_, AppState>,
	profile_id: String,
	bucket: String,
	key: String,
	expires_in_secs: u32,
) -> AppResult<PresignResult> {
	let expires = expires_in_secs.clamp(1, 604_800);
	let client = live_client(&state, &profile_id).await?;
	let config =
		aws_sdk_s3::presigning::PresigningConfig::expires_in(Duration::from_secs(expires as u64))
			.map_err(|e| AppError::Other(e.to_string()))?;
	let url = client
		.raw()
		.get_object()
		.bucket(bucket)
		.key(key)
		.presigned(config)
		.await
		.map_err(crate::s3::sdk_err)?;
	Ok(PresignResult {
		url: url.uri().to_string(),
		expires_in_secs: expires,
	})
}

#[cfg(test)]
mod tests {
	use super::*;
	use std::path::Path;

	#[test]
	fn cache_path_includes_profile_and_bucket() {
		let dest = preview_dest(Path::new("/tmp"), "p1", "video", "a/b.mp4");
		assert!(dest.ends_with("preview/p1/video/a_b.mp4"));
	}
}
