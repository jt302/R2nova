import { useQuery } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@/components/ui/empty';
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemTitle,
} from '@/components/ui/item';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { api } from '@/shared/api/backend';
import { isAppError } from '@/shared/api/tauri-invoke';
import { queryKeys } from '@/shared/config/query-keys';
import { formatBytes } from '@/shared/lib/object-key';
import { useTransferStore } from '@/store/transfer';

export function QueuePanel() {
	const { t } = useTranslation();
	const live = useTransferStore((s) => s.items);
	const { data = [], isLoading } = useQuery({
		queryKey: queryKeys.transfers,
		queryFn: api.listTransfers,
		refetchInterval: 2000,
	});
	const items = Object.values(live);
	const merged =
		items.length > 0
			? items
			: data.map((d) => ({
					id: d.transferId,
					key: d.key,
					bytesDone: d.bytesDone,
					bytesTotal: d.bytesTotal,
					status:
						d.status === 'completed'
							? 'finished'
							: d.status === 'failed'
								? 'failed'
								: d.status === 'cancelled'
									? 'cancelled'
									: d.status === 'paused'
										? 'paused'
										: d.status === 'queued'
											? 'queued'
											: 'running',
					message: d.error ?? undefined,
					direction: d.direction,
				}));

	if (isLoading && items.length === 0) {
		return (
			<Empty className="border-0">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Spinner className="size-6" />
					</EmptyMedia>
					<EmptyTitle>{t('common.loading')}</EmptyTitle>
				</EmptyHeader>
			</Empty>
		);
	}

	if (merged.length === 0) {
		return (
			<Empty className="border-0">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<ArrowUpFromLine />
					</EmptyMedia>
					<EmptyTitle>{t('transfer.emptyTitle')}</EmptyTitle>
					<EmptyDescription>{t('transfer.emptyBody')}</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<ItemGroup className="gap-2 px-4 pb-4">
			{merged.map((item) => {
				const pct = item.bytesTotal > 0 ? (item.bytesDone / item.bytesTotal) * 100 : 0;
				const variant =
					item.status === 'failed'
						? 'destructive'
						: item.status === 'finished' || item.status === 'completed'
							? 'secondary'
							: 'default';
				const direction =
					'direction' in item && item.direction ? t(`transfer.${item.direction}`) : null;
				const Icon =
					'direction' in item && item.direction === 'download' ? ArrowDownToLine : ArrowUpFromLine;
				return (
					<Item key={item.id} variant="outline" size="sm">
						<ItemMedia variant="icon">
							<Icon />
						</ItemMedia>
						<ItemContent>
							<ItemTitle className="min-w-0 max-w-full">
								<span className="truncate" title={item.key}>
									{item.key}
								</span>
							</ItemTitle>
							<ItemDescription>
								{formatBytes(item.bytesDone)} / {formatBytes(item.bytesTotal)}
							</ItemDescription>
							<Progress value={pct} className="mt-1" />
						</ItemContent>
						<ItemActions>
							{direction ? <Badge variant="outline">{direction}</Badge> : null}
							<Badge variant={variant}>{t(`transfer.status.${item.status}`)}</Badge>
							<Button
								variant="ghost"
								size="icon-xs"
								aria-label={t('common.cancel')}
								onClick={() => {
									void api.cancelTransfer(item.id).catch((err) => {
										toast.error(isAppError(err) ? err.message : t('toast.transferCancelFailed'));
									});
								}}
							>
								<X />
							</Button>
						</ItemActions>
					</Item>
				);
			})}
		</ItemGroup>
	);
}

export function useActiveTransferCount() {
	const live = useTransferStore((s) => s.items);
	const { data = [] } = useQuery({
		queryKey: queryKeys.transfers,
		queryFn: api.listTransfers,
		refetchInterval: 2000,
	});
	const liveCount = Object.values(live).filter((item) => item.status === 'running').length;
	if (liveCount > 0) {
		return liveCount;
	}
	return data.filter((d) => d.status === 'running' || d.status === 'queued').length;
}
