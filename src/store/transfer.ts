import { create } from 'zustand';
import type { QueueItem } from '@/shared/lib/transfer-queue';

export type LiveTransfer = QueueItem;

type TransferState = {
	items: Record<string, LiveTransfer>;
	dismissed: Record<string, true>;
	upsert: (item: LiveTransfer) => void;
	dismiss: (id: string) => void;
};

export const useTransferStore = create<TransferState>((set) => ({
	items: {},
	dismissed: {},
	upsert: (item) => set((s) => ({ items: { ...s.items, [item.id]: item } })),
	dismiss: (id) =>
		set((s) => {
			const items = { ...s.items };
			delete items[id];
			return { items, dismissed: { ...s.dismissed, [id]: true } };
		}),
}));
