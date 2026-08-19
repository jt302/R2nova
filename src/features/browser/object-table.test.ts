import { describe, expect, it } from 'vitest';
import type { ObjectItem } from '@/entities/profile/types';
import { objectFromEvent } from '@/features/browser/object-table';

const rows: ObjectItem[] = [
	{ key: 'a.png', name: 'a.png', size: 1, isPrefix: false },
	{ key: 'dir/', name: 'dir', size: 0, isPrefix: true },
];

describe('objectFromEvent', () => {
	it('resolves the nearest row and ignores empty space', () => {
		const scroller = document.createElement('div');
		const row = document.createElement('div');
		row.setAttribute('data-object-key', 'a.png');
		const name = document.createElement('span');
		name.textContent = 'a.png';
		row.append(name);
		scroller.append(row);

		expect(objectFromEvent(name, rows)?.key).toBe('a.png');
		expect(objectFromEvent(name.firstChild, rows)?.key).toBe('a.png');
		expect(objectFromEvent(scroller, rows)).toBeNull();
	});
});
