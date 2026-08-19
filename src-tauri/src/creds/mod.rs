use crate::error::{AppError, AppResult};
use crate::models::{Jurisdiction, Profile, TokenCapability};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

const SERVICE: &str = "io.r2nova.app";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProfileStore {
	profiles: Vec<Profile>,
}

impl ProfileStore {
	pub fn load(path: &PathBuf) -> AppResult<Self> {
		if !path.exists() {
			return Ok(Self::default());
		}
		let raw = std::fs::read_to_string(path)?;
		Ok(serde_json::from_str(&raw)?)
	}

	pub fn save(&self, path: &PathBuf) -> AppResult<()> {
		if let Some(parent) = path.parent() {
			std::fs::create_dir_all(parent)?;
		}
		let tmp = path.with_extension("json.tmp");
		std::fs::write(&tmp, serde_json::to_vec_pretty(self)?)?;
		std::fs::rename(tmp, path)?;
		Ok(())
	}

	pub fn list(&self) -> Vec<Profile> {
		self.profiles.clone()
	}

	pub fn get(&self, id: &str) -> AppResult<Profile> {
		self.profiles
			.iter()
			.find(|p| p.id == id)
			.cloned()
			.ok_or_else(|| AppError::NotFound(format!("profile {id}")))
	}

	pub fn upsert(&mut self, profile: Profile) {
		if let Some(existing) = self.profiles.iter_mut().find(|p| p.id == profile.id) {
			*existing = profile;
		} else {
			self.profiles.push(profile);
		}
	}

	pub fn remove(&mut self, id: &str) -> AppResult<Profile> {
		let idx = self
			.profiles
			.iter()
			.position(|p| p.id == id)
			.ok_or_else(|| AppError::NotFound(format!("profile {id}")))?;
		Ok(self.profiles.remove(idx))
	}
}

pub fn new_profile_id() -> String {
	Uuid::new_v4().to_string()
}

fn entry(kind: &str, profile_id: &str) -> AppResult<keyring_core::Entry> {
	keyring_core::Entry::new(SERVICE, &format!("{kind}:{profile_id}"))
		.map_err(|e| AppError::Keyring(e.to_string()))
}

pub fn set_secret(kind: &str, profile_id: &str, secret: &str) -> AppResult<()> {
	entry(kind, profile_id)?
		.set_password(secret)
		.map_err(|e| AppError::Keyring(e.to_string()))
}

pub fn get_secret(kind: &str, profile_id: &str) -> AppResult<String> {
	entry(kind, profile_id)?
		.get_password()
		.map_err(|e| AppError::Keyring(e.to_string()))
}

pub fn delete_secret(kind: &str, profile_id: &str) -> AppResult<()> {
	match entry(kind, profile_id)?.delete_credential() {
		Ok(()) => Ok(()),
		Err(e) => {
			let msg = e.to_string();
			if msg.to_lowercase().contains("not found")
				|| msg.to_lowercase().contains("no matching")
			{
				Ok(())
			} else {
				Err(AppError::Keyring(msg))
			}
		}
	}
}

pub fn init_keyring() -> AppResult<()> {
	#[cfg(target_os = "macos")]
	{
		let store = apple_native_keyring_store::keychain::Store::new()
			.map_err(|e| AppError::Keyring(e.to_string()))?;
		keyring_core::set_default_store(store);
	}
	#[cfg(target_os = "windows")]
	{
		let store = windows_native_keyring_store::Store::new()
			.map_err(|e| AppError::Keyring(e.to_string()))?;
		keyring_core::set_default_store(store);
	}
	#[cfg(not(any(target_os = "macos", target_os = "windows")))]
	{
		let store =
			keyring_core::mock::Store::new().map_err(|e| AppError::Keyring(e.to_string()))?;
		keyring_core::set_default_store(store);
	}
	Ok(())
}

#[cfg(test)]
pub fn init_mock_keyring() -> AppResult<()> {
	use std::sync::Once;
	static INIT: Once = Once::new();
	INIT.call_once(|| {
		let store = keyring_core::mock::Store::new().expect("mock keyring store");
		keyring_core::set_default_store(store);
	});
	Ok(())
}

/// Apply S3 / CF secrets for create or update. Empty secret on update keeps the keychain entry.
pub fn apply_profile_secrets(
	existing: Option<&Profile>,
	id: &str,
	secret_access_key: &str,
	cf_api_token: Option<&str>,
) -> AppResult<bool> {
	let updating = existing.is_some();
	if secret_access_key.is_empty() {
		if !updating {
			return Err(AppError::InvalidCredentials(
				"Secret Access Key is required for a new account".into(),
			));
		}
	} else {
		set_secret("s3", id, secret_access_key)?;
	}

	match cf_api_token {
		Some(token) if !token.is_empty() => {
			set_secret("cf", id, token)?;
			Ok(true)
		}
		_ if updating => Ok(existing.is_some_and(|p| p.has_cf_token)),
		_ => Ok(false),
	}
}

pub fn build_profile(
	id: String,
	name: String,
	account_id: String,
	access_key_id: String,
	jurisdiction: Jurisdiction,
	has_cf_token: bool,
) -> Profile {
	Profile {
		id,
		name,
		account_id,
		access_key_id,
		jurisdiction,
		has_cf_token,
		capability: TokenCapability::Unknown,
		last_error: None,
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn store_roundtrip() {
		let dir = tempfile::tempdir().unwrap();
		let path = dir.path().join("profiles.json");
		let mut store = ProfileStore::default();
		store.upsert(build_profile(
			"p1".into(),
			"prod".into(),
			"acct".into(),
			"AKIA".into(),
			Jurisdiction::Default,
			false,
		));
		store.save(&path).unwrap();
		let loaded = ProfileStore::load(&path).unwrap();
		assert_eq!(loaded.list().len(), 1);
		assert_eq!(loaded.get("p1").unwrap().name, "prod");
	}

	#[test]
	fn mock_keyring_set_get_delete() {
		init_mock_keyring().unwrap();
		set_secret("s3", "p1", "super-secret").unwrap();
		assert_eq!(get_secret("s3", "p1").unwrap(), "super-secret");
		delete_secret("s3", "p1").unwrap();
	}

	#[test]
	fn update_with_empty_secret_keeps_keychain() {
		init_mock_keyring().unwrap();
		let existing = build_profile(
			"p-keep".into(),
			"prod".into(),
			"acct".into(),
			"AKIA".into(),
			Jurisdiction::Default,
			true,
		);
		set_secret("s3", "p-keep", "old-secret").unwrap();
		set_secret("cf", "p-keep", "old-token").unwrap();
		let has_cf = apply_profile_secrets(Some(&existing), "p-keep", "", None).unwrap();
		assert!(has_cf);
		assert_eq!(get_secret("s3", "p-keep").unwrap(), "old-secret");
		assert_eq!(get_secret("cf", "p-keep").unwrap(), "old-token");
	}

	#[test]
	fn create_without_secret_fails() {
		init_mock_keyring().unwrap();
		let err = apply_profile_secrets(None, "p-new", "", None).unwrap_err();
		assert_eq!(err.kind(), "invalidCredentials");
	}
}
