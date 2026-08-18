import { describe, expect, it } from 'vitest';
import { formatBytes, joinKey, normalizePrefix, parentPrefix } from '@/shared/lib/object-key';

describe('object key helpers', () => {
	it('normalizes prefixes', () => {
		expect(normalizePrefix('')).toBe('');
		expect(normalizePrefix('foo')).toBe('foo/');
		expect(normalizePrefix('/foo/bar')).toBe('foo/bar/');
	});

	it('walks up a prefix', () => {
		expect(parentPrefix('a/b/c/')).toBe('a/b/');
		expect(parentPrefix('a/')).toBe('');
	});

	it('joins keys', () => {
		expect(joinKey('photos', 'cat.png')).toBe('photos/cat.png');
	});

	it('formats bytes', () => {
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(2048)).toBe('2.0 KB');
		expect(formatBytes(Number.NaN)).toBe('0 B');
		expect(formatBytes(undefined as unknown as number)).toBe('0 B');
	});
});
