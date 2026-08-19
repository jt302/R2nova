export type Jurisdiction = 'default' | 'eu' | 'fedramp';
export type TokenCapability = 'unknown' | 'invalid' | 'object' | 'admin';

export type Profile = {
	id: string;
	name: string;
	accountId: string;
	accessKeyId: string;
	jurisdiction: Jurisdiction;
	hasCfToken: boolean;
	capability: TokenCapability;
	lastError?: string | null;
};

export type BucketItem = {
	name: string;
	creationDate?: string | null;
};

export type ObjectItem = {
	key: string;
	name: string;
	size: number;
	lastModified?: string | null;
	etag?: string | null;
	storageClass?: string | null;
	isPrefix: boolean;
};

export type ListObjectsPage = {
	objects: ObjectItem[];
	prefixes: ObjectItem[];
	isTruncated: boolean;
	nextContinuationToken?: string | null;
};

export type ObjectDetail = {
	key: string;
	size: number;
	lastModified?: string | null;
	etag?: string | null;
	contentType?: string | null;
	storageClass?: string | null;
	metadata: [string, string][];
};

export type CostSnapshot = {
	classA: number;
	classB: number;
	free: number;
	estimatedUsd: number;
};

export type CostQuote = {
	classA: number;
	classB: number;
	free: number;
	note: string;
};

export type TransferProgress = {
	transferId: string;
	key: string;
	direction: 'upload' | 'download';
	bytesDone: number;
	bytesTotal: number;
	status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
	error?: string | null;
	profileId?: string;
	bucket?: string;
	path?: string;
	pausable?: boolean;
};

export type MultipartUploadItem = {
	key: string;
	uploadId: string;
	initiated?: string | null;
};

export type PresignResult = {
	url: string;
	expiresInSecs: number;
};

export type TransferEvent =
	| {
			event: 'started';
			data: {
				transferId: string;
				key: string;
				bytesTotal: number;
				bytesDone: number;
				direction: TransferProgress['direction'];
				bucket: string;
				path: string;
				pausable: boolean;
				status?: TransferProgress['status'];
			};
	  }
	| { event: 'progress'; data: { transferId: string; bytesDone: number; bytesTotal: number } }
	| { event: 'paused'; data: { transferId: string } }
	| { event: 'cancelled'; data: { transferId: string } }
	| { event: 'finished'; data: { transferId: string } }
	| { event: 'failed'; data: { transferId: string; message: string } };
