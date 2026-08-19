export function joinDest(dir: string, name: string): string {
	const win = dir.includes('\\') && !dir.includes('/');
	const sep = win ? '\\' : '/';
	return `${dir.replace(/[\\/]+$/, '')}${sep}${name}`;
}

export function downloadDest(
	downloadDir: string | null | undefined,
	basename: string,
): string | null {
	if (!downloadDir) {
		return null;
	}
	return joinDest(downloadDir, basename);
}
