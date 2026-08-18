use crate::commands::{live_client, load_profile, probe_capability, profiles_path};
use crate::creds::{self, delete_secret};
use crate::error::{AppError, AppResult};
use crate::models::{self, Jurisdiction, Profile};
use crate::state::AppState;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn list_profiles(state: State<'_, AppState>) -> AppResult<Vec<Profile>> {
	Ok(state.profiles.lock().await.list())
}

#[tauri::command]
pub async fn upsert_profile(
	app: AppHandle,
	state: State<'_, AppState>,
	id: Option<String>,
	name: String,
	account_id: String,
	access_key_id: String,
	secret_access_key: String,
	jurisdiction: Jurisdiction,
	cf_api_token: Option<String>,
) -> AppResult<Profile> {
	let name = name.trim().to_string();
	let account_id = account_id.trim().to_string();
	let access_key_id = access_key_id.trim().to_string();
	let secret_access_key = secret_access_key.trim().to_string();
	let cf_api_token = cf_api_token
		.map(|token| token.trim().to_string())
		.filter(|token| !token.is_empty());
	if !models::is_r2_account_id(&account_id) {
		return Err(AppError::InvalidCredentials(
			"Account ID must be the 32-character hex from the Cloudflare dashboard, not an email"
				.into(),
		));
	}
	let existing = {
		let store = state.profiles.lock().await;
		id.as_ref().and_then(|pid| store.get(pid).ok())
	};
	let id = id.unwrap_or_else(creds::new_profile_id);
	let has_cf = creds::apply_profile_secrets(
		existing.as_ref(),
		&id,
		&secret_access_key,
		cf_api_token.as_deref(),
	)?;
	let mut profile =
		creds::build_profile(id, name, account_id, access_key_id, jurisdiction, has_cf);
	probe_capability(&mut profile).await;
	{
		let mut store = state.profiles.lock().await;
		store.upsert(profile.clone());
		store.save(&profiles_path(&app)?)?;
	}
	state.s3.lock().await.evict(&profile.id);
	Ok(profile)
}

#[tauri::command]
pub async fn delete_profile(
	app: AppHandle,
	state: State<'_, AppState>,
	id: String,
) -> AppResult<()> {
	let mut store = state.profiles.lock().await;
	store.remove(&id)?;
	let _ = delete_secret("s3", &id);
	let _ = delete_secret("cf", &id);
	store.save(&profiles_path(&app)?)?;
	drop(store);
	state.s3.lock().await.evict(&id);
	Ok(())
}

#[tauri::command]
pub async fn probe_profile(
	app: AppHandle,
	state: State<'_, AppState>,
	id: String,
) -> AppResult<Profile> {
	let mut store = state.profiles.lock().await;
	let mut profile = store.get(&id)?;
	probe_capability(&mut profile).await;
	store.upsert(profile.clone());
	store.save(&profiles_path(&app)?)?;
	Ok(profile)
}

#[tauri::command]
pub async fn get_profile(state: State<'_, AppState>, id: String) -> AppResult<Profile> {
	load_profile(&state, &id).await
}

#[tauri::command]
pub async fn test_connection(state: State<'_, AppState>, id: String) -> AppResult<Vec<String>> {
	let client = live_client(&state, &id).await?;
	let buckets = client.list_buckets().await?;
	Ok(buckets.into_iter().map(|b| b.name).collect())
}
