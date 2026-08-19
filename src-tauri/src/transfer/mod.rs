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
use tokio::sync::{Mutex, Notify, Semaphore};
use tokio::task::JoinHandle;
use uuid::Uuid;

const CONCURRENCY: usize = 4;
const PROGRESS_INTERVAL_MS: u128 = 200;
const DEFAULT_JOB_LIMIT: usize = 5;
const MIN_JOB_LIMIT: usize = 1;
const MAX_JOB_LIMIT: usize = 16;

#[derive(Clone, Copy, PartialEq, Eq)]
enum JobControl {
	Run,
	Pause,
	Cancel,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum RunEnd {
	Done,
	Cancelled,
}

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
		bytes_done: u64,
		direction: TransferDirection,
		bucket: String,
		path: String,
		pausable: bool,
		status: TransferStatus,
	},
	Progress {
		transfer_id: String,
		bytes_done: u64,
		bytes_total: u64,
	},
	Paused {
		transfer_id: String,
	},
	Cancelled {
		transfer_id: String,
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
	controls: Mutex<HashMap<String, JobControl>>,
	active: Mutex<HashSet<String>>,
	pending: Mutex<HashSet<String>>,
	job_limit: Mutex<usize>,
	slots_used: Mutex<usize>,
	notify: Notify,
	dir: PathBuf,
}

impl TransferEngine {
	pub fn new(dir: PathBuf) -> Self {
		let _ = std::fs::create_dir_all(&dir);
		let mut jobs = load_jobs(&dir);
		if park_orphans(&dir, &mut jobs) {
			save_jobs(&dir, &jobs);
		}
		Self {
			jobs: Mutex::new(jobs),
			controls: Mutex::new(HashMap::new()),
			active: Mutex::new(HashSet::new()),
			pending: Mutex::new(HashSet::new()),
			job_limit: Mutex::new(DEFAULT_JOB_LIMIT),
			slots_used: Mutex::new(0),
			notify: Notify::new(),
			dir,
		}
	}

	pub async fn list(&self) -> Vec<TransferProgress> {
		self.jobs.lock().await.values().cloned().collect()
	}

	pub async fn get(&self, id: &str) -> Option<TransferProgress> {
		self.jobs.lock().await.get(id).cloned()
	}

	pub async fn pause(&self, id: &str) {
		self.controls
			.lock()
			.await
			.insert(id.to_string(), JobControl::Pause);
		self.notify.notify_waiters();
	}

	/// Returns true if a live task is waiting and will continue.
	pub async fn resume_signal(&self, id: &str) -> bool {
		self.controls
			.lock()
			.await
			.insert(id.to_string(), JobControl::Run);
		self.notify.notify_waiters();
		self.active.lock().await.contains(id) || self.pending.lock().await.contains(id)
	}

	pub async fn set_job_limit(&self, n: usize) {
		*self.job_limit.lock().await = clamp_job_limit(n);
		self.notify.notify_waiters();
	}

	async fn acquire_slot(&self, id: &str) -> bool {
		loop {
			let wait = self.notify.notified();
			if self.is_cancelled(id).await {
				return false;
			}
			let limit = *self.job_limit.lock().await;
			let mut used = self.slots_used.lock().await;
			if *used < limit {
				*used += 1;
				return true;
			}
			drop(used);
			wait.await;
		}
	}

	async fn release_slot(&self) {
		let mut used = self.slots_used.lock().await;
		*used = used.saturating_sub(1);
		drop(used);
		self.notify.notify_waiters();
	}

	async fn is_cancelled(&self, id: &str) -> bool {
		if self.control(id).await == JobControl::Cancel {
			return true;
		}
		matches!(
			self.get(id).await.map(|job| job.status),
			Some(TransferStatus::Cancelled)
		)
	}

