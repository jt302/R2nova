use crate::commands::live_client;
use crate::error::{AppError, AppResult};
use crate::s3::keys::join_key;
use crate::state::AppState;
use crate::transfer::TransferEvent;
use std::path::{Path, PathBuf};
use tauri::ipc::Channel;
use tauri::State;

#[tauri::command]
pub async fn upload_paths(
	state: State<'_, AppState>,
	profile_id: String,
	bucket: String,
	prefix: String,
	paths: Vec<String>,
	on_event: Channel<TransferEvent>,
) -> AppResult<Vec<String>> {
	let client = live_client(&state, &profile_id).await?;
	let mut ids = Vec::new();
	for path in paths {
		let p = PathBuf::from(&path);
		if p.is_dir() {
			ids.extend(upload_dir(&state, &client, &bucket, &prefix, &p, &on_event).await?);
		} else {
			let name = p
				.file_name()
				.and_then(|s| s.to_str())
				.ok_or_else(|| AppError::Io("invalid file name".into()))?;
			let key = join_key(&prefix, name);
			ids.push(
				state
					.transfers
					.upload_file(&client, &bucket, &key, p, on_event.clone())
					.await?,
			);
		}
	}
	Ok(ids)
}

async fn upload_dir(
	state: &State<'_, AppState>,
	client: &crate::s3::LiveClient,
	bucket: &str,
	prefix: &str,
	root: &Path,
	on_event: &Channel<TransferEvent>,
) -> AppResult<Vec<String>> {
	let root_name = root.file_name().map(|s| s.to_os_string());
	let mut ids = Vec::new();
	let mut stack = vec![root.to_path_buf()];
	while let Some(dir) = stack.pop() {
		let mut rd = tokio::fs::read_dir(&dir).await?;
		while let Some(entry) = rd.next_entry().await? {
			let path = entry.path();
			if path.is_dir() {
				stack.push(path);
				continue;
			}
			let rel = path.strip_prefix(root).unwrap_or(&path);
			let mut key_rel = PathBuf::new();
			if let Some(name) = &root_name {
				key_rel.push(name);
			}
			key_rel.push(rel);
			let rel_str = key_rel.to_string_lossy().replace('\\', "/");
			let key = join_key(prefix, &rel_str);
			ids.push(
				state
					.transfers
					.upload_file(client, bucket, &key, path, on_event.clone())
					.await?,
			);
		}
	}
	Ok(ids)
}

#[tauri::command]
pub async fn download_object(
	state: State<'_, AppState>,
	profile_id: String,
	bucket: String,
	key: String,
	dest: String,
	on_event: Channel<TransferEvent>,
) -> AppResult<String> {
	let client = live_client(&state, &profile_id).await?;
	state
		.transfers
		.download_file(&client, &bucket, &key, PathBuf::from(dest), on_event)
		.await
}

#[tauri::command]
pub async fn list_transfers(
	state: State<'_, AppState>,
) -> AppResult<Vec<crate::models::TransferProgress>> {
	Ok(state.transfers.list().await)
}

#[tauri::command]
pub async fn cancel_transfer(state: State<'_, AppState>, transfer_id: String) -> AppResult<()> {
	state.transfers.cancel(&transfer_id).await;
	Ok(())
}
