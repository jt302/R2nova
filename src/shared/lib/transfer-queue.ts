import type { TransferProgress } from '@/entities/profile/types';

export type QueueStatus = TransferProgress['status'];

export type QueueItem = {
	id: string;
	key: string;
	direction?: TransferProgress['direction'];
	bytesDone: number;
	bytesTotal: number;
	status: QueueStatus;
	message?: string;
	speedBps?: number;
	sampledAt?: number;
};

const STATUS_RANK: Record<QueueStatus, number> = {
	running: 0,
	queued: 1,
	paused: 2,
	failed: 3,
	cancelled: 4,
	completed: 5,
};

export function isActiveStatus(status: QueueStatus): boolean {
	return status === 'running' || status === 'queued';
}

export function isEndedStatus(status: QueueStatus): boolean {
	return status === 'completed' || status === 'failed' || status === 'cancelled';
}

export function fromApi(d: TransferProgress): QueueItem {
	return {
		id: d.transferId,
		key: d.key,
		direction: d.direction,
		bytesDone: d.bytesDone,
		bytesTotal: d.bytesTotal,
		status: d.status,
		message: d.error ?? undefined,
	};
}

export function mergeQueue(
	live: Record<string, QueueItem>,
	apiItems: TransferProgress[],
	dismissed: Record<string, true>,
): QueueItem[] {
	const byId = new Map<string, QueueItem>();
	for (const d of apiItems) {
		if (dismissed[d.transferId]) {
			continue;
		}
		byId.set(d.transferId, fromApi(d));
	}
	for (const item of Object.values(live)) {
		if (dismissed[item.id]) {
			continue;
		}
		const apiRow = byId.get(item.id);
		byId.set(item.id, {
			...item,
			direction: item.direction ?? apiRow?.direction,
		});
	}
	return [...byId.values()].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
}

export function sampleSpeed(
	prev: { bytes: number; at: number; speedBps?: number } | undefined,
	bytesDone: number,
	now: number,
): number | undefined {
	if (!prev) {
		return undefined;
	}
	const dt = (now - prev.at) / 1000;
	if (dt < 0.05) {
		return prev.speedBps;
	}
	const instant = (bytesDone - prev.bytes) / dt;
	if (instant < 0) {
		return prev.speedBps;
	}
	if (prev.speedBps == null) {
		return instant;
	}
	return prev.speedBps * 0.6 + instant * 0.4;
}

export function etaSecs(
	bytesDone: number,
	bytesTotal: number,
	speedBps: number | undefined,
): number {
	if (!speedBps || speedBps <= 0 || bytesTotal <= bytesDone) {
		return 0;
	}
	return (bytesTotal - bytesDone) / speedBps;
}

export type EtaParts =
	| { key: 'seconds'; count: number }
	| { key: 'minutes'; count: number }
	| { key: 'hours'; h: number; m: number };

export function etaParts(secs: number): EtaParts | null {
	if (!Number.isFinite(secs) || secs <= 0) {
		return null;
	}
	if (secs < 60) {
		return { key: 'seconds', count: Math.max(1, Math.ceil(secs)) };
	}
	if (secs < 3600) {
		return { key: 'minutes', count: Math.max(1, Math.round(secs / 60)) };
	}
	return { key: 'hours', h: Math.floor(secs / 3600), m: Math.round((secs % 3600) / 60) };
}
