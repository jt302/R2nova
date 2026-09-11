import { describe, expect, it } from 'vitest';
import {
	clampPreviewSize,
	clampSidebarWidth,
	clampTransferConcurrency,
	clampZoom,
	detectLanguage,
	PREVIEW_DEFAULT_PCT,
	PREVIEW_MAX_PCT,
	PREVIEW_MIN_PCT,
	readStoredPrefs,
	SIDEBAR_DEFAULT_PX,
	SIDEBAR_MAX_PX,
	SIDEBAR_MIN_PX,
	stepZoom,
	TRANSFER_CONCURRENCY_DEFAULT,
	TRANSFER_CONCURRENCY_MAX,
	TRANSFER_CONCURRENCY_MIN,
	ZOOM_DEFAULT,
} from '@/shared/lib/prefs';

describe('prefs', () => {
	it('clamps sidebar width to 240–420px', () => {
		expect(clampSidebarWidth(260)).toBe(260);
		expect(clampSidebarWidth(239)).toBe(SIDEBAR_MIN_PX);
		expect(clampSidebarWidth(421)).toBe(SIDEBAR_MAX_PX);
		expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_DEFAULT_PX);
	});

	it('clamps preview size to 18–45%', () => {
		expect(clampPreviewSize(28)).toBe(28);
		expect(clampPreviewSize(10)).toBe(PREVIEW_MIN_PCT);
		expect(clampPreviewSize(90)).toBe(PREVIEW_MAX_PCT);
		expect(clampPreviewSize(Number.NaN)).toBe(PREVIEW_DEFAULT_PCT);
	});

	it('clamps transfer concurrency to 1–16', () => {
		expect(clampTransferConcurrency(5)).toBe(5);
		expect(clampTransferConcurrency(0)).toBe(TRANSFER_CONCURRENCY_MIN);
		expect(clampTransferConcurrency(99)).toBe(TRANSFER_CONCURRENCY_MAX);
		expect(clampTransferConcurrency(Number.NaN)).toBe(TRANSFER_CONCURRENCY_DEFAULT);
	});

	it('snaps zoom to the nearest step and stays within 75–150%', () => {
		expect(clampZoom(1)).toBe(1);
		expect(clampZoom(1.07)).toBe(1.1);
		expect(clampZoom(0.5)).toBe(0.75);
		expect(clampZoom(3)).toBe(1.5);
		expect(clampZoom(Number.NaN)).toBe(ZOOM_DEFAULT);
	});

	it('steps zoom to the next preset and stops at the ends', () => {
		expect(stepZoom(1, 1)).toBe(1.1);
		expect(stepZoom(1.1, -1)).toBe(1);
		expect(stepZoom(0.75, -1)).toBe(0.75);
		expect(stepZoom(1.5, 1)).toBe(1.5);
		expect(stepZoom(1.07, 1)).toBe(1.25);
	});

	it('prefers stored language over the browser locale', () => {
		expect(detectLanguage('en-US', 'zh-CN')).toBe('en-US');
		expect(detectLanguage('zh-CN', 'en-US')).toBe('zh-CN');
		expect(detectLanguage(undefined, 'en-GB')).toBe('en-US');
		expect(detectLanguage(undefined, 'zh-Hans')).toBe('zh-CN');
		expect(detectLanguage('de', 'fr')).toBe('zh-CN');
	});

	it('reads language and panel sizes from r2nova-nav JSON', () => {
		const prefs = readStoredPrefs(
			JSON.stringify({
				state: { language: 'en-US', sidebarWidth: 400, previewSize: 32 },
			}),
		);
		expect(prefs).toEqual({ language: 'en-US', sidebarWidth: 400, previewSize: 32 });
		expect(readStoredPrefs('{')).toEqual({});
		expect(readStoredPrefs(JSON.stringify({ state: { language: 'de' } }))).toEqual({
			language: undefined,
			sidebarWidth: undefined,
			previewSize: undefined,
		});
	});
});
