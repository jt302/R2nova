use crate::commands::{load_profile, require_admin};
use crate::creds::get_secret;
use crate::error::AppResult;
use crate::models::CfBucketInfo;
use crate::state::AppState;
use serde_json::Value;
use tauri::State;

async fn token(profile_id: &str) -> AppResult<String> {
	get_secret("cf", profile_id)
}

#[tauri::command]
pub async fn cf_list_buckets(
	state: State<'_, AppState>,
	profile_id: String,
) -> AppResult<Vec<CfBucketInfo>> {
	let profile = load_profile(&state, &profile_id).await?;
	require_admin(&profile).await?;
	state
		.cf
		.list_buckets(&token(&profile_id).await?, &profile.account_id)
		.await
}

#[tauri::command]
pub async fn cf_create_bucket(
	state: State<'_, AppState>,
	profile_id: String,
	name: String,
) -> AppResult<()> {
	let profile = load_profile(&state, &profile_id).await?;
	require_admin(&profile).await?;
	state
		.cf
		.create_bucket(&token(&profile_id).await?, &profile.account_id, &name)
		.await
}

#[tauri::command]
pub async fn cf_delete_bucket(
	state: State<'_, AppState>,
	profile_id: String,
	name: String,
) -> AppResult<()> {
	let profile = load_profile(&state, &profile_id).await?;
	require_admin(&profile).await?;
	state
		.cf
		.delete_bucket(&token(&profile_id).await?, &profile.account_id, &name)
		.await
}

#[tauri::command]
pub async fn cf_get_cors(
	state: State<'_, AppState>,
	profile_id: String,
	bucket: String,
) -> AppResult<Value> {
	let profile = load_profile(&state, &profile_id).await?;
	require_admin(&profile).await?;
	state
		.cf
		.get_cors(&token(&profile_id).await?, &profile.account_id, &bucket)
		.await
}

#[tauri::command]
pub async fn cf_put_cors(
	state: State<'_, AppState>,
	profile_id: String,
	bucket: String,
	rules: Value,
) -> AppResult<()> {
	let profile = load_profile(&state, &profile_id).await?;
	require_admin(&profile).await?;
	state
		.cf
		.put_cors(
			&token(&profile_id).await?,
			&profile.account_id,
			&bucket,
			rules,
		)
		.await
}

#[tauri::command]
pub async fn cf_get_lifecycle(
	state: State<'_, AppState>,
	profile_id: String,
	bucket: String,
) -> AppResult<Value> {
	let profile = load_profile(&state, &profile_id).await?;
	require_admin(&profile).await?;
	state
		.cf
		.get_lifecycle(&token(&profile_id).await?, &profile.account_id, &bucket)
		.await
}

#[tauri::command]
pub async fn cf_put_lifecycle(
	state: State<'_, AppState>,
	profile_id: String,
	bucket: String,
	rules: Value,
) -> AppResult<()> {
	let profile = load_profile(&state, &profile_id).await?;
	require_admin(&profile).await?;
	state
		.cf
		.put_lifecycle(
			&token(&profile_id).await?,
			&profile.account_id,
			&bucket,
			rules,
		)
		.await
}

#[tauri::command]
pub async fn cf_get_dev_url(
	state: State<'_, AppState>,
	profile_id: String,
	bucket: String,
) -> AppResult<Value> {
	let profile = load_profile(&state, &profile_id).await?;
	require_admin(&profile).await?;
	state
		.cf
		.get_managed_domain(&token(&profile_id).await?, &profile.account_id, &bucket)
		.await
}

#[tauri::command]
pub async fn cf_set_dev_url(
	state: State<'_, AppState>,
	profile_id: String,
	bucket: String,
	enabled: bool,
) -> AppResult<Value> {
	let profile = load_profile(&state, &profile_id).await?;
	require_admin(&profile).await?;
	state
		.cf
		.set_managed_domain(
			&token(&profile_id).await?,
			&profile.account_id,
			&bucket,
			enabled,
		)
		.await
}

#[tauri::command]
pub async fn cf_list_custom_domains(
	state: State<'_, AppState>,
	profile_id: String,
	bucket: String,
) -> AppResult<Value> {
	let profile = load_profile(&state, &profile_id).await?;
	require_admin(&profile).await?;
	state
		.cf
		.list_custom_domains(&token(&profile_id).await?, &profile.account_id, &bucket)
		.await
}

#[tauri::command]
pub async fn cf_get_lock(
	state: State<'_, AppState>,
	profile_id: String,
	bucket: String,
) -> AppResult<Value> {
	let profile = load_profile(&state, &profile_id).await?;
	require_admin(&profile).await?;
	state
		.cf
		.get_lock(&token(&profile_id).await?, &profile.account_id, &bucket)
		.await
}

#[tauri::command]
pub async fn cf_put_lock(
	state: State<'_, AppState>,
	profile_id: String,
	bucket: String,
	body: Value,
) -> AppResult<()> {
	let profile = load_profile(&state, &profile_id).await?;
	require_admin(&profile).await?;
	state
		.cf
		.put_lock(
			&token(&profile_id).await?,
			&profile.account_id,
			&bucket,
			body,
		)
		.await
}

#[tauri::command]
pub async fn cf_metrics(state: State<'_, AppState>, profile_id: String) -> AppResult<Value> {
	let profile = load_profile(&state, &profile_id).await?;
	require_admin(&profile).await?;
	state
		.cf
		.metrics(&token(&profile_id).await?, &profile.account_id)
		.await
}

#[tauri::command]
pub async fn cf_get_events(
	state: State<'_, AppState>,
	profile_id: String,
	bucket: String,
) -> AppResult<Value> {
	let profile = load_profile(&state, &profile_id).await?;
	require_admin(&profile).await?;
	state
		.cf
		.get_events(&token(&profile_id).await?, &profile.account_id, &bucket)
		.await
}

#[tauri::command]
pub async fn cf_put_events(
	state: State<'_, AppState>,
	profile_id: String,
	bucket: String,
	body: Value,
) -> AppResult<()> {
	let profile = load_profile(&state, &profile_id).await?;
	require_admin(&profile).await?;
	state
		.cf
		.put_events(
			&token(&profile_id).await?,
			&profile.account_id,
			&bucket,
			body,
		)
		.await
}
