use crate::commands::live_client;
use crate::error::AppResult;
use crate::models::{BucketItem, ListObjectsPage, ObjectDetail};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_buckets(
	state: State<'_, AppState>,
	profile_id: String,
) -> AppResult<Vec<BucketItem>> {
	live_client(&state, &profile_id).await?.list_buckets().await
}

#[tauri::command]
pub async fn list_objects(
	state: State<'_, AppState>,
	profile_id: String,
	bucket: String,
	prefix: String,
	continuation_token: Option<String>,
) -> AppResult<ListObjectsPage> {
	live_client(&state, &profile_id)
		.await?
		.list_objects(&bucket, &prefix, continuation_token)
		.await
}

#[tauri::command]
pub async fn head_object(
	state: State<'_, AppState>,
	profile_id: String,
	bucket: String,
	key: String,
) -> AppResult<ObjectDetail> {
	live_client(&state, &profile_id)
		.await?
		.head_object(&bucket, &key)
		.await
}

#[tauri::command]
pub async fn quote_list_all(object_count: u64) -> AppResult<crate::models::CostQuote> {
	let class_a = crate::cost::list_pages_for(object_count);
	Ok(crate::models::CostQuote {
		class_a,
		class_b: 0,
		free: 0,
		note: format!(
			"Listing ~{object_count} keys takes {class_a} Class A ListObjectsV2 calls (1000 keys each)."
		),
	})
}
