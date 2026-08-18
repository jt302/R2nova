import type {
	BucketItem,
	CostQuote,
	CostSnapshot,
	ListObjectsPage,
	MultipartUploadItem,
	ObjectDetail,
	PresignResult,
	Profile,
	TransferProgress,
} from '@/entities/profile/types';
import { tauriInvoke } from '@/shared/api/tauri-invoke';

export const api = {
	listProfiles: () => tauriInvoke<Profile[]>('list_profiles'),
	upsertProfile: (args: {
		id?: string;
		name: string;
		accountId: string;
		accessKeyId: string;
		secretAccessKey: string;
		jurisdiction: Profile['jurisdiction'];
		cfApiToken?: string;
	}) => tauriInvoke<Profile>('upsert_profile', args),
	deleteProfile: (id: string) => tauriInvoke<void>('delete_profile', { id }),
	probeProfile: (id: string) => tauriInvoke<Profile>('probe_profile', { id }),
	getProfile: (id: string) => tauriInvoke<Profile>('get_profile', { id }),
	listBuckets: (profileId: string) => tauriInvoke<BucketItem[]>('list_buckets', { profileId }),
	listObjects: (args: {
		profileId: string;
		bucket: string;
		prefix: string;
		continuationToken?: string | null;
	}) => tauriInvoke<ListObjectsPage>('list_objects', args),
	headObject: (args: { profileId: string; bucket: string; key: string }) =>
		tauriInvoke<ObjectDetail>('head_object', args),
	quoteListAll: (objectCount: number) => tauriInvoke<CostQuote>('quote_list_all', { objectCount }),
	deleteObjects: (args: { profileId: string; bucket: string; keys: string[] }) =>
		tauriInvoke<number>('delete_objects', args),
	deletePrefix: (args: { profileId: string; bucket: string; prefix: string }) =>
		tauriInvoke<number>('delete_prefix', args),
	quoteDeletePrefix: (objectCount: number) =>
		tauriInvoke<CostQuote>('quote_delete_prefix', { objectCount }),
	copyObject: (args: {
		profileId: string;
		srcBucket: string;
		srcKey: string;
		dstBucket: string;
		dstKey: string;
	}) => tauriInvoke<void>('copy_object', args),
	renameObject: (args: { profileId: string; bucket: string; srcKey: string; dstKey: string }) =>
		tauriInvoke<void>('rename_object', args),
	moveObjects: (args: { profileId: string; bucket: string; keys: string[]; dstPrefix: string }) =>
		tauriInvoke<number>('move_objects', args),
	listMultipart: (profileId: string, bucket: string) =>
		tauriInvoke<MultipartUploadItem[]>('list_multipart_uploads', { profileId, bucket }),
	abortMultipart: (args: { profileId: string; bucket: string; key: string; uploadId: string }) =>
		tauriInvoke<void>('abort_multipart_upload', args),
	putObjectMetadata: (args: {
		profileId: string;
		bucket: string;
		key: string;
		metadata: [string, string][];
	}) => tauriInvoke<void>('put_object_metadata', args),
	uploadPaths: (args: {
		profileId: string;
		bucket: string;
		prefix: string;
		paths: string[];
		onEvent: unknown;
	}) => tauriInvoke<string[]>('upload_paths', args),
	downloadObject: (args: {
		profileId: string;
		bucket: string;
		key: string;
		dest: string;
		onEvent: unknown;
	}) => tauriInvoke<string>('download_object', args),
	listTransfers: () => tauriInvoke<TransferProgress[]>('list_transfers'),
	cancelTransfer: (transferId: string) => tauriInvoke<void>('cancel_transfer', { transferId }),
	previewObject: (args: { profileId: string; bucket: string; key: string }) =>
		tauriInvoke<string>('preview_object', args),
	presignGet: (args: { profileId: string; bucket: string; key: string; expiresInSecs: number }) =>
		tauriInvoke<PresignResult>('presign_get', args),
	costSnapshot: () => tauriInvoke<CostSnapshot>('cost_snapshot'),
	costReset: () => tauriInvoke<void>('cost_reset'),
	costEstimate: (classA: number, classB: number) =>
		tauriInvoke<number>('cost_estimate', { classA, classB }),
	appVersion: () => tauriInvoke<string>('app_version'),
	checkLatestRelease: () => tauriInvoke<string | null>('check_latest_release'),
	cfCreateBucket: (profileId: string, name: string) =>
		tauriInvoke<void>('cf_create_bucket', { profileId, name }),
	cfDeleteBucket: (profileId: string, name: string) =>
		tauriInvoke<void>('cf_delete_bucket', { profileId, name }),
	cfGetCors: (profileId: string, bucket: string) =>
		tauriInvoke<unknown>('cf_get_cors', { profileId, bucket }),
	cfPutCors: (profileId: string, bucket: string, rules: unknown) =>
		tauriInvoke<void>('cf_put_cors', { profileId, bucket, rules }),
	cfGetLifecycle: (profileId: string, bucket: string) =>
		tauriInvoke<unknown>('cf_get_lifecycle', { profileId, bucket }),
	cfPutLifecycle: (profileId: string, bucket: string, rules: unknown) =>
		tauriInvoke<void>('cf_put_lifecycle', { profileId, bucket, rules }),
	cfGetDevUrl: (profileId: string, bucket: string) =>
		tauriInvoke<unknown>('cf_get_dev_url', { profileId, bucket }),
	cfSetDevUrl: (profileId: string, bucket: string, enabled: boolean) =>
		tauriInvoke<unknown>('cf_set_dev_url', { profileId, bucket, enabled }),
	cfListCustomDomains: (profileId: string, bucket: string) =>
		tauriInvoke<unknown>('cf_list_custom_domains', { profileId, bucket }),
	cfGetLock: (profileId: string, bucket: string) =>
		tauriInvoke<unknown>('cf_get_lock', { profileId, bucket }),
	cfPutLock: (profileId: string, bucket: string, body: unknown) =>
		tauriInvoke<void>('cf_put_lock', { profileId, bucket, body }),
	cfMetrics: (profileId: string) => tauriInvoke<unknown>('cf_metrics', { profileId }),
	cfGetEvents: (profileId: string, bucket: string) =>
		tauriInvoke<unknown>('cf_get_events', { profileId, bucket }),
	cfPutEvents: (profileId: string, bucket: string, body: unknown) =>
		tauriInvoke<void>('cf_put_events', { profileId, bucket, body }),
	revealItem: (path: string) => tauriInvoke<void>('reveal_item', { path }),
};
