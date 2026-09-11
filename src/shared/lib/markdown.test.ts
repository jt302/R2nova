import { describe, expect, it } from 'vitest';
import { externalHref, fenceLanguage } from '@/shared/lib/markdown';

describe('externalHref', () => {
	it('treats http, https, and mailto as external', () => {
		expect(externalHref('https://example.com')).toBe(true);
		expect(externalHref('http://example.com/path')).toBe(true);
		expect(externalHref('mailto:hi@example.com')).toBe(true);
	});

	it('rejects relative paths and anchors', () => {
		expect(externalHref('./readme.md')).toBe(false);
		expect(externalHref('/docs/guide')).toBe(false);
		expect(externalHref('#heading')).toBe(false);
	});

	it('rejects missing or empty href', () => {
		expect(externalHref(undefined)).toBe(false);
		expect(externalHref(null)).toBe(false);
		expect(externalHref('')).toBe(false);
	});
});

describe('fenceLanguage', () => {
	it('reads the language-* token', () => {
		expect(fenceLanguage('language-ts')).toBe('ts');
		expect(fenceLanguage('foo language-json extra')).toBe('json');
	});

	it('returns undefined without a language class', () => {
		expect(fenceLanguage(undefined)).toBeUndefined();
		expect(fenceLanguage('')).toBeUndefined();
		expect(fenceLanguage('not-a-lang')).toBeUndefined();
		expect(fenceLanguage('language-')).toBeUndefined();
	});
});
