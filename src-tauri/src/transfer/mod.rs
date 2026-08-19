use crate::cost::S3Op;
use crate::error::{AppError, AppResult};
use crate::models::{TransferDirection, TransferProgress, TransferStatus};
use crate::s3::multipart::{part_count, part_range, part_size, should_multipart};
use crate::s3::{sdk_err, LiveClient};
use aws_sdk_s3::primitives::ByteStream;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;
use tauri::ipc::Channel;
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
use tokio::sync::{Mutex, Semaphore};
use uuid::Uuid;

const CONCURRENCY: usize = 4;
const PROGRESS_INTERVAL_MS: u128 = 200;

#[derive(Clone, Serialize)]
#[serde(
	rename_all = "camelCase",
	rename_all_fields = "camelCase",
	tag = "event",
	content = "data"
)]
pub enum TransferEvent {
	Started {
		transfer_id: String,
		key: String,
		bytes_total: u64,
		direction: TransferDirection,
	},
	Progress {
		transfer_id: String,
		bytes_done: u64,
		bytes_total: u64,
	},
	Finished {
		transfer_id: String,
	},
	Failed {
		transfer_id: String,
		message: String,
	},
}

#[derive(Clone, Serialize, Deserialize)]
struct ResumeState {
	transfer_id: String,
	bucket: String,
	key: String,
	path: String,
	size: u64,
	chunk: u64,
	upload_id: String,
	completed: Vec<(i32, String)>,
}

pub struct TransferEngine {
	jobs: Mutex<HashMap<String, TransferProgress>>,
	cancel: Mutex<HashMap<String, bool>>,
	dir: PathBuf,
}

impl TransferEngine {
	pub fn new(dir: PathBuf) -> Self {
		let _ = std::fs::create_dir_all(&dir);
		let jobs = load_jobs(&dir);
		Self {
			jobs: Mutex::new(jobs),
			cancel: Mutex::new(HashMap::new()),
			dir,
		}
	}

	pub async fn list(&self) -> Vec<TransferProgress> {
		self.jobs.lock().await.values().cloned().collect()
	}

	pub async fn cancel(&self, id: &str) {
		self.cancel.lock().await.insert(id.to_string(), true);
	}

	async fn is_cancelled(&self, id: &str) -> bool {
		self.cancel.lock().await.get(id).copied().unwrap_or(false)
	}

	async fn upsert(&self, progress: TransferProgress) {
		let mut jobs = self.jobs.lock().await;
		jobs.insert(progress.transfer_id.clone(), progress);
		save_jobs(&self.dir, &jobs);
	}

	fn resume_path(&self, bucket: &str, key: &str) -> PathBuf {
		self.dir
			.join(format!("{}.resume.json", resume_safe(bucket, key)))
	}

	fn load_resume(&self, bucket: &str, key: &str) -> Option<ResumeState> {
		let raw = std::fs::read_to_string(self.resume_path(bucket, key)).ok()?;
		serde_json::from_str(&raw).ok()
	}

	fn clear_resume(&self, bucket: &str, key: &str) {
		let _ = std::fs::remove_file(self.resume_path(bucket, key));
	}

	pub async fn upload_file(
		&self,
		client: &LiveClient,
		bucket: &str,
		key: &str,
		path: PathBuf,
		on_event: Channel<TransferEvent>,
	) -> AppResult<String> {
		let meta = tokio::fs::metadata(&path).await?;
		let size = meta.len();
		let resume = self.load_resume(bucket, key);
		let id = resume
			.as_ref()
			.map(|r| r.transfer_id.clone())
			.unwrap_or_else(|| Uuid::new_v4().to_string());
		self.upsert(TransferProgress {
			transfer_id: id.clone(),
			key: key.to_string(),
			direction: TransferDirection::Upload,
			bytes_done: 0,
			bytes_total: size,
			status: TransferStatus::Running,
			error: None,
		})
		.await;
		let _ = on_event.send(TransferEvent::Started {
			transfer_id: id.clone(),
			key: key.to_string(),
			bytes_total: size,
			direction: TransferDirection::Upload,
		});

		let result = if should_multipart(size) {
			self.upload_multipart(client, bucket, key, &path, size, &id, &on_event, resume)
				.await
		} else {
			self.upload_put(client, bucket, key, &path, size, &id, &on_event)
				.await
		};

		match result {
			Ok(()) => {
				self.clear_resume(bucket, key);
				self.upsert(TransferProgress {
					transfer_id: id.clone(),
					key: key.to_string(),
					direction: TransferDirection::Upload,
					bytes_done: size,
					bytes_total: size,
					status: TransferStatus::Completed,
					error: None,
				})
				.await;
				let _ = on_event.send(TransferEvent::Finished {
					transfer_id: id.clone(),
				});
				Ok(id)
			}
			Err(e) => {
				self.upsert(TransferProgress {
					transfer_id: id.clone(),
					key: key.to_string(),
					direction: TransferDirection::Upload,
					bytes_done: 0,
					bytes_total: size,
					status: TransferStatus::Failed,
					error: Some(e.to_string()),
				})
				.await;
				let _ = on_event.send(TransferEvent::Failed {
					transfer_id: id.clone(),
					message: e.to_string(),
				});
				Err(e)
			}
		}
	}

