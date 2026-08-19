import { Channel } from '@tauri-apps/api/core';
import type { TransferEvent } from '@/entities/profile/types';
import { sampleSpeed } from '@/shared/lib/transfer-queue';
import { useTransferStore } from '@/store/transfer';

export function createTransferChannel() {
	const channel = new Channel<TransferEvent>();
	channel.onmessage = (ev) => {
		const { upsert } = useTransferStore.getState();
		if (ev.event === 'started') {
			upsert({
				id: ev.data.transferId,
				key: ev.data.key,
				direction: ev.data.direction,
				bytesDone: 0,
				bytesTotal: ev.data.bytesTotal,
				status: 'running',
				sampledAt: Date.now(),
			});
			return;
		}
		const prev = useTransferStore.getState().items[ev.data.transferId];
		if (ev.event === 'progress') {
			const now = Date.now();
			upsert({
				id: ev.data.transferId,
				key: prev?.key ?? '',
				direction: prev?.direction,
				bytesDone: ev.data.bytesDone,
				bytesTotal: ev.data.bytesTotal,
				status: 'running',
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
			});
			return;
		}
		if (ev.event === 'finished' && prev) {
			upsert({
				...prev,
				status: 'completed',
				bytesDone: prev.bytesTotal,
				speedBps: undefined,
			});
			return;
		}
		if (ev.event === 'failed' && prev) {
			upsert({ ...prev, status: 'failed', message: ev.data.message, speedBps: undefined });
		}
	};
	return channel;
}