	/// Drops a finished history row. Does not delete downloaded files or abort MPU.
	pub async fn dismiss(&self, id: &str) -> AppResult<()> {
		let mut jobs = self.jobs.lock().await;
		let Some(job) = jobs.get(id) else {
			return Ok(());
		};
		if !can_dismiss(job) {
			return Err(AppError::Other("transfer is still active".into()));
		}
		jobs.remove(id);
		save_jobs(&self.dir, &jobs);
		drop(jobs);
		self.controls.lock().await.remove(id);
		self.active.lock().await.remove(id);
		Ok(())
	}

	pub async fn cancel(&self, id: &str, client: Option<&LiveClient>) {
		self.controls
			.lock()
			.await
			.insert(id.to_string(), JobControl::Cancel);
		self.notify.notify_waiters();
		let job = self.jobs.lock().await.get(id).cloned();
		if let Some(job) = job {
			if let Some(client) = client {
				if let Some(resume) = self.load_resume(&job.bucket, &job.key) {
					let _ = client
						.abort_multipart(&resume.bucket, &resume.key, &resume.upload_id)
						.await;
				}
			}
			self.clear_resume(&job.bucket, &job.key);
			if job.direction == TransferDirection::Download
				&& job.status != TransferStatus::Completed
				&& !job.path.is_empty()
			{
				let _ = std::fs::remove_file(&job.path);
			}
			self.upsert(make_progress(
				&job,
				job.bytes_done,
				TransferStatus::Cancelled,
				None,
			))
			.await;
		}
	}

	async fn control(&self, id: &str) -> JobControl {
		self.controls
			.lock()
			.await
			.get(id)
			.copied()
			.unwrap_or(JobControl::Run)
	}

	async fn wait_if_paused(&self, id: &str) -> JobControl {
		loop {
			let wait = self.notify.notified();
			match self.control(id).await {
				JobControl::Pause => wait.await,
				other => return other,
			}
		}
	}

	async fn mark_active(&self, id: &str) {
		self.active.lock().await.insert(id.to_string());
		self.controls
			.lock()
			.await
			.entry(id.to_string())
			.or_insert(JobControl::Run);
	}

