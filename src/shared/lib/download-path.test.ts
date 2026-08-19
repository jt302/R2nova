import { describe, expect, it } from 'vitest';
import { downloadDest, joinDest } from '@/shared/lib/download-path';

describe('downloadDest', () => {
	it('joins posix dirs', () => {
		expect(joinDest('/Users/me/Downloads', 'a.bin')).toBe('/Users/me/Downloads/a.bin');
		expect(joinDest('/tmp/', 'a.bin')).toBe('/tmp/a.bin');
	});

	it('joins windows dirs', () => {
		expect(joinDest('C:\\Users\\me\\Downloads', 'a.bin')).toBe('C:\\Users\\me\\Downloads\\a.bin');
	});

	it('returns null without a default directory', () => {
		expect(downloadDest(null, 'a.bin')).toBeNull();
		expect(downloadDest(undefined, 'a.bin')).toBeNull();
		expect(downloadDest('/tmp', 'a.bin')).toBe('/tmp/a.bin');
	});
});
