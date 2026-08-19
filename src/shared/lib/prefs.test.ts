import { describe, expect, it } from 'vitest';
import {
	clampPreviewSize,
	clampSidebarWidth,
	detectLanguage,
	PREVIEW_DEFAULT_PCT,
	PREVIEW_MAX_PCT,
	PREVIEW_MIN_PCT,
	readStoredPrefs,
	SIDEBAR_DEFAULT_PX,
	SIDEBAR_MAX_PX,
	SIDEBAR_MIN_PX,
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
