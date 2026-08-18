import { create } from 'zustand';

export type LiveTransfer = {
	id: string;
	key: string;
	bytesDone: number;
	bytesTotal: number;
	status: 'running' | 'finished' | 'failed';
	message?: string;
};

type TransferState = {
	items: Record<string, LiveTransfer>;
	upsert: (item: LiveTransfer) => void;
	remove: (id: string) => void;
};

export const useTransferStore = create<TransferState>((set) => ({
	items: {},
	upsert: (item) => set((s) => ({ items: { ...s.items, [item.id]: item } })),
	remove: (id) =>
		set((s) => {
			const items = { ...s.items };
			delete items[id];
			return { items };
		}),
}));
