export function normalizePrefix(prefix: string): string {
	const trimmed = prefix.replace(/^\/+/, '');
	if (!trimmed) {
		return '';
	}
	return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export function parentPrefix(prefix: string): string {
	const normalized = normalizePrefix(prefix);
	if (!normalized) {
		return '';
	}
	const without = normalized.replace(/\/$/, '');
	const i = without.lastIndexOf('/');
	return i === -1 ? '' : `${without.slice(0, i + 1)}`;
}

export function joinKey(prefix: string, name: string): string {
	return `${normalizePrefix(prefix)}${name.replace(/^\/+/, '')}`;
}

export function formatBytes(n: number): string {
	if (!Number.isFinite(n)) {
		return '0 B';
	}
	if (n < 1024) {
		return `${n} B`;
	}
	const units = ['KB', 'MB', 'GB', 'TB'];
	let v = n / 1024;
	let i = 0;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i += 1;
	}
	return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

export function fileKind(key: string): 'image' | 'video' | 'pdf' | 'text' | 'markdown' | 'other' {
	const ext = key.split('.').pop()?.toLowerCase() ?? '';
	if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) {
		return 'image';
	}
	if (['mp4', 'webm', 'mov', 'm4v'].includes(ext)) {
		return 'video';
	}
	if (ext === 'pdf') {
		return 'pdf';
	}
	if (['md', 'markdown'].includes(ext)) {
		return 'markdown';
	}
	if (
		[
			'txt',
			'json',
			'yaml',
			'yml',
			'toml',
			'ts',
			'tsx',
			'js',
			'jsx',
			'rs',
			'py',
			'css',
			'html',
			'xml',
			'csv',
		].includes(ext)
	) {
		return 'text';
	}
	return 'other';
}