	async fn mark_inactive(&self, id: &str) {
		self.active.lock().await.remove(id);
		self.controls.lock().await.remove(id);
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

	pub async fn enqueue_upload(
		&self,
		profile_id: &str,
		bucket: &str,
		key: &str,
		path: PathBuf,
		on_event: Option<&Channel<TransferEvent>>,
		resume_id: Option<String>,
	) -> AppResult<String> {
		let meta = tokio::fs::metadata(&path).await?;
		let size = meta.len();
		let path_s = path.to_string_lossy().into_owned();
		let pausable = should_multipart(size);
		let loaded = self.load_resume(bucket, key);
		let matching = loaded
			.as_ref()
			.filter(|r| resume_matches(r, &path_s, size))
			.cloned();
		let id = resume_id
			.or_else(|| matching.as_ref().map(|r| r.transfer_id.clone()))
			.unwrap_or_else(|| Uuid::new_v4().to_string());
		let bytes_done = matching.as_ref().map(resume_bytes).unwrap_or(0);
		let job = TransferProgress {
			transfer_id: id.clone(),
			key: key.to_string(),
			direction: TransferDirection::Upload,
			bytes_done,
			bytes_total: size,
			status: TransferStatus::Queued,
			error: None,
			profile_id: profile_id.to_string(),
			bucket: bucket.to_string(),
			path: path_s,
			pausable,
		};
		self.pending.lock().await.insert(id.clone());
		self.upsert(job.clone()).await;
		if let Some(ch) = on_event {
			let _ = ch.send(started_event(&job));
		}
		Ok(id)
	}

	pub async fn run_upload(
		&self,
		client: &LiveClient,
		id: &str,
		on_event: Channel<TransferEvent>,
	) -> AppResult<String> {
		self.pending.lock().await.insert(id.to_string());
		if !self.acquire_slot(id).await {
			self.pending.lock().await.remove(id);
			return Ok(id.to_string());
		}
		let Some(mut job) = self.get(id).await else {
			self.release_slot().await;
			self.pending.lock().await.remove(id);
			return Err(AppError::NotFound("transfer not found".into()));
		};
		if job.status == TransferStatus::Cancelled || job.status == TransferStatus::Completed {
			self.release_slot().await;
			self.pending.lock().await.remove(id);
			return Ok(id.to_string());
		}
		let path = PathBuf::from(&job.path);
		let size = job.bytes_total;
		let loaded = self.load_resume(&job.bucket, &job.key);
		let resume = match loaded {
			Some(r) if resume_matches(&r, &job.path, size) => Some(r),
			Some(r) => {
				let _ = client
					.abort_multipart(&r.bucket, &r.key, &r.upload_id)
					.await;
				self.clear_resume(&job.bucket, &job.key);
				None
			}
			None => None,
		};
		job.status = TransferStatus::Running;
		job.error = None;
		self.mark_active(id).await;
		self.upsert(job.clone()).await;
		let _ = on_event.send(started_event(&job));

		let result = if job.pausable {
			self.upload_multipart(client, &job, &path, size, &on_event, resume)
				.await
		} else {
			self.upload_put(client, &job.bucket, &job.key, &path, size, id, &on_event)
				.await
		};

		self.mark_inactive(id).await;
		self.release_slot().await;
		self.pending.lock().await.remove(id);
		match result {
			Ok(RunEnd::Done) => {
				self.clear_resume(&job.bucket, &job.key);
				self.upsert(make_progress(&job, size, TransferStatus::Completed, None))
					.await;
				let _ = on_event.send(TransferEvent::Finished {
					transfer_id: id.to_string(),
				});
				Ok(id.to_string())
			}
			Ok(RunEnd::Cancelled) => {
				let _ = on_event.send(TransferEvent::Cancelled {
					transfer_id: id.to_string(),
				});
				Ok(id.to_string())
			}
			Err(e) => {
				if self.control(id).await == JobControl::Cancel {
					let _ = on_event.send(TransferEvent::Cancelled {
						transfer_id: id.to_string(),
					});
					return Ok(id.to_string());
				}
				let done = self
					.load_resume(&job.bucket, &job.key)
					.as_ref()
					.map(resume_bytes)
					.unwrap_or(job.bytes_done);
				self.upsert(make_progress(
					&job,
					done,
					TransferStatus::Failed,
					Some(e.to_string()),
				))
				.await;
				let _ = on_event.send(TransferEvent::Failed {
					transfer_id: id.to_string(),
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
	) -> AppResult<RunEnd> {
		if self.control(id).await == JobControl::Cancel {
			return Ok(RunEnd::Cancelled);
		}
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
		Ok(RunEnd::Done)
	}

	async fn upload_multipart(
		&self,
		client: &LiveClient,
		job: &TransferProgress,
		path: &Path,
		size: u64,
		on_event: &Channel<TransferEvent>,
		resume: Option<ResumeState>,
	) -> AppResult<RunEnd> {
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
				.bucket(&job.bucket)
				.key(&job.key)
				.send()
				.await
				.map_err(sdk_err)?;
			created
				.upload_id()
				.ok_or_else(|| AppError::Other("missing upload id".into()))?
				.to_string()
		};

		let mut already: HashSet<i32> = resume
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
		let mut handles: Vec<JoinHandle<AppResult<()>>> = Vec::new();
		let mut part_number = 1u64;

		while part_number <= n {
			if already.contains(&(part_number as i32)) {
				part_number += 1;
				continue;
			}
			match self.control(&job.transfer_id).await {
				JobControl::Cancel => {
					let _ = join_parts(&mut handles).await;
					return Ok(RunEnd::Cancelled);
				}
				JobControl::Pause => {
					join_parts(&mut handles).await?;
					already = completed_lock
						.lock()
						.await
						.iter()
						.map(|(pn, _)| *pn)
						.collect();
					let bytes = *done.lock().await;
					self.upsert(make_progress(job, bytes, TransferStatus::Paused, None))
						.await;
					let _ = on_event.send(TransferEvent::Paused {
						transfer_id: job.transfer_id.clone(),
					});
					if self.wait_if_paused(&job.transfer_id).await == JobControl::Cancel {
						return Ok(RunEnd::Cancelled);
					}
					self.upsert(make_progress(job, bytes, TransferStatus::Running, None))
						.await;
					continue;
				}
				JobControl::Run => {}
			}
			let permit = sem.clone().acquire_owned().await.unwrap();
			let client_raw = client.raw().clone();
			let bucket_s = job.bucket.clone();
			let key_s = job.key.clone();
			let upload_id = upload_id.clone();
			let path = path.to_path_buf();
			client.record(S3Op::UploadPart);
			let done = done.clone();
			let last_emit = last_emit.clone();
			let on_event = on_event.clone();
			let completed_lock = completed_lock.clone();
			let transfer_id = job.transfer_id.clone();
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
			part_number += 1;
		}

		join_parts(&mut handles).await?;

		if self.control(&job.transfer_id).await == JobControl::Cancel {
			return Ok(RunEnd::Cancelled);
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
			.bucket(&job.bucket)
			.key(&job.key)
			.upload_id(upload_id)
			.multipart_upload(completed_upload)
			.send()
			.await
			.map_err(sdk_err)?;
		Ok(RunEnd::Done)
	}

	pub async fn download_file(
		&self,
		client: &LiveClient,
		profile_id: &str,
		bucket: &str,
		key: &str,
		dest: PathBuf,
		unique: bool,
		resume_id: Option<String>,
		bytes_total: u64,
		on_event: Channel<TransferEvent>,
	) -> AppResult<String> {
		let id = self
			.enqueue_download(
				profile_id,
				bucket,
				key,
				dest,
				unique,
				bytes_total,
				resume_id,
				Some(&on_event),
			)
			.await?;
		self.run_download(client, &id, on_event).await
	}

	pub async fn enqueue_download(
		&self,
		profile_id: &str,
		bucket: &str,
		key: &str,
		dest: PathBuf,
		unique: bool,
		bytes_total: u64,
		resume_id: Option<String>,
		on_event: Option<&Channel<TransferEvent>>,
	) -> AppResult<String> {
		let taken: HashSet<PathBuf> = {
			let jobs = self.jobs.lock().await;
			jobs.values()
				.filter(|job| !job.path.is_empty())
				.map(|job| PathBuf::from(&job.path))
				.collect()
		};
		let dest = if unique && resume_id.is_none() {
			unique_dest_among(&dest, &taken)
		} else {
			dest
		};
		let path_s = dest.to_string_lossy().into_owned();
		let id = resume_id.unwrap_or_else(|| Uuid::new_v4().to_string());
		if let Some(parent) = dest.parent() {
			tokio::fs::create_dir_all(parent).await?;
		}
		if unique && !dest.exists() {
			std::fs::File::create(&dest).map_err(|e| AppError::Io(e.to_string()))?;
		}
		let bytes_done = file_len(&dest);
		let job = TransferProgress {
			transfer_id: id.clone(),
			key: key.to_string(),
			direction: TransferDirection::Download,
			bytes_done,
			bytes_total: bytes_total.max(bytes_done),
			status: TransferStatus::Queued,
			error: None,
			profile_id: profile_id.to_string(),
			bucket: bucket.to_string(),
			path: path_s,
			pausable: true,
		};
		self.pending.lock().await.insert(id.clone());
		self.upsert(job.clone()).await;
		if let Some(ch) = on_event {
			let _ = ch.send(started_event(&job));
		}
		Ok(id)
	}

	pub async fn run_download(
		&self,
		client: &LiveClient,
		id: &str,
		on_event: Channel<TransferEvent>,
	) -> AppResult<String> {
		self.pending.lock().await.insert(id.to_string());
		if !self.acquire_slot(id).await {
			self.pending.lock().await.remove(id);
			return Ok(id.to_string());
		}
		let Some(job) = self.get(id).await else {
			self.release_slot().await;
			self.pending.lock().await.remove(id);
			return Err(AppError::NotFound("transfer not found".into()));
		};
		if job.status == TransferStatus::Cancelled || job.status == TransferStatus::Completed {
			self.release_slot().await;
			self.pending.lock().await.remove(id);
			return Ok(id.to_string());
		}
		let dest = PathBuf::from(&job.path);
		self.mark_active(id).await;
		let mut total = job.bytes_total;
		let mut known_total = job.bytes_total > 0;

		let result = self
			.download_loop(
				client,
				&job.profile_id,
				&job.bucket,
				&job.key,
				&dest,
				&job.path,
				id,
				&on_event,
				&mut total,
				&mut known_total,
			)
			.await;

		self.mark_inactive(id).await;
		self.release_slot().await;
		self.pending.lock().await.remove(id);
		let offset = file_len(&dest);
		let job = TransferProgress {
			bytes_done: offset,
			bytes_total: if known_total { total } else { offset },
			status: TransferStatus::Running,
			error: None,
			..job
		};
		match result {
			Ok(RunEnd::Done) => {
				self.upsert(make_progress(
					&job,
					job.bytes_total,
					TransferStatus::Completed,
					None,
				))
				.await;
				let _ = on_event.send(TransferEvent::Finished {
					transfer_id: id.to_string(),
				});
				Ok(id.to_string())
			}
			Ok(RunEnd::Cancelled) => {
				let _ = on_event.send(TransferEvent::Cancelled {
					transfer_id: id.to_string(),
				});
				Ok(id.to_string())
			}
			Err(e) => {
				if self.control(id).await == JobControl::Cancel {
					let _ = on_event.send(TransferEvent::Cancelled {
						transfer_id: id.to_string(),
					});
					return Ok(id.to_string());
				}
				self.upsert(make_progress(
					&job,
					file_len(&dest),
					TransferStatus::Failed,
					Some(e.to_string()),
				))
				.await;
				let _ = on_event.send(TransferEvent::Failed {
					transfer_id: id.to_string(),
					message: e.to_string(),
				});
				Err(e)
			}
		}
	}

	#[allow(clippy::too_many_arguments)]
	async fn download_loop(
		&self,
		client: &LiveClient,
		profile_id: &str,
		bucket: &str,
		key: &str,
		dest: &Path,
		path_s: &str,
		id: &str,
		on_event: &Channel<TransferEvent>,
		total: &mut u64,
		known_total: &mut bool,
	) -> AppResult<RunEnd> {
		loop {
			if self.wait_if_paused(id).await == JobControl::Cancel {
				return Ok(RunEnd::Cancelled);
			}
			let offset = file_len(dest).min(if *known_total { *total } else { u64::MAX });
			if *known_total && offset >= *total {
				return Ok(RunEnd::Done);
			}
			client.record(S3Op::GetObject);
			let mut req = client.raw().get_object().bucket(bucket).key(key);
			if let Some(range) = range_header(offset) {
				req = req.range(range);
			}
			let resp = req.send().await.map_err(sdk_err)?;
			let length = resp.content_length().unwrap_or(0).max(0) as u64;
			*total = total_from_range(resp.content_range(), length, offset);
			*known_total = true;
			let job = TransferProgress {
				transfer_id: id.to_string(),
				key: key.to_string(),
				direction: TransferDirection::Download,
				bytes_done: offset,
				bytes_total: *total,
				status: TransferStatus::Running,
				error: None,
				profile_id: profile_id.to_string(),
				bucket: bucket.to_string(),
				path: path_s.to_string(),
				pausable: true,
			};
			self.upsert(job.clone()).await;
			let _ = on_event.send(started_event(&job));
			if offset >= *total {
				return Ok(RunEnd::Done);
			}
			let mut file = if offset > 0 {
				tokio::fs::OpenOptions::new()
					.write(true)
					.append(true)
					.open(dest)
					.await?
			} else {
				tokio::fs::File::create(dest).await?
			};
			let mut body = resp.body.into_async_read();
			let mut buf = vec![0u8; 1024 * 1024];
			let mut done = offset;
			let mut last = Instant::now();
			loop {
				match self.control(id).await {
					JobControl::Cancel => {
						file.flush().await?;
						return Ok(RunEnd::Cancelled);
					}
					JobControl::Pause => {
						file.flush().await?;
						self.upsert(make_progress(&job, done, TransferStatus::Paused, None))
							.await;
						let _ = on_event.send(TransferEvent::Paused {
							transfer_id: id.to_string(),
						});
						break;
					}
					JobControl::Run => {}
				}
				let n = body.read(&mut buf).await?;
				if n == 0 {
					file.flush().await?;
					return Ok(RunEnd::Done);
				}
				file.write_all(&buf[..n]).await?;
				done += n as u64;
				if last.elapsed().as_millis() >= PROGRESS_INTERVAL_MS {
					last = Instant::now();
					self.upsert(make_progress(&job, done, TransferStatus::Running, None))
						.await;
					let _ = on_event.send(TransferEvent::Progress {
						transfer_id: id.to_string(),
						bytes_done: done,
						bytes_total: *total,
					});
				}
			}
		}
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

fn make_progress(
	job: &TransferProgress,
	bytes_done: u64,
	status: TransferStatus,
	error: Option<String>,
) -> TransferProgress {
	TransferProgress {
		bytes_done,
		status,
		error,
		..job.clone()
	}
}

fn started_event(job: &TransferProgress) -> TransferEvent {
	TransferEvent::Started {
		transfer_id: job.transfer_id.clone(),
		key: job.key.clone(),
		bytes_total: job.bytes_total,
		bytes_done: job.bytes_done,
		direction: job.direction,
		bucket: job.bucket.clone(),
		path: job.path.clone(),
		pausable: job.pausable,
		status: job.status,
	}
}

async fn join_parts(handles: &mut Vec<JoinHandle<AppResult<()>>>) -> AppResult<()> {
	let mut first_err = None;
	for h in handles.drain(..) {
		match h.await {
			Ok(Ok(())) => {}
			Ok(Err(e)) => {
				if first_err.is_none() {
					first_err = Some(e);
				}
			}
			Err(e) => {
				if first_err.is_none() {
					first_err = Some(AppError::Other(e.to_string()));
				}
			}
		}
	}
	match first_err {
		Some(e) => Err(e),
		None => Ok(()),
	}
}

fn resume_bytes(resume: &ResumeState) -> u64 {
	resume
		.completed
		.iter()
		.map(|(pn, _)| {
			let (start, end) = part_range(resume.size, resume.chunk, *pn as u64);
			end - start
		})
		.sum()
}

fn resume_matches(resume: &ResumeState, path: &str, size: u64) -> bool {
	resume.size == size && resume.path == path && Path::new(&resume.path).is_file()
}

fn file_len(path: &Path) -> u64 {
	std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

#[cfg(test)]
pub fn unique_dest(path: &Path) -> PathBuf {
	unique_dest_among(path, &HashSet::new())
}

fn unique_dest_among(path: &Path, taken: &HashSet<PathBuf>) -> PathBuf {
	let free = |p: &Path| !p.exists() && !taken.contains(p);
	if free(path) {
		return path.to_path_buf();
	}
	let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
	let ext = path.extension().and_then(|s| s.to_str());
	let parent = path.parent().unwrap_or(Path::new("."));
	for i in 1..1000 {
		let name = match ext {
			Some(e) => format!("{stem} ({i}).{e}"),
			None => format!("{stem} ({i})"),
		};
		let candidate = parent.join(name);
		if free(&candidate) {
			return candidate;
		}
	}
	path.to_path_buf()
}

pub fn range_header(offset: u64) -> Option<String> {
	if offset == 0 {
		None
	} else {
		Some(format!("bytes={offset}-"))
	}
}

pub fn total_from_range(content_range: Option<&str>, content_length: u64, offset: u64) -> u64 {
	if let Some(range) = content_range {
		if let Some((_, total)) = range.rsplit_once('/') {
			if total != "*" {
				if let Ok(n) = total.parse::<u64>() {
					return n;
				}
			}
		}
	}
	offset.saturating_add(content_length)
}

fn park_orphans(dir: &Path, jobs: &mut HashMap<String, TransferProgress>) -> bool {
	let mut dirty = false;
	for job in jobs.values_mut() {
		if job.status != TransferStatus::Running {
			continue;
		}
		job.status = TransferStatus::Paused;
		if job.direction == TransferDirection::Download && !job.path.is_empty() {
			let on_disk = file_len(Path::new(&job.path));
			job.bytes_done = if job.bytes_total > 0 {
				on_disk.min(job.bytes_total)
			} else {
				on_disk
			};
		}
		if job.direction == TransferDirection::Upload && !job.bucket.is_empty() {
			if let Ok(raw) = std::fs::read_to_string(dir.join(format!(
				"{}.resume.json",
				resume_safe(&job.bucket, &job.key)
			))) {
				if let Ok(resume) = serde_json::from_str::<ResumeState>(&raw) {
					job.bytes_done = resume_bytes(&resume);
				}
			}
		}
		dirty = true;
	}
	dirty
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

fn can_dismiss(job: &TransferProgress) -> bool {
	matches!(
		job.status,
		TransferStatus::Completed | TransferStatus::Cancelled
	) || (job.status == TransferStatus::Failed && !job.pausable)
}

pub fn clamp_job_limit(n: usize) -> usize {
	n.clamp(MIN_JOB_LIMIT, MAX_JOB_LIMIT)
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
	use super::*;
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
			bytes_done: 3,
			direction: TransferDirection::Download,
			bucket: "b".into(),
			path: "/tmp/a.bin".into(),
			pausable: true,
			status: TransferStatus::Queued,
		})
		.unwrap();
		assert_eq!(json["event"], "started");
		assert_eq!(json["data"]["direction"], "download");
		assert_eq!(json["data"]["bucket"], "b");
		assert_eq!(json["data"]["bytesDone"], 3);
		assert_eq!(json["data"]["status"], "queued");
		assert!(json["data"]["pausable"].as_bool().unwrap());
	}

	#[test]
	fn unique_dest_appends_counter() {
		let dir = std::env::temp_dir().join(format!("r2nova-unique-{}", Uuid::new_v4()));
		std::fs::create_dir_all(&dir).unwrap();
		let first = dir.join("logo.svg");
		std::fs::write(&first, b"a").unwrap();
		let next = unique_dest(&first);
		assert_eq!(next.file_name().unwrap(), "logo (1).svg");
		std::fs::write(&next, b"b").unwrap();
		assert_eq!(unique_dest(&first).file_name().unwrap(), "logo (2).svg");
		let _ = std::fs::remove_dir_all(&dir);
	}

	#[test]
	fn range_header_skips_zero() {
		assert_eq!(range_header(0), None);
		assert_eq!(range_header(512), Some("bytes=512-".into()));
	}

	#[test]
	fn total_from_content_range() {
		assert_eq!(total_from_range(Some("bytes 10-19/50"), 10, 10), 50);
		assert_eq!(total_from_range(None, 10, 5), 15);
	}

	#[test]
	fn park_orphans_marks_running_paused() {
		let mut jobs = HashMap::new();
		jobs.insert(
			"t1".into(),
			TransferProgress {
				transfer_id: "t1".into(),
				key: "a".into(),
				direction: TransferDirection::Download,
				bytes_done: 4,
				bytes_total: 10,
				status: TransferStatus::Running,
				error: None,
				profile_id: "p".into(),
				bucket: "b".into(),
				path: String::new(),
				pausable: true,
			},
		);
		jobs.insert(
			"t2".into(),
			TransferProgress {
				transfer_id: "t2".into(),
				key: "b".into(),
				direction: TransferDirection::Upload,
				bytes_done: 1,
				bytes_total: 2,
				status: TransferStatus::Completed,
				error: None,
				profile_id: "p".into(),
				bucket: "b".into(),
				path: String::new(),
				pausable: false,
			},
		);
		assert!(park_orphans(Path::new("."), &mut jobs));
		assert_eq!(jobs["t1"].status, TransferStatus::Paused);
		assert_eq!(jobs["t2"].status, TransferStatus::Completed);
	}

	#[test]
	fn old_queue_json_defaults_new_fields() {
		let job: TransferProgress = serde_json::from_str(
			r#"{"transferId":"t","key":"k","direction":"upload","bytesDone":1,"bytesTotal":2,"status":"running"}"#,
		)
		.unwrap();
		assert_eq!(job.bucket, "");
		assert!(!job.pausable);
	}

	fn sample_job(id: &str, status: TransferStatus, pausable: bool) -> TransferProgress {
		TransferProgress {
			transfer_id: id.into(),
			key: "a.bin".into(),
			direction: TransferDirection::Download,
			bytes_done: 1,
			bytes_total: 1,
			status,
			error: None,
			profile_id: "p".into(),
			bucket: "b".into(),
			path: String::new(),
			pausable,
		}
	}

	#[tokio::test]
	async fn dismiss_drops_finished_from_saved_queue() {
		let dir = tempfile::tempdir().unwrap();
		let engine = TransferEngine::new(dir.path().to_path_buf());
		engine
			.upsert(sample_job("done", TransferStatus::Completed, false))
			.await;
		engine
			.upsert(sample_job("live", TransferStatus::Running, true))
			.await;
		assert_eq!(engine.list().await.len(), 2);

		engine.dismiss("done").await.unwrap();
		let ids: Vec<_> = engine
			.list()
			.await
			.into_iter()
			.map(|job| job.transfer_id)
			.collect();
		assert_eq!(ids, vec!["live".to_string()]);

		let saved = load_jobs(dir.path());
		assert_eq!(saved.len(), 1);
		assert!(saved.contains_key("live"));
		assert!(!saved.contains_key("done"));
		assert!(engine.dismiss("live").await.is_err());
	}

	#[test]
	fn resume_rejects_size_mismatch() {
		let resume = ResumeState {
			transfer_id: "t".into(),
			bucket: "b".into(),
			key: "k".into(),
			path: "/nope".into(),
			size: 10,
			chunk: 8,
			upload_id: "u".into(),
			completed: vec![],
		};
		assert!(!resume_matches(&resume, "/nope", 11));
	}

	#[test]
	fn job_limit_clamps_to_1_16() {
		assert_eq!(clamp_job_limit(0), 1);
		assert_eq!(clamp_job_limit(5), 5);
		assert_eq!(clamp_job_limit(16), 16);
		assert_eq!(clamp_job_limit(99), 16);
	}

	#[test]
	fn unique_dest_skips_taken_paths() {
		let dir = std::env::temp_dir().join(format!("r2nova-taken-{}", Uuid::new_v4()));
		std::fs::create_dir_all(&dir).unwrap();
		let first = dir.join("logo.svg");
		let mut taken = HashSet::new();
		taken.insert(first.clone());
		assert_eq!(
			unique_dest_among(&first, &taken).file_name().unwrap(),
			"logo (1).svg"
		);
		let _ = std::fs::remove_dir_all(&dir);
	}

	#[tokio::test]
	async fn enqueue_download_lists_queued_jobs() {
		let dir = tempfile::tempdir().unwrap();
		let dest_dir = tempfile::tempdir().unwrap();
		let engine = TransferEngine::new(dir.path().to_path_buf());
		let a = dest_dir.path().join("a.bin");
		let b = dest_dir.path().join("b.bin");
		engine
			.enqueue_download("p", "bucket", "a.bin", a, true, 10, None, None)
			.await
			.unwrap();
		engine
			.enqueue_download("p", "bucket", "b.bin", b, true, 20, None, None)
			.await
			.unwrap();
		let mut list = engine.list().await;
		list.sort_by(|x, y| x.key.cmp(&y.key));
		assert_eq!(list.len(), 2);
		assert!(list.iter().all(|job| job.status == TransferStatus::Queued));
		assert_eq!(list[0].bytes_total, 10);
		assert_eq!(list[1].bytes_total, 20);
		assert_eq!(load_jobs(dir.path()).len(), 2);
	}
}
