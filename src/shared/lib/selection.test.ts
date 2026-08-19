import { describe, expect, it } from 'vitest';
import {
	actionKeys,
	clearSelection,
	contextActionKeys,
	isSelected,
	partitionSelected,
	selectAll,
	selectedCount,
	selectedKeys,
	selectionCaps,
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

	it('action keys prefer the selection and never invent a target', () => {
		expect(actionKeys(['a', 'b'], 'c')).toEqual(['a', 'b']);
		expect(actionKeys([], 'c')).toEqual(['c']);
		expect(actionKeys([], null)).toEqual([]);
		expect(actionKeys([])).toEqual([]);
	});

	it('partitions selected keys into files and prefixes', () => {
		const rows = [
			{ key: 'a.png', isPrefix: false },
			{ key: 'dir/', isPrefix: true },
			{ key: 'b.md', isPrefix: false },
		];
		expect(partitionSelected(rows, ['a.png', 'dir/'])).toEqual({
			files: ['a.png'],
			prefixes: ['dir/'],
		});
		expect(partitionSelected(rows, ['missing'])).toEqual({ files: [], prefixes: [] });
	});

	it('gates object actions by file vs folder mix', () => {
		expect(selectionCaps({ files: ['a'], prefixes: [] })).toMatchObject({
			canPreview: true,
			canDownload: true,
			canRename: true,
			canMove: true,
			canDelete: true,
		});
		expect(selectionCaps({ files: ['a', 'b'], prefixes: [] })).toMatchObject({
			canPreview: false,
			canDownload: true,
			canRename: false,
			canMove: true,
			canDelete: true,
		});
		expect(selectionCaps({ files: ['a'], prefixes: ['dir/'] })).toMatchObject({
			canDownload: false,
			canMove: false,
			canDelete: true,
		});
		expect(selectionCaps({ files: [], prefixes: ['dir/'] })).toMatchObject({
			canDownload: false,
			canRename: false,
			canMove: false,
			canDelete: true,
		});
	});

	it('context keys use the clicked row until it is in the selection', () => {
		const all = ['a', 'b', 'c'];
		const multi = { mode: 'include' as const, keys: new Set(['a', 'b']) };
		expect(contextActionKeys(multi, all, 'c')).toEqual(['c']);
		expect(contextActionKeys(multi, all, 'a')).toEqual(['a', 'b']);
		expect(contextActionKeys(clearSelection(), all, 'c')).toEqual(['c']);
	});
});
