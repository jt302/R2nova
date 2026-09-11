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
// ponytail: 上限 150%。窗口 minWidth 960，再大 CSS 视口不够侧栏+表格。要更高缩放先放宽窗口最小值或改成只缩放内容区。
export const ZOOM_STEPS = [0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5] as const;
export const ZOOM_DEFAULT = 1;

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

export function clampZoom(z: number): number {
	if (!Number.isFinite(z)) {
		return ZOOM_DEFAULT;
	}
	let nearest: number = ZOOM_STEPS[0];
	let best = Number.POSITIVE_INFINITY;
	for (const step of ZOOM_STEPS) {
		const delta = Math.abs(step - z);
		if (delta < best) {
			best = delta;
			nearest = step;
		}
	}
	return nearest;
}

export function stepZoom(z: number, dir: 1 | -1): number {
	const current = clampZoom(z);
	const index = ZOOM_STEPS.indexOf(current as (typeof ZOOM_STEPS)[number]);
	const next = index + dir;
	if (next < 0) {
		return ZOOM_STEPS[0];
	}
	if (next >= ZOOM_STEPS.length) {
		return ZOOM_STEPS[ZOOM_STEPS.length - 1];
	}
	return ZOOM_STEPS[next];
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
