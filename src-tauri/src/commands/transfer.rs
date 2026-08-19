use crate::commands::live_client;
use crate::error::{AppError, AppResult};
use crate::models::{TransferDirection, TransferStatus};
use crate::s3::keys::join_key;
use crate::state::AppState;
use crate::transfer::TransferEvent;
use futures_util::future::join_all;
use serde::Deserialize;
use std::path::{Path, PathBuf};
use tauri::ipc::Channel;
use tauri::State;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadObjectItem {
	pub key: String,
	pub dest: String,
	#[serde(default)]
	pub bytes_total: u64,
}

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
	let mut jobs = Vec::new();
	for path in paths {
		let p = PathBuf::from(&path);
		if p.is_dir() {
			jobs.extend(collect_dir_uploads(&prefix, &p).await?);
		} else {
			let name = p
				.file_name()
				.and_then(|s| s.to_str())
				.ok_or_else(|| AppError::Io("invalid file name".into()))?;
			jobs.push((join_key(&prefix, name), p));
		}
	}
	let mut ids = Vec::new();
	for (key, path) in jobs {
		ids.push(
			state
				.transfers
				.enqueue_upload(&profile_id, &bucket, &key, path, Some(&on_event), None)
				.await?,
		);
	}
	join_all(
		ids.iter()
			.map(|id| state.transfers.run_upload(&client, id, on_event.clone())),
	)
	.await;
	Ok(ids)
}

async fn collect_dir_uploads(prefix: &str, root: &Path) -> AppResult<Vec<(String, PathBuf)>> {
	let root_name = root.file_name().map(|s| s.to_os_string());
	let mut jobs = Vec::new();
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
			jobs.push((join_key(prefix, &rel_str), path));
		}
	}
	Ok(jobs)
}

#[tauri::command]
pub async fn download_object(
	state: State<'_, AppState>,
	profile_id: String,
	bucket: String,
	key: String,
	dest: String,
	unique: bool,
	bytes_total: Option<u64>,
	on_event: Channel<TransferEvent>,
) -> AppResult<String> {
	let client = live_client(&state, &profile_id).await?;
	state
		.transfers
		.download_file(
			&client,
			&profile_id,
			&bucket,
			&key,
			PathBuf::from(dest),
			unique,
			None,
			bytes_total.unwrap_or(0),
			on_event,
		)
		.await
}

#[tauri::command]
pub async fn download_objects(
	state: State<'_, AppState>,
	profile_id: String,
	bucket: String,
	items: Vec<DownloadObjectItem>,
	unique: bool,
	on_event: Channel<TransferEvent>,
) -> AppResult<Vec<String>> {
	let client = live_client(&state, &profile_id).await?;
	let mut ids = Vec::new();
	for item in items {
		ids.push(
			state
				.transfers
				.enqueue_download(
					&profile_id,
					&bucket,
					&item.key,
					PathBuf::from(item.dest),
					unique,
					item.bytes_total,
					None,
					Some(&on_event),
				)
				.await?,
		);
	}
	join_all(
		ids.iter()
			.map(|id| state.transfers.run_download(&client, id, on_event.clone())),
	)
	.await;
	Ok(ids)
}

#[tauri::command]
pub async fn set_transfer_concurrency(
	state: State<'_, AppState>,
	concurrency: u32,
) -> AppResult<()> {
	state.transfers.set_job_limit(concurrency as usize).await;
	Ok(())
}

#[tauri::command]
pub async fn list_transfers(
	state: State<'_, AppState>,
) -> AppResult<Vec<crate::models::TransferProgress>> {
	Ok(state.transfers.list().await)
}

#[tauri::command]
pub async fn dismiss_transfer(state: State<'_, AppState>, transfer_id: String) -> AppResult<()> {
	state.transfers.dismiss(&transfer_id).await
}

#[tauri::command]
pub async fn cancel_transfer(state: State<'_, AppState>, transfer_id: String) -> AppResult<()> {
	let job = state.transfers.get(&transfer_id).await;
	let client = match job {
		Some(job) if !job.profile_id.is_empty() => live_client(&state, &job.profile_id).await.ok(),
		_ => None,
	};
	state.transfers.cancel(&transfer_id, client.as_ref()).await;
	Ok(())
}

#[tauri::command]
pub async fn pause_transfer(state: State<'_, AppState>, transfer_id: String) -> AppResult<()> {
	state.transfers.pause(&transfer_id).await;
	Ok(())
}

#[tauri::command]
pub async fn resume_transfer(
	state: State<'_, AppState>,
	transfer_id: String,
	on_event: Channel<TransferEvent>,
) -> AppResult<String> {
	let job = state
		.transfers
		.get(&transfer_id)
		.await
		.ok_or_else(|| AppError::NotFound("transfer not found".into()))?;
	if job.status != TransferStatus::Paused
		&& job.status != TransferStatus::Failed
		&& job.status != TransferStatus::Queued
	{
		return Err(AppError::Other("transfer is not resumable".into()));
	}
	if job.profile_id.is_empty() || job.bucket.is_empty() {
		return Err(AppError::Other(
			"transfer is missing profile or bucket".into(),
		));
	}
	if state.transfers.resume_signal(&transfer_id).await {
		return Ok(transfer_id);
	}
	let client = live_client(&state, &job.profile_id).await?;
	match job.direction {
		TransferDirection::Upload => {
			state
				.transfers
				.run_upload(&client, &job.transfer_id, on_event)
				.await
		}
		TransferDirection::Download => {
			state
				.transfers
				.run_download(&client, &job.transfer_id, on_event)
				.await
		}
	}
}
