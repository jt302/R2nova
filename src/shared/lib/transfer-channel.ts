import { Channel } from '@tauri-apps/api/core';
import type { TransferEvent } from '@/entities/profile/types';
import { useTransferStore } from '@/store/transfer';

export function createTransferChannel() {
	const channel = new Channel<TransferEvent>();
	channel.onmessage = (ev) => {
		const { upsert } = useTransferStore.getState();
		if (ev.event === 'started') {
			upsert({
				id: ev.data.transferId,
				key: ev.data.key,
				bytesDone: 0,
				bytesTotal: ev.data.bytesTotal,
				status: 'running',
			});
			return;
		}
		const prev = useTransferStore.getState().items[ev.data.transferId];
		if (ev.event === 'progress') {
			upsert({
				id: ev.data.transferId,
				key: prev?.key ?? '',
				bytesDone: ev.data.bytesDone,
				bytesTotal: ev.data.bytesTotal,
				status: 'running',
			});
			return;
		}
		if (ev.event === 'finished' && prev) {
			upsert({ ...prev, status: 'finished', bytesDone: prev.bytesTotal });
			return;
		}
		if (ev.event === 'failed' && prev) {
			upsert({ ...prev, status: 'failed', message: ev.data.message });
		}
	};
	return channel;
}
