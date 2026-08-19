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
