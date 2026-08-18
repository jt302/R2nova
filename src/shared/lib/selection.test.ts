import { describe, expect, it } from 'vitest';
import {
	clearSelection,
	isSelected,
	selectAll,
	selectedCount,
	selectedKeys,
	selectRange,
	toggleKey,
} from '@/shared/lib/selection';

describe('selection algebra', () => {
	it('include mode toggles membership', () => {
		let s = clearSelection();
		s = toggleKey(s, 'a');
		expect(isSelected(s, 'a')).toBe(true);
		s = toggleKey(s, 'a');
		expect(isSelected(s, 'a')).toBe(false);
	});

	it('all-except represents select-all minus a few', () => {
		let s = selectAll();
		expect(selectedCount(s, 200_000)).toBe(200_000);
		s = toggleKey(s, 'skip-me');
		expect(isSelected(s, 'skip-me')).toBe(false);
		expect(isSelected(s, 'keep-me')).toBe(true);
		expect(selectedCount(s, 200_000)).toBe(199_999);
	});

	it('range select uses inclusive indices', () => {
		const keys = ['a', 'b', 'c', 'd'];
		const s = selectRange(keys, 1, 3);
		expect(selectedKeys(s, keys)).toEqual(['b', 'c', 'd']);
	});
});
