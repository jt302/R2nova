import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
	ChevronLeft,
	ChevronRight,
	Download,
	HardDrive,
	RefreshCw,
	Search,
	Upload,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ObjectItem } from '@/entities/profile/types';
import { createDropGate } from '@/features/browser/drop-gate';
import { ObjectTable } from '@/features/browser/object-table';
import {
	parseDevUrl,
	parseDomains,
	publicBaseUrl,
	publicObjectUrl,
} from '@/features/control/cf-forms';
import { api } from '@/shared/api/backend';
import { isAppError } from '@/shared/api/tauri-invoke';
import { queryKeys } from '@/shared/config/query-keys';
import { downloadDest, joinDest } from '@/shared/lib/download-path';
import { joinKey } from '@/shared/lib/object-key';
import {
	clearSelection,
	emptySelection,
	partitionSelected,
	type Selection,
	selectedKeys,
	selectionCaps,
} from '@/shared/lib/selection';
import { createTransferChannel } from '@/shared/lib/transfer-channel';
import { useActiveTab, useCurrentLocation, useNavStore } from '@/store/nav';

type ConfirmKind = 'delete' | 'loadMore' | null;

const takeFileDrop = createDropGate();

export function BrowserPage() {
	const { t } = useTranslation();
	const qc = useQueryClient();
	const profileId = useNavStore((s) => s.profileId);
	const go = useNavStore((s) => s.go);
	const setPreview = useNavStore((s) => s.setPreview);
	const downloadDir = useNavStore((s) => s.downloadDir);
	const back = useNavStore((s) => s.back);
	const forward = useNavStore((s) => s.forward);
	const tab = useActiveTab();
	const loc = useCurrentLocation();
	const bucket = loc.bucket;
	const prefix = loc.prefix;
	const canBack = tab.index > 0;
	const canForward = tab.index < tab.stack.length - 1;
	const [filter, setFilter] = useState('');
	const [selection, setSelection] = useState<Selection>(emptySelection());
	const [renameSrc, setRenameSrc] = useState('');
	const [renameOpen, setRenameOpen] = useState(false);
	const [renameTo, setRenameTo] = useState('');
	const [copySrc, setCopySrc] = useState('');
	const [copyOpen, setCopyOpen] = useState(false);
	const [copyDest, setCopyDest] = useState('');
	const [moveKeys, setMoveKeys] = useState<string[]>([]);
	const [moveOpen, setMoveOpen] = useState(false);
	const [movePrefix, setMovePrefix] = useState('');
	const [deleteFiles, setDeleteFiles] = useState<string[]>([]);
	const [deletePrefixes, setDeletePrefixes] = useState<string[]>([]);
	const [confirm, setConfirm] = useState<ConfirmKind>(null);
	const [loadQuote, setLoadQuote] = useState(0);
	const destRef = useRef({ profileId, bucket, prefix, t });
	destRef.current = { profileId, bucket, prefix, t };

	const { data: profiles = [] } = useQuery({
		queryKey: queryKeys.profiles,
		queryFn: api.listProfiles,
	});
	const profile = profiles.find((p) => p.id === profileId);
	const admin = profile?.capability === 'admin';
	const cfEnabled = Boolean(admin && profileId && bucket);
	const devUrlQ = useQuery({
		queryKey: queryKeys.cf.devUrl(profileId ?? '', bucket),
		queryFn: () => api.cfGetDevUrl(profileId ?? '', bucket),
		enabled: cfEnabled,
	});
	const domainsQ = useQuery({
		queryKey: queryKeys.cf.domains(profileId ?? '', bucket),
		queryFn: () => api.cfListCustomDomains(profileId ?? '', bucket),
		enabled: cfEnabled,
	});
	const publicBase = useMemo(
		() => publicBaseUrl(parseDevUrl(devUrlQ.data), parseDomains(domainsQ.data)),
		[devUrlQ.data, domainsQ.data],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: folder change must reset selection
	useEffect(() => {
		setSelection(clearSelection());
		setFilter('');
	}, [bucket, prefix]);

	useEffect(() => {
		const pending = import('@tauri-apps/api/webview').then(({ getCurrentWebview }) =>
			getCurrentWebview().onDragDropEvent((event) => {
				if (event.payload.type !== 'drop') {
					return;
				}
				const dest = destRef.current;
				if (!dest.profileId || !dest.bucket || !takeFileDrop(event.payload.paths)) {
					return;
				}
				void api
					.uploadPaths({
						profileId: dest.profileId,
						bucket: dest.bucket,
						prefix: dest.prefix,
						paths: event.payload.paths,
						onEvent: createTransferChannel(),
					})
					.catch((err) =>
						toast.error(isAppError(err) ? err.message : dest.t('toast.uploadFailed')),
					);
			}),
		);
		return () => {
			void pending.then((unlisten) => unlisten());
		};
	}, []);

	const objects = useInfiniteQuery({
		queryKey: queryKeys.objects(profileId ?? '', bucket, prefix),
		enabled: Boolean(profileId && bucket),
		initialPageParam: null as string | null,
		queryFn: ({ pageParam }) =>
			api.listObjects({
				profileId: profileId ?? '',
				bucket,
				prefix,
				continuationToken: pageParam,
			}),
		getNextPageParam: (last) =>
			last.isTruncated ? (last.nextContinuationToken ?? undefined) : undefined,
	});

	const rows = useMemo(() => {
		const all = (objects.data?.pages ?? []).flatMap((p) => [...p.prefixes, ...p.objects]);
		if (!filter) {
			return all;
		}
		const q = filter.toLowerCase();
		return all.filter((r) => r.name.toLowerCase().includes(q) || r.key.toLowerCase().includes(q));
	}, [objects.data, filter]);

	const keys = rows.map((r) => r.key);
	const selected = selectedKeys(selection, keys);
	const { files, prefixes } = partitionSelected(rows, selected);
	const caps = selectionCaps({ files, prefixes });
	const hasNextPage = Boolean(objects.hasNextPage);
	const rowByKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);

	const invalidate = () => {
		void qc.invalidateQueries({ queryKey: queryKeys.objects(profileId ?? '', bucket, prefix) });
		void qc.invalidateQueries({ queryKey: queryKeys.cost });
	};

	const fail = (err: unknown, fallback?: string) =>
		toast.error(isAppError(err) ? err.message : (fallback ?? String(err)));

	const del = useMutation({
		mutationFn: async () => {
			let n = 0;
			if (deleteFiles.length > 0) {
				n += await api.deleteObjects({
					profileId: profileId ?? '',
					bucket,
					keys: deleteFiles,
				});
			}
			for (const p of deletePrefixes) {
				n += await api.deletePrefix({ profileId: profileId ?? '', bucket, prefix: p });
			}
			return n;
		},
		onSuccess: (n) => {
			toast.success(t('toast.deleted', { count: n }));
			invalidate();
			setSelection(clearSelection());
			setConfirm(null);
		},
		onError: (err) => fail(err),
	});

	const rename = useMutation({
		mutationFn: () =>
			api.renameObject({
				profileId: profileId ?? '',
				bucket,
				srcKey: renameSrc,
				dstKey: joinKey(prefix, renameTo),
			}),
		onSuccess: () => {
			toast.success(t('toast.renamed', { name: renameTo }));
			setRenameOpen(false);
			invalidate();
		},
		onError: (err) => fail(err),
	});

	const copy = useMutation({
		mutationFn: () => {
			const slash = copyDest.indexOf('/');
			const dstBucket = slash === -1 ? bucket : copyDest.slice(0, slash);
			const dstKey = slash === -1 ? copyDest : copyDest.slice(slash + 1);
			return api.copyObject({
				profileId: profileId ?? '',
				srcBucket: bucket,
				srcKey: copySrc,
				dstBucket,
				dstKey,
			});
		},
		onSuccess: () => {
			toast.success(t('toast.copiedTo', { dest: copyDest }));
			setCopyOpen(false);
			invalidate();
		},
		onError: (err) => fail(err),
	});

	const move = useMutation({
		mutationFn: () =>
			api.moveObjects({
				profileId: profileId ?? '',
				bucket,
				keys: moveKeys,
				dstPrefix: movePrefix,
			}),
		onSuccess: () => {
			toast.success(t('toast.moved', { count: moveKeys.length }));
			setMoveOpen(false);
			invalidate();
		},
		onError: (err) => fail(err),
	});

	const confirmBusy = confirm === 'delete' ? del.isPending : objects.isFetchingNextPage;

	function openRow(row: ObjectItem) {
		if (row.isPrefix) {
			go({ bucket, prefix: row.key });
			return;
		}
		if (profileId && bucket) {
			setPreview({ profileId, bucket, key: row.key });
		}
	}

	async function upload() {
		if (!profileId || !bucket) {
			return;
		}
		const picked = await open({ multiple: true, directory: false });
		const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
		if (paths.length === 0) {
			return;
		}
		try {
			await api.uploadPaths({
				profileId,
				bucket,
				prefix,
				paths,
				onEvent: createTransferChannel(),
			});
			invalidate();
		} catch (err) {
			fail(err, t('toast.uploadFailed'));
		}
	}

	async function downloadOne(key: string, pick: boolean) {
		if (!profileId || !bucket) {
			return;
		}
		const name = rowByKey.get(key)?.name ?? key.split('/').pop() ?? 'object';
		const silent = downloadDest(pick ? null : downloadDir, name);
		const dest = silent ?? (await save({ defaultPath: name }));
		if (!dest) {
			return;
		}
		try {
			await api.downloadObject({
				profileId,
				bucket,
				key,
				dest,
				unique: Boolean(silent),
				bytesTotal: rowByKey.get(key)?.size ?? 0,
				onEvent: createTransferChannel(),
			});
		} catch (err) {
			fail(err, t('toast.downloadFailed'));
		}
	}

	async function downloadSelection(pick = false) {
		if (!caps.canDownload) {
			return;
		}
		if (files.length === 1) {
			const key = files[0];
			if (key) {
				await downloadOne(key, pick);
			}
			return;
		}
		if (!profileId || !bucket) {
			return;
		}
		let pickedDir = pick ? null : downloadDir;
		if (!pickedDir) {
			const picked = await open({ directory: true, multiple: false });
			pickedDir = Array.isArray(picked) ? picked[0] : picked;
		}
		if (!pickedDir) {
			return;
		}
		const items = files.map((key) => {
			const name = rowByKey.get(key)?.name ?? key.split('/').pop() ?? 'object';
			return {
				key,
				dest: joinDest(pickedDir, name),
				bytesTotal: rowByKey.get(key)?.size ?? 0,
			};
		});
		void api
			.downloadObjects({
				profileId,
				bucket,
				items,
				unique: true,
				onEvent: createTransferChannel(),
			})
			.catch((err) => fail(err, t('toast.downloadFailed')));
	}

	function openRename() {
		if (!caps.canRename) {
			return;
		}
		const key = files[0];
		if (!key) {
			return;
		}
		setRenameSrc(key);
		setRenameTo(rowByKey.get(key)?.name ?? key.split('/').pop() ?? '');
		setRenameOpen(true);
	}

	function openCopy() {
		if (!caps.canCopy) {
			return;
		}
		const key = files[0];
		if (!key) {
			return;
		}
		setCopySrc(key);
		setCopyDest(joinKey(prefix, rowByKey.get(key)?.name ?? key.split('/').pop() ?? ''));
		setCopyOpen(true);
	}

	function openMove() {
		if (!caps.canMove) {
			return;
		}
		setMoveKeys(files);
		setMovePrefix(prefix);
		setMoveOpen(true);
	}

	function requestDelete() {
		if (!caps.canDelete) {
			return;
		}
		setDeleteFiles(files);
		setDeletePrefixes(prefixes);
		setConfirm('delete');
	}

	function refreshList() {
		void objects.refetch().then((result) => {
			if (result.error) {
				fail(result.error, t('toast.refreshFailed'));
			}
		});
	}

	async function requestLoadMore() {
		const quote = await api.quoteListAll(rows.length + 1000);
		setLoadQuote(quote.classA);
		setConfirm('loadMore');
	}

	async function loadMore() {
		try {
			await objects.fetchNextPage();
			setConfirm(null);
		} catch (err) {
			fail(err);
		}
	}

	const crumbs = prefix
		.split('/')
		.filter(Boolean)
		.map((part, i, arr) => ({
			label: part,
			prefix: `${arr.slice(0, i + 1).join('/')}/`,
		}));

	if (!bucket) {
		return (
			<Empty className="h-full border-0">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<HardDrive />
					</EmptyMedia>
					<EmptyTitle>{t('browser.selectBucket')}</EmptyTitle>
					<EmptyDescription>{t('browser.selectBucketBody')}</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex h-11 shrink-0 items-center gap-2 overflow-hidden border-b bg-card px-3">
				<div className="flex items-center gap-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon-sm"
								disabled={!canBack}
								onClick={back}
								aria-label={t('browser.back')}
							>
								<ChevronLeft />
							</Button>
						</TooltipTrigger>
						<TooltipContent>{t('browser.back')}</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon-sm"
								disabled={!canForward}
								onClick={forward}
								aria-label={t('browser.forward')}
							>
								<ChevronRight />
							</Button>
						</TooltipTrigger>
						<TooltipContent>{t('browser.forward')}</TooltipContent>
					</Tooltip>
				</div>
				<Separator orientation="vertical" className="h-5" />
				<Breadcrumb className="min-w-0 flex-1 overflow-hidden">
					<BreadcrumbList className="flex-nowrap gap-1 overflow-hidden whitespace-nowrap break-normal">
						<BreadcrumbItem className="min-w-0 max-w-36">
							<BreadcrumbLink
								className="block cursor-pointer truncate"
								title={bucket}
								onClick={() => go({ bucket, prefix: '' })}
							>
								{bucket}
							</BreadcrumbLink>
						</BreadcrumbItem>
						{crumbs.map((c, i) => (
							<span key={c.prefix} className="contents">
								<BreadcrumbSeparator>
									<ChevronRight />
								</BreadcrumbSeparator>
								<BreadcrumbItem className="min-w-0 max-w-36">
									{i === crumbs.length - 1 ? (
										<BreadcrumbPage className="block truncate" title={c.label}>
											{c.label}
										</BreadcrumbPage>
									) : (
										<BreadcrumbLink
											className="block cursor-pointer truncate"
											title={c.label}
											onClick={() => go({ bucket, prefix: c.prefix })}
										>
											{c.label}
										</BreadcrumbLink>
									)}
								</BreadcrumbItem>
							</span>
						))}
					</BreadcrumbList>
				</Breadcrumb>
				<InputGroup className="h-8 w-44 shrink-0">
					<InputGroupAddon>
						<Search />
					</InputGroupAddon>
					<InputGroupInput
						placeholder={t('browser.prefixPlaceholder')}
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
					/>
				</InputGroup>
				<Button variant="outline" size="sm" onClick={refreshList}>
					{objects.isFetching ? (
						<Spinner data-icon="inline-start" />
					) : (
						<RefreshCw data-icon="inline-start" />
					)}
					{t('common.refresh')}
				</Button>
				<Button size="sm" onClick={() => void upload()}>
					<Upload data-icon="inline-start" />
					{t('common.upload')}
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={!caps.canDownload}
					title={
						selected.length > 0 && !caps.canDownload ? t('browser.downloadNoFolder') : undefined
					}
					onClick={() => void downloadSelection()}
				>
					<Download data-icon="inline-start" />
					{t('common.download')}
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={!caps.canDownload}
					title={
						selected.length > 0 && !caps.canDownload ? t('browser.downloadNoFolder') : undefined
					}
					onClick={() => void downloadSelection(true)}
				>
					{t('transfer.downloadTo')}
				</Button>
			</div>
			<div className="min-h-0 flex-1">
				{objects.isError ? (
					<Alert className="m-3">
						<AlertTitle>{t('toast.listFailed')}</AlertTitle>
						<AlertDescription>
							{isAppError(objects.error) ? objects.error.message : t('toast.listFailed')}
						</AlertDescription>
					</Alert>
				) : null}
				<ObjectTable
					rows={rows}
					hasNextPage={hasNextPage}
					loading={objects.isLoading}
					error={objects.isError}
					selection={selection}
					onSelectionChange={setSelection}
					onOpen={openRow}
					onPreview={(row) => {
						const key = row?.key ?? (caps.canPreview ? files[0] : undefined);
						if (!key || !profileId || !bucket) {
							return;
						}
						setPreview({ profileId, bucket, key });
					}}
					onDownload={() => void downloadSelection()}
					onDownloadTo={() => void downloadSelection(true)}
					onRename={openRename}
					onCopy={openCopy}
					onCopyPublicUrl={(key) => {
						if (!publicBase) {
							return;
						}
						void writeText(publicObjectUrl(publicBase, key)).then(
							() => toast.success(t('toast.linkCopied')),
							fail,
						);
					}}
					publicBase={publicBase}
					onMove={openMove}
					onDelete={requestDelete}
					onUpload={() => void upload()}
					onRefresh={refreshList}
				/>
			</div>
			<div className="flex h-9 shrink-0 items-center gap-3 border-t px-3 text-xs text-muted-foreground">
				<span>
					{objects.isLoading ? t('common.loading') : t('browser.items', { count: rows.length })}
				</span>
				<span>{t('common.selected', { count: selected.length })}</span>
				{selected.length > 0 ? (
					<div className="flex items-center gap-1">
						{caps.canRename ? (
							<Button size="xs" variant="outline" onClick={openRename}>
								{t('common.rename')}
							</Button>
						) : null}
						{caps.canCopy ? (
							<Button size="xs" variant="outline" onClick={openCopy}>
								{t('common.copy')}
							</Button>
						) : null}
						{caps.canMove ? (
							<Button size="xs" variant="outline" onClick={openMove}>
								{t('common.move')}
							</Button>
						) : null}
						<Button size="xs" variant="destructive" onClick={requestDelete}>
							{t('common.delete')}
						</Button>
					</div>
				) : null}
				{hasNextPage ? (
					<Alert className="ml-auto w-auto flex-row items-center py-1.5">
						<AlertTitle>{t('browser.truncated')}</AlertTitle>
						<AlertDescription className="flex items-center gap-2">
							{t('browser.sortDisabled')}
							<Button size="xs" variant="outline" onClick={() => void requestLoadMore()}>
								{t('browser.loadMore')}
							</Button>
						</AlertDescription>
					</Alert>
				) : null}
			</div>
			<Dialog
				open={renameOpen}
				onOpenChange={(open) => {
					if (!open && rename.isPending) {
						return;
					}
					setRenameOpen(open);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('common.rename')}</DialogTitle>
						<DialogDescription className="sr-only">{t('common.rename')}</DialogDescription>
					</DialogHeader>
					<FieldGroup className="gap-4">
						<Field>
							<FieldLabel htmlFor="rename-to">{t('browser.colName')}</FieldLabel>
							<Input
								id="rename-to"
								value={renameTo}
								onChange={(e) => setRenameTo(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === 'Enter' && renameSrc && renameTo.trim() && !rename.isPending) {
										rename.mutate();
									}
								}}
							/>
						</Field>
					</FieldGroup>
					<DialogFooter>
						<Button
							variant="outline"
							disabled={rename.isPending}
							onClick={() => setRenameOpen(false)}
						>
							{t('common.cancel')}
						</Button>
						<Button
							disabled={!renameSrc || !renameTo.trim() || rename.isPending}
							onClick={() => rename.mutate()}
						>
							{rename.isPending ? <Spinner data-icon="inline-start" /> : null}
							{t('common.save')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<Dialog
				open={copyOpen}
				onOpenChange={(open) => {
					if (!open && copy.isPending) {
						return;
					}
					setCopyOpen(open);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('common.copy')}</DialogTitle>
						<DialogDescription>{t('browser.copyDest')}</DialogDescription>
					</DialogHeader>
					<FieldGroup className="gap-4">
						<Field>
							<FieldLabel htmlFor="copy-dest">{t('browser.copyDest')}</FieldLabel>
							<Input
								id="copy-dest"
								value={copyDest}
								onChange={(e) => setCopyDest(e.target.value)}
								placeholder={t('browser.copyDest')}
								onKeyDown={(e) => {
									if (e.key === 'Enter' && copySrc && copyDest.trim() && !copy.isPending) {
										copy.mutate();
									}
								}}
							/>
						</Field>
					</FieldGroup>
					<DialogFooter>
						<Button variant="outline" disabled={copy.isPending} onClick={() => setCopyOpen(false)}>
							{t('common.cancel')}
						</Button>
						<Button
							disabled={!copySrc || !copyDest.trim() || copy.isPending}
							onClick={() => copy.mutate()}
						>
							{copy.isPending ? <Spinner data-icon="inline-start" /> : null}
							{t('common.save')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<Dialog
				open={moveOpen}
				onOpenChange={(open) => {
					if (!open && move.isPending) {
						return;
					}
					setMoveOpen(open);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('common.move')}</DialogTitle>
						<DialogDescription>{t('browser.movePrefix')}</DialogDescription>
					</DialogHeader>
					<FieldGroup className="gap-4">
						<Field>
							<FieldLabel htmlFor="move-prefix">{t('browser.movePrefix')}</FieldLabel>
							<Input
								id="move-prefix"
								value={movePrefix}
								onChange={(e) => setMovePrefix(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === 'Enter' && moveKeys.length > 0 && !move.isPending) {
										move.mutate();
									}
								}}
							/>
						</Field>
					</FieldGroup>
					<DialogFooter>
						<Button variant="outline" disabled={move.isPending} onClick={() => setMoveOpen(false)}>
							{t('common.cancel')}
						</Button>
						<Button
							disabled={moveKeys.length === 0 || move.isPending}
							onClick={() => move.mutate()}
						>
							{move.isPending ? <Spinner data-icon="inline-start" /> : null}
							{t('common.save')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<AlertDialog
				open={confirm !== null}
				onOpenChange={(open) => {
					if (!open && confirmBusy) {
						return;
					}
					if (!open) {
						setConfirm(null);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
						<AlertDialogDescription>
							{confirm === 'delete'
								? deletePrefixes.length > 0
									? t('browser.confirmDeleteFolders', {
											files: deleteFiles.length,
											folders: deletePrefixes.length,
										})
									: t('common.confirmDelete')
								: t('cost.quote', { count: loadQuote })}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={confirmBusy}>{t('common.cancel')}</AlertDialogCancel>
						<AlertDialogAction
							variant={confirm === 'delete' ? 'destructive' : 'default'}
							disabled={
								confirmBusy ||
								(confirm === 'delete' && deleteFiles.length + deletePrefixes.length === 0)
							}
							onClick={(e) => {
								e.preventDefault();
								if (confirm === 'delete') {
									if (deleteFiles.length + deletePrefixes.length === 0) {
										setConfirm(null);
										return;
									}
									del.mutate();
									return;
								}
								void loadMore();
							}}
						>
							{confirmBusy ? <Spinner data-icon="inline-start" /> : null}
							{t('common.confirm')}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
