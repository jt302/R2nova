import { describe, expect, it } from 'vitest';
import type { TransferProgress } from '@/entities/profile/types';
import { etaParts, etaSecs, mergeQueue, sampleSpeed } from '@/shared/lib/transfer-queue';

function api(
	partial: Partial<TransferProgress> & Pick<TransferProgress, 'transferId'>,
): TransferProgress {
	return {
		key: partial.transferId,
		direction: 'upload',
		bytesDone: 0,
		bytesTotal: 10,
		status: 'running',
		...partial,
	};
}

describe('mergeQueue', () => {
	it('keeps api-only jobs when live already has items', () => {
		const live = {
			a: {
				id: 'a',
				key: 'a.bin',
				bytesDone: 4,
				bytesTotal: 10,
				status: 'running' as const,
			},
		};
		const merged = mergeQueue(
			live,
			[
				api({ transferId: 'a', direction: 'upload', bytesDone: 1 }),
				api({
					transferId: 'b',
					key: 'b.bin',
					direction: 'download',
					status: 'completed',
					bytesDone: 9,
					bytesTotal: 9,
				}),
			],
			{},
		);
		expect(merged.map((row) => row.id)).toEqual(['a', 'b']);
		expect(merged.find((row) => row.id === 'a')?.bytesDone).toBe(4);
		expect(merged.find((row) => row.id === 'a')?.direction).toBe('upload');
		expect(merged.find((row) => row.id === 'b')?.direction).toBe('download');
	});

	it('omits dismissed ids', () => {
		const merged = mergeQueue(
			{
				a: { id: 'a', key: 'a', bytesDone: 1, bytesTotal: 1, status: 'completed' },
			},
			[api({ transferId: 'a', status: 'completed' }), api({ transferId: 'b' })],
			{ a: true },
		);
		expect(merged.map((row) => row.id)).toEqual(['b']);
	});
});

describe('sampleSpeed / eta', () => {
	it('computes instantaneous rate from a 200ms sample', () => {
		expect(sampleSpeed({ bytes: 0, at: 0 }, 1_000_000, 200)).toBe(5_000_000);
	});

	it('keeps the previous rate when the interval is too small', () => {
		expect(sampleSpeed({ bytes: 0, at: 0, speedBps: 100 }, 50, 20)).toBe(100);
	});

	it('returns no eta for zero progress, completion, or missing speed', () => {
		expect(etaSecs(0, 100, undefined)).toBe(0);
		expect(etaSecs(0, 100, 0)).toBe(0);
		expect(etaSecs(100, 100, 50)).toBe(0);
		expect(etaParts(0)).toBeNull();
		expect(etaParts(-1)).toBeNull();
	});

	it('formats remaining time buckets', () => {
		expect(etaParts(12)).toEqual({ key: 'seconds', count: 12 });
		expect(etaParts(etaSecs(0, 10_000_000, 10_000_000))).toEqual({ key: 'seconds', count: 1 });
		expect(etaParts(90)).toEqual({ key: 'minutes', count: 2 });
		expect(etaParts(3661)).toEqual({ key: 'hours', h: 1, m: 1 });
	});
});
