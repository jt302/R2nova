use crate::commands::live_client;
use crate::error::AppResult;
use crate::models::CostQuote;
use crate::s3::keys::join_key;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn delete_objects(
	state: State<'_, AppState>,
	profile_id: String,
	bucket: String,
	keys: Vec<String>,
) -> AppResult<u64> {
	live_client(&state, &profile_id)
		.await?
		.delete_objects(&bucket, &keys)
		.await
}

#[tauri::command]
pub async fn quote_delete_prefix(object_count: u64) -> AppResult<CostQuote> {
	let class_a = crate::cost::list_pages_for(object_count);
	Ok(CostQuote {
		class_a,
		class_b: 0,
		free: object_count,
		note: "Deletes are free. Listing keys to delete is Class A.".into(),
	})
}

#[tauri::command]
pub async fn delete_prefix(
	state: State<'_, AppState>,
	profile_id: String,
	bucket: String,
	prefix: String,
) -> AppResult<u64> {
	let client = live_client(&state, &profile_id).await?;
	let keys = client.list_all_keys(&bucket, &prefix).await?;
	client.delete_objects(&bucket, &keys).await
}

#[tauri::command]
pub async fn copy_object(
	state: State<'_, AppState>,
	profile_id: String,
	src_bucket: String,
	src_key: String,
	dst_bucket: String,
	dst_key: String,
) -> AppResult<()> {
	live_client(&state, &profile_id)
		.await?
		.copy_object(&src_bucket, &src_key, &dst_bucket, &dst_key)
		.await
}

#[tauri::command]
pub async fn rename_object(
	state: State<'_, AppState>,
	profile_id: String,
	bucket: String,
	src_key: String,
	dst_key: String,
) -> AppResult<()> {
	let client = live_client(&state, &profile_id).await?;
	client
		.copy_object(&bucket, &src_key, &bucket, &dst_key)
		.await?;
	client.delete_objects(&bucket, &[src_key]).await?;
	Ok(())
}

#[tauri::command]
pub async fn move_objects(
	state: State<'_, AppState>,
	profile_id: String,
	bucket: String,
	keys: Vec<String>,
	dst_prefix: String,
) -> AppResult<u64> {
	let client = live_client(&state, &profile_id).await?;
	let mut moved = 0u64;
	for key in keys {
		let name = key.rsplit('/').next().unwrap_or(&key).to_string();
		let dst = join_key(&dst_prefix, &name);
		if dst == key {
			continue;
		}
		client.copy_object(&bucket, &key, &bucket, &dst).await?;
		client.delete_objects(&bucket, &[key]).await?;
		moved += 1;
	}
	Ok(moved)
}

#[tauri::command]
pub async fn list_multipart_uploads(
	state: State<'_, AppState>,
	profile_id: String,
	bucket: String,
) -> AppResult<Vec<crate::models::MultipartUploadItem>> {
	live_client(&state, &profile_id)
		.await?
		.list_multipart(&bucket)
		.await
}

#[tauri::command]
pub async fn abort_multipart_upload(
	state: State<'_, AppState>,
	profile_id: String,
	bucket: String,
	key: String,
	upload_id: String,
) -> AppResult<()> {
	live_client(&state, &profile_id)
		.await?
		.abort_multipart(&bucket, &key, &upload_id)
		.await
}

#[tauri::command]
pub async fn put_object_metadata(
	state: State<'_, AppState>,
	profile_id: String,
	bucket: String,
	key: String,
	metadata: Vec<(String, String)>,
) -> AppResult<()> {
	let client = live_client(&state, &profile_id).await?;
	let source = crate::s3::encode_copy_source(&format!("{bucket}/{key}"));
	client.record(crate::cost::S3Op::CopyObject);
	let mut req = client
		.raw()
		.copy_object()
		.bucket(&bucket)
		.key(&key)
		.copy_source(source)
		.metadata_directive(aws_sdk_s3::types::MetadataDirective::Replace);
	for (k, v) in metadata {
		req = req.metadata(k, v);
	}
	req.send().await.map_err(crate::s3::sdk_err)?;
	Ok(())
}
