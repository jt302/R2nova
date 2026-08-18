use crate::commands::live_client;
use crate::error::{AppError, AppResult};
use crate::models::PresignResult;
use crate::state::AppState;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

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
	let safe: String = key
		.chars()
		.map(|c| {
			if c.is_ascii_alphanumeric() || c == '.' {
				c
			} else {
				'_'
			}
		})
		.collect();
	let dest = cache.join("preview").join(safe);
	if let Some(parent) = dest.parent() {
		tokio::fs::create_dir_all(parent).await?;
	}
	let client = live_client(&state, &profile_id).await?;
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
