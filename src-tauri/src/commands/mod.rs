use crate::cf::CfClient;
use crate::creds::get_secret;
use crate::error::{AppError, AppResult};
use crate::models::{Profile, TokenCapability};
use crate::s3::LiveClient;
use crate::state::AppState;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

pub mod app;
pub mod cf;
pub mod cost;
pub mod objects;
pub mod preview;
pub mod profile;
pub mod s3;
pub mod transfer;

pub fn profiles_path(app: &AppHandle) -> AppResult<PathBuf> {
	let dir = app
		.path()
		.app_data_dir()
		.map_err(|e| AppError::Io(e.to_string()))?;
	#[cfg(debug_assertions)]
	let dir = dir.join("development");
	Ok(dir.join("profiles.json"))
}

pub async fn load_profile(state: &State<'_, AppState>, profile_id: &str) -> AppResult<Profile> {
	state.profiles.lock().await.get(profile_id)
}

pub async fn live_client(state: &State<'_, AppState>, profile_id: &str) -> AppResult<LiveClient> {
	let profile = load_profile(state, profile_id).await?;
	let secret = get_secret("s3", profile_id)?;
	state
		.s3
		.lock()
		.await
		.client(&profile, &secret, &state.cost)
		.await
}

pub fn cf_client() -> CfClient {
	CfClient::new()
}

pub async fn require_admin(profile: &Profile) -> AppResult<()> {
	if profile.capability != TokenCapability::Admin {
		return Err(AppError::Capability(
			"This action needs an Admin Cloudflare API token (Object-level tokens cannot call REST)."
				.into(),
		));
	}
	Ok(())
}

fn redact_secrets(message: &str, secrets: &[&str]) -> String {
	let mut out = message.to_string();
	for secret in secrets {
		if !secret.is_empty() {
			out = out.replace(*secret, "***");
		}
	}
	out
}

pub async fn probe_capability(profile: &mut Profile) -> TokenCapability {
	profile.last_error = None;
	let secret = match get_secret("s3", &profile.id) {
		Ok(s) => s,
		Err(e) => {
			profile.capability = TokenCapability::Invalid;
			profile.last_error = Some(e.to_string());
			return profile.capability;
		}
	};
	let mut pool = crate::s3::S3Pool::new();
	let cost = Arc::new(crate::cost::CostCounter::default());
	let listed = match pool.client(profile, &secret, &cost).await {
		Ok(c) => c.list_buckets().await,
		Err(e) => Err(e),
	};
	if let Err(e) = listed {
		profile.capability = TokenCapability::Invalid;
		profile.last_error = Some(redact_secrets(&e.to_string(), &[&secret]));
		return profile.capability;
	}
	if profile.has_cf_token {
		if let Ok(token) = get_secret("cf", &profile.id) {
			if cf_client().probe_admin(&token, &profile.account_id).await {
				profile.capability = TokenCapability::Admin;
				return profile.capability;
			}
		}
	}
	profile.capability = TokenCapability::Object;
	profile.capability
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn probe_error_does_not_echo_secret() {
		let msg = redact_secrets("SignatureDoesNotMatch: check secret-value", &["secret-value"]);
		assert_eq!(msg, "SignatureDoesNotMatch: check ***");
		assert!(!msg.contains("secret-value"));
	}
}
