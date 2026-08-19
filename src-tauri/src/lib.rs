#![allow(clippy::too_many_arguments)]

mod cf;
mod commands;
mod cost;
mod creds;
mod error;
mod models;
mod s3;
mod state;
mod transfer;

use commands::app::*;
use commands::cf::*;
use commands::cost::*;
use commands::objects::*;
use commands::preview::*;
use commands::profile::*;
use commands::s3::*;
use commands::transfer::*;
use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
	let _ = creds::init_keyring();

	tauri::Builder::default()
		.plugin(tauri_plugin_process::init())
		.plugin(tauri_plugin_updater::Builder::new().build())
		.plugin(tauri_plugin_opener::init())
		.plugin(tauri_plugin_dialog::init())
		.plugin(tauri_plugin_store::Builder::new().build())
		.plugin(tauri_plugin_log::Builder::new().build())
		.plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {}))
		.plugin(tauri_plugin_clipboard_manager::init())
		.setup(|app| {
			let path = commands::profiles_path(app.handle()).map_err(|e| e.to_string())?;
			let store = creds::ProfileStore::load(&path).unwrap_or_default();
			let transfer_dir = path
				.parent()
				.unwrap_or_else(|| std::path::Path::new("."))
				.join("transfers");
			app.manage(AppState::new(store, transfer_dir));
			Ok(())
		})
		.invoke_handler(tauri::generate_handler![
			ping,
			app_version,
			reveal_item,
			list_profiles,
			upsert_profile,
			delete_profile,
			probe_profile,
			get_profile,
			test_connection,
			list_buckets,
			list_objects,
			head_object,
			quote_list_all,
			delete_objects,
			quote_delete_prefix,
			delete_prefix,
			copy_object,
			rename_object,
			move_objects,
			list_multipart_uploads,
			abort_multipart_upload,
			put_object_metadata,
			upload_paths,
			download_object,
			download_objects,
			set_transfer_concurrency,
			list_transfers,
			dismiss_transfer,
			cancel_transfer,
			pause_transfer,
			resume_transfer,
			preview_object,
			presign_get,
			cf_list_buckets,
			cf_create_bucket,
			cf_delete_bucket,
			cf_get_cors,
			cf_put_cors,
			cf_get_lifecycle,
			cf_put_lifecycle,
			cf_get_dev_url,
			cf_set_dev_url,
			cf_list_custom_domains,
			cf_get_lock,
			cf_put_lock,
			cf_metrics,
			cf_get_events,
			cf_put_events,
			cost_snapshot,
			cost_reset,
			cost_estimate,
		])
		.run(tauri::generate_context!())
		.expect("error while running tauri application");
}
