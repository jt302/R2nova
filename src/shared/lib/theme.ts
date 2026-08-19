export type AppTheme = 'light' | 'dark' | 'system';

export function resolvedDark(theme: AppTheme, prefersDark: boolean): boolean {
	return theme === 'dark' || (theme === 'system' && prefersDark);
}

export function windowTheme(theme: AppTheme): 'light' | 'dark' | null {
	return theme === 'system' ? null : theme;
}

export function applyDocumentTheme(theme: AppTheme, prefersDark: boolean): void {
	const dark = resolvedDark(theme, prefersDark);
	const root = document.documentElement;
	root.classList.toggle('dark', dark);
	root.style.colorScheme = dark ? 'dark' : 'light';
}
