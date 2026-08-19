import { useQuery } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpDown, ArrowUpFromLine, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { api } from '@/shared/api/backend';
import { isAppError } from '@/shared/api/tauri-invoke';
import { queryKeys } from '@/shared/config/query-keys';
import { formatBytes } from '@/shared/lib/object-key';
import {
	etaParts,
	etaSecs,
	isActiveStatus,
	isEndedStatus,
	mergeQueue,
	type QueueItem,
} from '@/shared/lib/transfer-queue';
import { useTransferStore } from '@/store/transfer';
import { PageHeader } from '@/widgets/page-header';

const ROW = 28;
const COLS =
	'grid-cols-[20px_minmax(10rem,1.4fr)_7.5rem_minmax(7rem,1fr)_5.5rem_4.5rem_4.5rem_minmax(5rem,1fr)_1.75rem]';

export function TransferPage() {
	const { t } = useTranslation();
	const live = useTransferStore((s) => s.items);
	const dismissed = useTransferStore((s) => s.dismissed);
	const dismiss = useTransferStore((s) => s.dismiss);
	const { data = [], isLoading } = useQuery({
		queryKey: queryKeys.transfers,
		queryFn: api.listTransfers,
		refetchInterval: 2000,
	});
	const items = mergeQueue(live, data, dismissed);
	const activeCount = items.filter((item) => isActiveStatus(item.status)).length;
	const endedCount = items.filter((item) => isEndedStatus(item.status)).length;

	return (
		<div className="flex h-full min-h-0 w-full flex-1 flex-col">
			<div className="shrink-0 border-b px-6 py-4">
				<PageHeader
					title={t('transfer.queue')}
					description={
						activeCount > 0 ? t('transfer.active', { count: activeCount }) : t('transfer.idle')
					}
					actions={
						endedCount > 0 ? (
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									for (const item of items) {
										if (isEndedStatus(item.status)) {
											dismiss(item.id);
										}
									}
								}}
							>
								{t('transfer.clearFinished')}
							</Button>
						) : null
					}
				/>
			</div>
			{isLoading && items.length === 0 ? (
				<Empty className="min-h-0 flex-1 border-0">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Spinner className="size-6" />
						</EmptyMedia>
						<EmptyTitle>{t('common.loading')}</EmptyTitle>
					</EmptyHeader>
				</Empty>
			) : items.length === 0 ? (
				<Empty className="min-h-0 flex-1 border-0">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<ArrowUpFromLine />
						</EmptyMedia>
						<EmptyTitle>{t('transfer.emptyTitle')}</EmptyTitle>
						<EmptyDescription>{t('transfer.emptyBody')}</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto scrollbar-gutter-stable">
					<div
						className={cn(
							'sticky top-0 z-10 grid h-8 shrink-0 items-center border-b bg-muted/40 px-3 text-xs text-muted-foreground',
							COLS,
						)}
					>
						<span />
						<span>{t('browser.colName')}</span>
						<span className="text-right">{t('browser.colSize')}</span>
						<span>{t('transfer.colProgress')}</span>
						<span className="text-right">{t('transfer.colSpeed')}</span>
						<span className="text-right">{t('transfer.colEta')}</span>
						<span>{t('transfer.colStatus')}</span>
						<span>{t('transfer.colError')}</span>
						<span />
					</div>
					{items.map((item) => (
						<TransferRow key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
					))}
				</div>
			)}
		</div>
	);
}

function TransferRow({ item, onDismiss }: { item: QueueItem; onDismiss: () => void }) {
	const { t } = useTranslation();
	const pct = item.bytesTotal > 0 ? (item.bytesDone / item.bytesTotal) * 100 : 0;
	const running = item.status === 'running';
	const ended = isEndedStatus(item.status);
	const Icon =
		item.direction === 'download'
			? ArrowDownToLine
			: item.direction === 'upload'
				? ArrowUpFromLine
				: ArrowUpDown;
	const eta = running ? etaParts(etaSecs(item.bytesDone, item.bytesTotal, item.speedBps)) : null;
	const etaText =
		eta == null
			? ''
			: eta.key === 'hours'
				? t('transfer.etaHours', { h: eta.h, m: eta.m })
				: t(eta.key === 'seconds' ? 'transfer.etaSeconds' : 'transfer.etaMinutes', {
						count: eta.count,
					});

	return (
		<div
			className={cn('grid items-center px-3 text-[13px] hover:bg-muted/60', COLS)}
			style={{ height: ROW }}
		>
			<Icon className="size-3.5 text-muted-foreground" />
			<span className="truncate" title={item.key}>
				{item.key}
			</span>
			<span className="truncate text-right tabular-nums text-muted-foreground">
				{formatBytes(item.bytesDone)} / {formatBytes(item.bytesTotal)}
			</span>
			<div className="flex min-w-0 items-center gap-2">
				<Progress value={pct} className="h-1.5" />
				<span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
					{Math.round(pct)}%
				</span>
			</div>
			<span className="truncate text-right tabular-nums text-muted-foreground">
				{running && item.speedBps ? t('transfer.speed', { value: formatBytes(item.speedBps) }) : ''}
			</span>
			<span className="truncate text-right tabular-nums text-muted-foreground">{etaText}</span>
			<span
				className={cn(
					'truncate',
					item.status === 'failed' ? 'text-destructive' : 'text-muted-foreground',
				)}
			>
				{t(`transfer.status.${item.status}`)}
			</span>
			<span className="truncate text-muted-foreground" title={item.message}>
				{item.message ?? ''}
			</span>
			<Button
				variant="ghost"
				size="icon-xs"
				aria-label={ended ? t('transfer.dismiss') : t('common.cancel')}
				onClick={() => {
					if (ended) {
						onDismiss();
						return;
					}
					void api.cancelTransfer(item.id).catch((err) => {
						toast.error(isAppError(err) ? err.message : t('toast.transferCancelFailed'));
					});
				}}
			>
				<X />
			</Button>
		</div>
	);
}

export function useActiveTransferCount() {
	const live = useTransferStore((s) => s.items);
	const dismissed = useTransferStore((s) => s.dismissed);
	const { data = [] } = useQuery({
		queryKey: queryKeys.transfers,
		queryFn: api.listTransfers,
		refetchInterval: 2000,
	});
	return mergeQueue(live, data, dismissed).filter((item) => isActiveStatus(item.status)).length;
}
