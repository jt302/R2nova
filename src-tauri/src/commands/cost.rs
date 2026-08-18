use crate::cost::CostSnapshot;
use crate::error::AppResult;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn cost_snapshot(state: State<'_, AppState>) -> AppResult<CostSnapshot> {
	Ok(state.cost.snapshot())
}

#[tauri::command]
pub async fn cost_reset(state: State<'_, AppState>) -> AppResult<()> {
	state.cost.reset();
	Ok(())
}

#[tauri::command]
pub async fn cost_estimate(class_a: u64, class_b: u64) -> AppResult<f64> {
	Ok(crate::cost::estimate_usd(class_a, class_b))
}

#[tauri::command]
pub async fn app_version() -> AppResult<String> {
	Ok(env!("CARGO_PKG_VERSION").to_string())
}

#[tauri::command]
pub async fn check_latest_release() -> AppResult<Option<String>> {
	let url = "https://api.github.com/repos/r2nova/r2nova/releases/latest";
	let client = reqwest::Client::new();
	let resp = client.get(url).header("User-Agent", "r2nova").send().await;
	let Ok(resp) = resp else {
		return Ok(None);
	};
	if !resp.status().is_success() {
		return Ok(None);
	}
	let json: serde_json::Value = resp.json().await.unwrap_or(serde_json::Value::Null);
	Ok(json
		.get("tag_name")
		.and_then(|v| v.as_str())
		.map(|s| s.trim_start_matches('v').to_string()))
}
