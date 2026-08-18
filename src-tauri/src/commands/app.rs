use crate::error::AppResult;
use tauri::AppHandle;

#[tauri::command]
pub async fn reveal_item(app: AppHandle, path: String) -> AppResult<()> {
	use tauri_plugin_opener::OpenerExt;
	app.opener()
		.open_path(path, None::<&str>)
		.map_err(|e| crate::error::AppError::Other(e.to_string()))?;
	Ok(())
}

#[tauri::command]
pub async fn ping() -> AppResult<String> {
	Ok("ok".into())
}
