use crate::cf::CfClient;
use crate::cost::CostCounter;
use crate::creds::ProfileStore;
use crate::s3::S3Pool;
use crate::transfer::TransferEngine;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct AppState {
	pub profiles: Mutex<ProfileStore>,
	pub s3: Mutex<S3Pool>,
	pub transfers: TransferEngine,
	pub cost: Arc<CostCounter>,
	pub cf: CfClient,
}

impl AppState {
	pub fn new(profiles: ProfileStore, transfer_dir: PathBuf) -> Self {
		Self {
			profiles: Mutex::new(profiles),
			s3: Mutex::new(S3Pool::new()),
			transfers: TransferEngine::new(transfer_dir),
			cost: Arc::new(CostCounter::default()),
			cf: CfClient::new(),
		}
	}
}