	async fn upload_put(
		&self,
		client: &LiveClient,
		bucket: &str,
		key: &str,
		path: &Path,
		size: u64,
		id: &str,
		on_event: &Channel<TransferEvent>,
	) -> AppResult<()> {
		client.record(S3Op::PutObject);
		let body = ByteStream::from_path(path)
			.await
			.map_err(|e| AppError::Io(e.to_string()))?;
		client
			.raw()
			.put_object()
			.bucket(bucket)
			.key(key)
			.content_length(size as i64)
			.body(body)
			.send()
			.await
			.map_err(sdk_err)?;
		let _ = on_event.send(TransferEvent::Progress {
			transfer_id: id.to_string(),
			bytes_done: size,
			bytes_total: size,
		});
		Ok(())
	}

	async fn upload_multipart(
		&self,
		client: &LiveClient,
		bucket: &str,
		key: &str,
		path: &Path,
		size: u64,
		id: &str,
		on_event: &Channel<TransferEvent>,
		resume: Option<ResumeState>,
	) -> AppResult<()> {
		let chunk = resume
			.as_ref()
			.map(|r| r.chunk)
			.unwrap_or_else(|| part_size(size));
		let n = part_count(size, chunk);
		let upload_id = if let Some(r) = &resume {
			r.upload_id.clone()
		} else {
			client.record(S3Op::CreateMultipartUpload);
			let created = client
				.raw()
				.create_multipart_upload()
				.bucket(bucket)
				.key(key)
				.send()
				.await
				.map_err(sdk_err)?;
			created
				.upload_id()
				.ok_or_else(|| AppError::Other("missing upload id".into()))?
				.to_string()
		};

		let already: HashSet<i32> = resume
			.as_ref()
			.map(|r| r.completed.iter().map(|(pn, _)| *pn).collect())
			.unwrap_or_default();
		let initial_done: u64 = already
			.iter()
			.map(|&pn| {
				let (start, end) = part_range(size, chunk, pn as u64);
				end - start
			})
			.sum();
		let completed_lock = Arc::new(Mutex::new(resume.map(|r| r.completed).unwrap_or_default()));
		let sem = Arc::new(Semaphore::new(CONCURRENCY));
		let done = Arc::new(Mutex::new(initial_done));
		let last_emit = Arc::new(Mutex::new(Instant::now()));
		let mut handles = Vec::new();

		for part_number in 1..=n {
			if already.contains(&(part_number as i32)) {
				continue;
			}
			if self.is_cancelled(id).await {
				return Err(AppError::Other("cancelled".into()));
			}
			let permit = sem.clone().acquire_owned().await.unwrap();
			let client_raw = client.raw().clone();
			let bucket_s = bucket.to_string();
			let key_s = key.to_string();
			let upload_id = upload_id.clone();
			let path = path.to_path_buf();
			client.record(S3Op::UploadPart);
			let done = done.clone();
			let last_emit = last_emit.clone();
			let on_event = on_event.clone();
			let completed_lock = completed_lock.clone();
			let transfer_id = id.to_string();
			let persist_dir = self.dir.clone();
			handles.push(tokio::spawn(async move {
				let _permit = permit;
				let (start, end) = part_range(size, chunk, part_number);
				let len = end - start;
				let mut file = tokio::fs::File::open(&path).await?;
				file.seek(std::io::SeekFrom::Start(start)).await?;
				let mut buf = vec![0u8; len as usize];
				file.read_exact(&mut buf).await?;
				let resp = client_raw
					.upload_part()
					.bucket(&bucket_s)
					.key(&key_s)
					.upload_id(&upload_id)
					.part_number(part_number as i32)
					.content_length(len as i64)
					.body(ByteStream::from(buf))
					.send()
					.await
					.map_err(sdk_err)?;
				let etag = resp
					.e_tag()
					.ok_or_else(|| AppError::Other("missing etag".into()))?
					.to_string();
				{
					let mut completed = completed_lock.lock().await;
					completed.push((part_number as i32, etag));
					let state = ResumeState {
						transfer_id: transfer_id.clone(),
						bucket: bucket_s.clone(),
						key: key_s.clone(),
						path: path.to_string_lossy().into_owned(),
						size,
						chunk,
						upload_id: upload_id.clone(),
						completed: completed.clone(),
					};
					let _ = std::fs::write(
						persist_dir.join(format!("{}.resume.json", resume_safe(&bucket_s, &key_s))),
						serde_json::to_vec_pretty(&state).unwrap_or_default(),
					);
				}
				let mut d = done.lock().await;
				*d += len;
				let current = *d;
				drop(d);
				let mut last = last_emit.lock().await;
				if last.elapsed().as_millis() >= PROGRESS_INTERVAL_MS || current == size {
					*last = Instant::now();
					let _ = on_event.send(TransferEvent::Progress {
						transfer_id,
						bytes_done: current,
						bytes_total: size,
					});
				}
				AppResult::Ok(())
			}));
		}

		let mut first_err = None;
		for h in handles {
			match h.await {
				Ok(Ok(())) => {}
				Ok(Err(e)) => first_err = Some(e),
				Err(e) => first_err = Some(AppError::Other(e.to_string())),
			}
		}
		if let Some(e) = first_err {
			return Err(e);
		}

		let mut completed = completed_lock.lock().await.clone();
		completed.sort_by_key(|(n, _)| *n);
		let mut parts = Vec::new();
		for (num, etag) in completed {
			parts.push(
				aws_sdk_s3::types::CompletedPart::builder()
					.part_number(num)
					.e_tag(etag)
					.build(),
			);
		}
		let completed_upload = aws_sdk_s3::types::CompletedMultipartUpload::builder()
			.set_parts(Some(parts))
			.build();
		client.record(S3Op::CompleteMultipartUpload);
		client
			.raw()
			.complete_multipart_upload()
			.bucket(bucket)
			.key(key)
			.upload_id(upload_id)
			.multipart_upload(completed_upload)
			.send()
			.await
			.map_err(sdk_err)?;
		Ok(())
	}

