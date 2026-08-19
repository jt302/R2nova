import { Channel } from '@tauri-apps/api/core';
import type { TransferEvent } from '@/entities/profile/types';
import { type QueueItem, sampleSpeed } from '@/shared/lib/transfer-queue';
import { useTransferStore } from '@/store/transfer';

export function applyTransferEvent(
	prev: QueueItem | undefined,
	ev: TransferEvent,
	now: number,
): QueueItem | undefined {
	if (ev.event === 'started') {
		return {
			id: ev.data.transferId,
			key: ev.data.key,
			direction: ev.data.direction,
			bytesDone: ev.data.bytesDone,
			bytesTotal: ev.data.bytesTotal,
			status: ev.data.status ?? 'running',
			sampledAt: now,
			bucket: ev.data.bucket,
			path: ev.data.path,
			pausable: ev.data.pausable,
		};
	}
	if (ev.event === 'progress') {
		return {
			id: ev.data.transferId,
			key: prev?.key ?? '',
			direction: prev?.direction,
			bytesDone: ev.data.bytesDone,
			bytesTotal: ev.data.bytesTotal,
			status: prev?.status === 'paused' ? 'paused' : 'running',
			sampledAt: now,
			speedBps: sampleSpeed(
				prev
					? {
							bytes: prev.bytesDone,
							at: prev.sampledAt ?? now,
							speedBps: prev.speedBps,
						}
					: undefined,
				ev.data.bytesDone,
				now,
			),
			bucket: prev?.bucket,
			path: prev?.path,
			pausable: prev?.pausable,
		};
	}
	if (!prev) {
		return undefined;
	}
	if (ev.event === 'paused') {
		return { ...prev, status: 'paused', speedBps: undefined };
	}
	if (ev.event === 'cancelled') {
		return { ...prev, status: 'cancelled', speedBps: undefined };
	}
	if (ev.event === 'finished') {
		return {
			...prev,
			status: 'completed',
			bytesDone: prev.bytesTotal,
			speedBps: undefined,
		};
	}
	if (ev.event === 'failed') {
		return { ...prev, status: 'failed', message: ev.data.message, speedBps: undefined };
	}
	return prev;
}

export function createTransferChannel() {
	const channel = new Channel<TransferEvent>();
	channel.onmessage = (ev) => {
		const prev = useTransferStore.getState().items[ev.data.transferId];
		const next = applyTransferEvent(prev, ev, Date.now());
		if (next) {
			useTransferStore.getState().upsert(next);
		}
	};
	return channel;
}
