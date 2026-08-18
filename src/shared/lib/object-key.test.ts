import { describe, expect, it } from 'vitest';
import {
	fileKind,
	formatBytes,
	formatModified,
	joinKey,
	normalizePrefix,
	parentPrefix,
	profileInitials,
} from '@/shared/lib/object-key';

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

	it('formats modified timestamps', () => {
		expect(formatModified(null)).toBe('');
		expect(formatModified('not-a-date')).toBe('not-a-date');
		expect(formatModified('2024-01-02T03:04:00.000Z', 'en-US')).toMatch(/2024/);
	});

	it('classifies previewable text', () => {
		expect(fileKind('a.sql')).toBe('text');
		expect(fileKind('logo.svg')).toBe('image');
		expect(fileKind('skills.zip')).toBe('other');
	});

	it('builds profile initials', () => {
		expect(profileInitials('')).toBe('R');
		expect(profileInitials('prod')).toBe('PR');
		expect(profileInitials('工作室')).toBe('工作');
	});
});
