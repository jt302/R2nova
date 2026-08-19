import { describe, expect, it } from 'vitest';
import type { TransferEvent } from '@/entities/profile/types';
import { applyTransferEvent } from '@/shared/lib/transfer-channel';

describe('applyTransferEvent', () => {
	it('keeps started jobs queued until they run', () => {
		const ev = {
			event: 'started',
			data: {
				transferId: 't1',
				key: 'a.bin',
				bytesTotal: 10,
				bytesDone: 0,
				direction: 'download',
				bucket: 'assets',
				path: '/tmp/a.bin',
				pausable: true,
				status: 'queued',
			},
		} satisfies TransferEvent;
		expect(applyTransferEvent(undefined, ev, 1_000)?.status).toBe('queued');
	});

	it('defaults started without status to running', () => {
		const ev = {
			event: 'started',
			data: {
				transferId: 't1',
				key: 'a.bin',
				bytesTotal: 10,
				bytesDone: 0,
				direction: 'download',
				bucket: 'assets',
				path: '/tmp/a.bin',
				pausable: true,
			},
		} satisfies TransferEvent;
		expect(applyTransferEvent(undefined, ev, 1_000)?.status).toBe('running');
	});
});