	pub async fn download_file(
		&self,
		client: &LiveClient,
		bucket: &str,
		key: &str,
		dest: PathBuf,
		on_event: Channel<TransferEvent>,
	) -> AppResult<String> {
		let id = Uuid::new_v4().to_string();
		client.record(S3Op::GetObject);
		let resp = client
			.raw()
			.get_object()
			.bucket(bucket)
			.key(key)
			.send()
			.await
			.map_err(sdk_err)?;
		let total = resp.content_length().unwrap_or(0) as u64;
		self.upsert(TransferProgress {
			transfer_id: id.clone(),
			key: key.to_string(),
			direction: TransferDirection::Download,
			bytes_done: 0,
			bytes_total: total,
			status: TransferStatus::Running,
			error: None,
		})
		.await;
		let _ = on_event.send(TransferEvent::Started {
			transfer_id: id.clone(),
			key: key.to_string(),
			bytes_total: total,
			direction: TransferDirection::Download,
		});
		if let Some(parent) = dest.parent() {
			tokio::fs::create_dir_all(parent).await?;
		}
		let mut file = tokio::fs::File::create(&dest).await?;
		let mut body = resp.body.into_async_read();
		let mut buf = vec![0u8; 1024 * 1024];
		let mut done = 0u64;
		let mut last = Instant::now();
		loop {
			if self.is_cancelled(&id).await {
				return Err(AppError::Other("cancelled".into()));
			}
			let n = body.read(&mut buf).await?;
			if n == 0 {
				break;
			}
			file.write_all(&buf[..n]).await?;
			done += n as u64;
			if last.elapsed().as_millis() >= PROGRESS_INTERVAL_MS {
				last = Instant::now();
				let _ = on_event.send(TransferEvent::Progress {
					transfer_id: id.clone(),
					bytes_done: done,
					bytes_total: total,
				});
			}
		}
		file.flush().await?;
		let _ = on_event.send(TransferEvent::Finished {
			transfer_id: id.clone(),
		});
		self.upsert(TransferProgress {
			transfer_id: id.clone(),
			key: key.to_string(),
			direction: TransferDirection::Download,
			bytes_done: done,
			bytes_total: total,
			status: TransferStatus::Completed,
			error: None,
		})
		.await;
		Ok(id)
	}

