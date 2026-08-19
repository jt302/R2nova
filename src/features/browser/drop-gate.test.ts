import { describe, expect, it } from 'vitest';
import { createDropGate } from '@/features/browser/drop-gate';

describe('createDropGate', () => {
	it('rejects the same paths inside the window', () => {
		const take = createDropGate(400);
		expect(take(['/tmp/todo.txt'], 1000)).toBe(true);
		expect(take(['/tmp/todo.txt'], 1100)).toBe(false);
		expect(take(['/tmp/todo.txt'], 1399)).toBe(false);
	});

	it('accepts a different path inside the window', () => {
		const take = createDropGate(400);
		expect(take(['/tmp/a.txt'], 1000)).toBe(true);
		expect(take(['/tmp/b.txt'], 1100)).toBe(true);
	});

	it('accepts the same paths after the window', () => {
		const take = createDropGate(400);
		expect(take(['/tmp/todo.txt'], 1000)).toBe(true);
		expect(take(['/tmp/todo.txt'], 1400)).toBe(true);
	});
});
