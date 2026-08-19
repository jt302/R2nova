export const queryKeys = {
	profiles: ['profiles'] as const,
	buckets: (profileId: string) => ['buckets', profileId] as const,
	objects: (profileId: string, bucket: string, prefix: string) =>
		['objects', profileId, bucket, prefix] as const,
	object: (profileId: string, bucket: string, key: string) =>
		['object', profileId, bucket, key] as const,
	previewFile: (profileId: string, bucket: string, key: string) =>
		['preview-file', profileId, bucket, key] as const,
	previewSign: (profileId: string, bucket: string, key: string) =>
		['preview-sign', profileId, bucket, key] as const,
	cost: ['cost'] as const,
	version: ['version'] as const,
	appUpdate: ['app-update'] as const,
	transfers: ['transfers'] as const,
	multipart: (profileId: string, bucket: string) => ['multipart', profileId, bucket] as const,
	cf: {
		cors: (profileId: string, bucket: string) => ['cf', 'cors', profileId, bucket] as const,
		lifecycle: (profileId: string, bucket: string) =>
			['cf', 'lifecycle', profileId, bucket] as const,
		devUrl: (profileId: string, bucket: string) => ['cf', 'devUrl', profileId, bucket] as const,
		domains: (profileId: string, bucket: string) => ['cf', 'domains', profileId, bucket] as const,
		lock: (profileId: string, bucket: string) => ['cf', 'lock', profileId, bucket] as const,
		metrics: (profileId: string) => ['cf', 'metrics', profileId] as const,
		events: (profileId: string, bucket: string) => ['cf', 'events', profileId, bucket] as const,
	},
};
