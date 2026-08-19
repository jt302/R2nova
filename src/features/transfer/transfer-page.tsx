import { useQuery, useQueryClient } from '@tanstack/react-query';
import { open } from '@tauri-apps/plugin-dialog';
import {
	ArrowDownToLine,
	ArrowUpDown,
	ArrowUpFromLine,
	Pause,
	Play,
	RotateCcw,
	X,
} from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { api } from '@/shared/api/backend';
import { isAppError } from '@/shared/api/tauri-invoke';
import { queryKeys } from '@/shared/config/query-keys';
import { formatBytes } from '@/shared/lib/object-key';
import { createTransferChannel } from '@/shared/lib/transfer-channel';
import {
	canDismiss,
	canPause,
	canResume,
	canRetry,
	etaParts,
	etaSecs,
	isActiveStatus,
	isEndedStatus,
	isQueuedStatus,
	isRunningStatus,
	mergeQueue,
	type QueueItem,
} from '@/shared/lib/transfer-queue';
import { useNavStore } from '@/store/nav';
import { useTransferStore } from '@/store/transfer';
import { PageHeader } from '@/widgets/page-header';

const ROW = 28;
const COLS =
	'min-w-0 gap-x-3 grid-cols-[20px_minmax(8rem,1.2fr)_minmax(4.5rem,0.5fr)_minmax(6rem,0.7fr)_7.5rem_minmax(6rem,1fr)_4.5rem_5rem_4.5rem_minmax(4rem,0.6fr)_3.5rem]';

export function TransferPage() {
	const { t } = useTranslation();
	const live = useTransferStore((s) => s.items);
	const dismissed = useTransferStore((s) => s.dismissed);
	const dismiss = useTransferStore((s) => s.dismiss);
	const downloadDir = useNavStore((s) => s.downloadDir);
	const setDownloadDir = useNavStore((s) => s.setDownloadDir);
	const transferConcurrency = useNavStore((s) => s.transferConcurrency);
	const setTransferConcurrency = useNavStore((s) => s.setTransferConcurrency);
	const qc = useQueryClient();
	const { data = [], isLoading } = useQuery({
		queryKey: queryKeys.transfers,
		queryFn: api.listTransfers,
		refetchInterval: 2000,
	});
	const items = mergeQueue(live, data, dismissed);
	const runningCount = items.filter((item) => isRunningStatus(item.status)).length;
	const waitingCount = items.filter((item) => isQueuedStatus(item.status)).length;
	const endedCount = items.filter((item) => isEndedStatus(item.status)).length;
	const summary =
		runningCount > 0 && waitingCount > 0
			? t('transfer.activeAndWaiting', { running: runningCount, waiting: waitingCount })
			: runningCount > 0
				? t('transfer.active', { count: runningCount })
				: waitingCount > 0
					? t('transfer.waiting', { count: waitingCount })
					: t('transfer.idle');

	function persistDismiss(id: string) {
		void api
			.dismissTransfer(id)
			.then(() => {
				dismiss(id);
				void qc.invalidateQueries({ queryKey: queryKeys.transfers });
			})
			.catch((err) => {
				toast.error(isAppError(err) ? err.message : t('toast.transferDismissFailed'));
			});
	}

	async function pickDownloadDir() {
		const picked = await open({ directory: true, multiple: false });
		const dir = Array.isArray(picked) ? picked[0] : picked;
		if (typeof dir === 'string' && dir) {
			setDownloadDir(dir);
		}
	}

	return (
		<div className="flex h-full min-h-0 w-full flex-1 flex-col">
			<div className="shrink-0 border-b px-6 py-4">
				<PageHeader
					title={t('transfer.queue')}
					description={summary}
					actions={
						<div className="flex max-w-xl flex-wrap items-center justify-end gap-2">
							<label className="flex items-center gap-2 text-xs text-muted-foreground">
								{t('transfer.concurrency')}
								<Input
									type="number"
									min={1}
									max={16}
									className="h-8 w-14 px-2 text-center"
									value={transferConcurrency}
									onChange={(e) => setTransferConcurrency(Number(e.target.value))}
								/>
							</label>
							{downloadDir ? (
								<span
									className="max-w-52 truncate text-xs text-muted-foreground"
									title={downloadDir}
								>
									{downloadDir}
								</span>
							) : (
								<span className="text-xs text-muted-foreground">
									{t('transfer.downloadDirUnset')}
								</span>
							)}
							<Button variant="outline" size="sm" onClick={() => void pickDownloadDir()}>
								{downloadDir ? t('transfer.downloadDirSet') : t('transfer.downloadDir')}
							</Button>
							{downloadDir ? (
								<Button variant="ghost" size="sm" onClick={() => setDownloadDir(null)}>
									{t('transfer.downloadDirClear')}
								</Button>
							) : null}
							{endedCount > 0 ? (
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										for (const item of items) {
											if (isEndedStatus(item.status)) {
												persistDismiss(item.id);
											}
										}
									}}
								>
									{t('transfer.clearFinished')}
								</Button>
							) : null}
						</div>
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
						<span>{t('transfer.colBucket')}</span>
						<span>{t('transfer.colPath')}</span>
						<span className="text-right">{t('browser.colSize')}</span>
						<span>{t('transfer.colProgress')}</span>
						<span className="text-right">{t('transfer.colSpeed')}</span>
						<span className="text-right">{t('transfer.colEta')}</span>
						<span>{t('transfer.colStatus')}</span>
						<span>{t('transfer.colError')}</span>
						<span />
					</div>
					{items.map((item) => (
						<TransferRow key={item.id} item={item} onDismiss={() => persistDismiss(item.id)} />
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
			<span className="truncate text-muted-foreground" title={item.bucket}>
				{item.bucket ?? ''}
			</span>
			{item.path ? (
				<button
					type="button"
					className="truncate text-left text-muted-foreground hover:text-foreground"
					title={item.path}
					onClick={() => {
						void api.revealItem(item.path ?? '').catch(() => undefined);
					}}
				>
					{item.path}
				</button>
			) : (
				<span />
			)}
			<span className="truncate text-right tabular-nums text-muted-foreground">
				{formatBytes(item.bytesDone)} / {formatBytes(item.bytesTotal)}
			</span>
			<div className="flex min-w-0 items-center gap-2 overflow-hidden">
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
			<div className="flex items-center justify-end">
				{canPause(item) ? (
					<Button
						variant="ghost"
						size="icon-xs"
						aria-label={t('transfer.pause')}
						onClick={() => {
							void api.pauseTransfer(item.id).catch((err) => {
								toast.error(isAppError(err) ? err.message : t('toast.transferPauseFailed'));
							});
						}}
					>
						<Pause />
					</Button>
				) : null}
				{canResume(item) || canRetry(item) ? (
					<Button
						variant="ghost"
						size="icon-xs"
						aria-label={canRetry(item) ? t('transfer.retry') : t('transfer.resume')}
						onClick={() => {
							void api.resumeTransfer(item.id, createTransferChannel()).catch((err) => {
								toast.error(isAppError(err) ? err.message : t('toast.transferResumeFailed'));
							});
						}}
					>
						{canRetry(item) ? <RotateCcw /> : <Play />}
					</Button>
				) : null}
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label={canDismiss(item) ? t('transfer.dismiss') : t('common.cancel')}
					onClick={() => {
						if (canDismiss(item)) {
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