	pub async fn download_silent(
		&self,
		client: &LiveClient,
		bucket: &str,
		key: &str,
		dest: PathBuf,
	) -> AppResult<()> {
		client.record(S3Op::GetObject);
		let resp = client
			.raw()
			.get_object()
			.bucket(bucket)
			.key(key)
			.send()
			.await
			.map_err(sdk_err)?;
		if let Some(parent) = dest.parent() {
			tokio::fs::create_dir_all(parent).await?;
		}
		let mut file = tokio::fs::File::create(&dest).await?;
		let mut body = resp.body.into_async_read();
		let mut buf = vec![0u8; 1024 * 1024];
		loop {
			let n = body.read(&mut buf).await?;
			if n == 0 {
				break;
			}
			file.write_all(&buf[..n]).await?;
		}
		file.flush().await?;
		Ok(())
	}
}

fn resume_safe(bucket: &str, key: &str) -> String {
	format!("{bucket}:{key}")
		.chars()
		.map(|c| {
			if c.is_ascii_alphanumeric() || c == '.' || c == '-' {
				c
			} else {
				'_'
			}
		})
		.collect()
}

fn jobs_path(dir: &Path) -> PathBuf {
	dir.join("queue.json")
}

fn load_jobs(dir: &Path) -> HashMap<String, TransferProgress> {
	let Ok(raw) = std::fs::read_to_string(jobs_path(dir)) else {
		return HashMap::new();
	};
	serde_json::from_str(&raw).unwrap_or_default()
}

fn save_jobs(dir: &Path, jobs: &HashMap<String, TransferProgress>) {
	if let Ok(bytes) = serde_json::to_vec_pretty(jobs) {
		let _ = std::fs::write(jobs_path(dir), bytes);
	}
}

#[cfg(test)]
mod tests {
	use super::TransferEvent;
	use crate::s3::multipart::{part_count, part_range, part_size};

	#[test]
	fn multipart_parts_cover_file_exactly() {
		let size = 25 * 1024 * 1024 + 3;
		let chunk = part_size(size);
		let n = part_count(size, chunk);
		let mut covered = 0u64;
		for i in 1..=n {
			let (s, e) = part_range(size, chunk, i);
			covered += e - s;
		}
		assert_eq!(covered, size);
	}

	#[test]
	fn progress_event_serializes_camel_case() {
		let json = serde_json::to_value(TransferEvent::Progress {
			transfer_id: "t1".into(),
			bytes_done: 10,
			bytes_total: 20,
		})
		.unwrap();
		assert_eq!(json["event"], "progress");
		assert_eq!(json["data"]["transferId"], "t1");
		assert_eq!(json["data"]["bytesDone"], 10);
		assert_eq!(json["data"]["bytesTotal"], 20);
		assert!(json["data"].get("bytes_done").is_none());
	}

	#[test]
	fn started_event_includes_direction() {
		let json = serde_json::to_value(TransferEvent::Started {
			transfer_id: "t1".into(),
			key: "a.bin".into(),
			bytes_total: 10,
			direction: crate::models::TransferDirection::Download,
		})
		.unwrap();
		assert_eq!(json["event"], "started");
		assert_eq!(json["data"]["direction"], "download");
		assert_eq!(json["data"]["bytesTotal"], 10);
	}
}
