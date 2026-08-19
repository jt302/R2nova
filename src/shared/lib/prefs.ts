export const NAV_STORAGE_KEY = 'r2nova-nav';

export type AppLanguage = 'zh-CN' | 'en-US';

export const SIDEBAR_MIN_PX = 240;
export const SIDEBAR_MAX_PX = 420;
export const SIDEBAR_DEFAULT_PX = 260;
export const PREVIEW_MIN_PCT = 18;
export const PREVIEW_MAX_PCT = 45;
export const PREVIEW_DEFAULT_PCT = 28;
export const TRANSFER_CONCURRENCY_MIN = 1;
export const TRANSFER_CONCURRENCY_MAX = 16;
export const TRANSFER_CONCURRENCY_DEFAULT = 5;

export function clampSidebarWidth(px: number): number {
	if (!Number.isFinite(px)) {
		return SIDEBAR_DEFAULT_PX;
	}
	return Math.min(SIDEBAR_MAX_PX, Math.max(SIDEBAR_MIN_PX, Math.round(px)));
}

export function clampPreviewSize(pct: number): number {
	if (!Number.isFinite(pct)) {
		return PREVIEW_DEFAULT_PCT;
	}
	return Math.min(PREVIEW_MAX_PCT, Math.max(PREVIEW_MIN_PCT, pct));
}

export function clampTransferConcurrency(n: number): number {
	if (!Number.isFinite(n)) {
		return TRANSFER_CONCURRENCY_DEFAULT;
	}
	return Math.min(TRANSFER_CONCURRENCY_MAX, Math.max(TRANSFER_CONCURRENCY_MIN, Math.round(n)));
}

export function parseLanguage(value: unknown): AppLanguage | undefined {
	return value === 'zh-CN' || value === 'en-US' ? value : undefined;
}

export function detectLanguage(stored?: string | null, browserLanguage = ''): AppLanguage {
	return parseLanguage(stored) ?? (browserLanguage.startsWith('en') ? 'en-US' : 'zh-CN');
}

export type StoredPrefs = {
	language?: AppLanguage;
	sidebarWidth?: number;
	previewSize?: number;
};

export function readStoredPrefs(raw?: string | null): StoredPrefs {
	let text = raw;
	if (text == null && typeof localStorage !== 'undefined') {
		try {
			text = localStorage.getItem(NAV_STORAGE_KEY);
		} catch {
			return {};
		}
	}
	if (!text) {
		return {};
	}
	try {
		const parsed = JSON.parse(text) as {
			state?: { language?: unknown; sidebarWidth?: unknown; previewSize?: unknown };
		};
		const state = parsed.state ?? {};
		return {
			language: parseLanguage(state.language),
			sidebarWidth: typeof state.sidebarWidth === 'number' ? state.sidebarWidth : undefined,
			previewSize: typeof state.previewSize === 'number' ? state.previewSize : undefined,
		};
	} catch {
		return {};
	}
}

export function initialLanguage(browserLanguage?: string): AppLanguage {
	const browser = browserLanguage ?? (typeof navigator !== 'undefined' ? navigator.language : '');
	return detectLanguage(readStoredPrefs().language, browser);
}

export function initialSidebarWidth(): number {
	return clampSidebarWidth(readStoredPrefs().sidebarWidth ?? SIDEBAR_DEFAULT_PX);
}

export function initialPreviewSize(): number {
	return clampPreviewSize(readStoredPrefs().previewSize ?? PREVIEW_DEFAULT_PCT);
}
