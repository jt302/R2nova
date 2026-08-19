import { describe, expect, it } from 'vitest';
import { resolvedDark, windowTheme } from '@/shared/lib/theme';

describe('theme', () => {
	it('resolves dark from explicit and system preference', () => {
		expect(resolvedDark('dark', false)).toBe(true);
		expect(resolvedDark('light', true)).toBe(false);
		expect(resolvedDark('system', true)).toBe(true);
		expect(resolvedDark('system', false)).toBe(false);
	});

	it('maps window theme null when following system', () => {
		expect(windowTheme('system')).toBeNull();
		expect(windowTheme('dark')).toBe('dark');
		expect(windowTheme('light')).toBe('light');
	});
});
