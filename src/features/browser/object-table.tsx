import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronUp, File, FileImage, FileText, FileVideo, Folder } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import type { ObjectItem } from '@/entities/profile/types';
import { cn } from '@/lib/utils';
import { fileKind, formatBytes, formatModified } from '@/shared/lib/object-key';
import {
	contextActionKeys,
	isSelected,
	partitionSelected,
	type Selection,
	selectAll,
	selectedCount,
	selectionCaps,
	selectRange,
	toggleKey,
} from '@/shared/lib/selection';

const ROW = 28;
const COLS = 'grid-cols-[28px_20px_minmax(0,1fr)_88px_148px]';

type SortKey = 'name' | 'size' | 'mtime';

type Props = {
	rows: ObjectItem[];
	hasNextPage: boolean;
	loading?: boolean;
	error?: boolean;
	selection: Selection;
	onSelectionChange: (next: Selection) => void;
	onOpen: (row: ObjectItem) => void;
	onPreview: (row?: ObjectItem) => void;
	onDownload: () => void;
	onDownloadTo: () => void;
	onRename: () => void;
	onCopy: () => void;
	onCopyPublicUrl?: (key: string) => void;
	publicBase?: string | null;
	onMove: () => void;
	onDelete: () => void;
	onUpload: () => void;
	onRefresh: () => void;
};

export function objectFromEvent(target: EventTarget | null, rows: ObjectItem[]): ObjectItem | null {
	const el =
		target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
	const key = el?.closest('[data-object-key]')?.getAttribute('data-object-key');
	if (!key) {
		return null;
	}
	return rows.find((r) => r.key === key) ?? null;
}

function RowIcon({ row }: { row: ObjectItem }) {
	if (row.isPrefix) {
		return <Folder className="size-3.5 text-primary" />;
	}
	const kind = fileKind(row.key);
	if (kind === 'image') {
		return <FileImage className="size-3.5 text-muted-foreground" />;
	}
	if (kind === 'video') {
		return <FileVideo className="size-3.5 text-muted-foreground" />;
	}
	if (kind === 'pdf' || kind === 'text' || kind === 'markdown') {
		return <FileText className="size-3.5 text-muted-foreground" />;
	}
	return <File className="size-3.5 text-muted-foreground" />;
}

function SortMark({ active, desc }: { active: boolean; desc: boolean }) {
	if (!active) {
		return null;
	}
	return desc ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />;
}

export function ObjectTable({
	rows,
	hasNextPage,
	loading = false,
	error = false,
	selection,
	onSelectionChange,
	onOpen,
	onPreview,
	onDownload,
	onDownloadTo,
	onRename,
	onCopy,
	onCopyPublicUrl,
	publicBase = null,
	onMove,
	onDelete,
	onUpload,
	onRefresh,
}: Props) {
	const { t, i18n } = useTranslation();
	const parentRef = useRef<HTMLDivElement>(null);
	const keys = useMemo(() => rows.map((r) => r.key), [rows]);
	const [anchor, setAnchor] = useState(0);
	const [sort, setSort] = useState<SortKey>('name');
	const [desc, setDesc] = useState(false);
	const [ctxRow, setCtxRow] = useState<ObjectItem | null>(null);

	const sorted = useMemo(() => {
		if (hasNextPage && sort !== 'name') {
			return rows;
		}
		const copy = [...rows];
		copy.sort((a, b) => {
			if (a.isPrefix !== b.isPrefix) {
				return a.isPrefix ? -1 : 1;
			}
			let cmp = 0;
			if (sort === 'size') {
				cmp = a.size - b.size;
			} else if (sort === 'mtime') {
				cmp = (a.lastModified ?? '').localeCompare(b.lastModified ?? '');
			} else {
				cmp = a.name.localeCompare(b.name);
			}
			return desc ? -cmp : cmp;
		});
		return copy;
	}, [rows, sort, desc, hasNextPage]);

	const virtualizer = useVirtualizer({
		count: sorted.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => ROW,
		overscan: 20,
	});

	const selectedN = selectedCount(selection, rows.length);
	const allChecked = rows.length > 0 && selectedN === rows.length;
	const headerChecked = allChecked ? true : selectedN > 0 ? 'indeterminate' : false;

	function clickSort(col: SortKey) {
		if (col !== 'name' && hasNextPage) {
			return;
		}
		if (sort === col) {
			setDesc(!desc);
		} else {
			setSort(col);
			setDesc(false);
		}
	}

	const target = ctxRow;
	const actionPart = partitionSelected(rows, contextActionKeys(selection, keys, target?.key));
	const caps = selectionCaps(actionPart);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div
				className={cn(
					'grid h-8 shrink-0 items-center border-b bg-muted/40 px-2 text-xs text-muted-foreground',
					COLS,
				)}
			>
				<Checkbox
					checked={headerChecked}
					onCheckedChange={() =>
						onSelectionChange(allChecked ? { mode: 'include', keys: new Set() } : selectAll())
					}
					aria-label={t('common.selected', { count: selectedN })}
				/>
				<span />
				<button
					type="button"
					className="inline-flex items-center gap-1 text-left hover:text-foreground"
					onClick={() => clickSort('name')}
				>
					{t('browser.colName')}
					<SortMark active={sort === 'name'} desc={desc} />
				</button>
				<button
					type="button"
					className="inline-flex items-center justify-end gap-1 text-right hover:text-foreground disabled:opacity-40"
					title={hasNextPage ? t('browser.sortDisabled') : undefined}
					disabled={hasNextPage}
					onClick={() => clickSort('size')}
				>
					{t('browser.colSize')}
					<SortMark active={sort === 'size'} desc={desc} />
				</button>
				<button
					type="button"
					className="inline-flex items-center justify-end gap-1 text-right hover:text-foreground disabled:opacity-40"
					title={hasNextPage ? t('browser.sortDisabled') : undefined}
					disabled={hasNextPage}
					onClick={() => clickSort('mtime')}
				>
					{t('browser.colModified')}
					<SortMark active={sort === 'mtime'} desc={desc} />
				</button>
			</div>
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<div
						className="relative min-h-0 flex-1"
						onContextMenu={(e) => {
							setCtxRow(objectFromEvent(e.target, sorted));
						}}
					>
						<div ref={parentRef} className="h-full overflow-auto scrollbar-gutter-stable">
							<div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
								{virtualizer.getVirtualItems().map((v) => {
									const row = sorted[v.index];
									const selected = isSelected(selection, row.key);
									return (
										<div
											key={row.key}
											data-object-key={row.key}
											className={cn(
												'absolute left-0 grid w-full cursor-default items-center px-2 text-[13px]',
												COLS,
												selected ? 'bg-primary/10' : 'hover:bg-muted/60',
											)}
											style={{ height: ROW, transform: `translateY(${v.start}px)` }}
											onClick={(e) => {
												if (e.detail > 1) {
													return;
												}
												if (row.isPrefix) {
													onOpen(row);
													return;
												}
												onPreview(row);
											}}
											onDoubleClick={() => onOpen(row)}
											onContextMenu={() => {
												if (!selected) {
													onSelectionChange({ mode: 'include', keys: new Set([row.key]) });
												}
											}}
										>
											<Checkbox
												checked={selected}
												onPointerDown={(e) => {
													e.stopPropagation();
													if (e.shiftKey) {
														e.preventDefault();
														onSelectionChange(selectRange(keys, anchor, v.index));
													}
												}}
												onClick={(e) => e.stopPropagation()}
												onCheckedChange={() => {
													setAnchor(v.index);
													onSelectionChange(toggleKey(selection, row.key));
												}}
											/>
											<RowIcon row={row} />
											<span className="truncate" title={row.key}>
												{row.name}
											</span>
											<span className="text-right tabular-nums text-muted-foreground">
												{row.isPrefix ? t('browser.folder') : formatBytes(row.size)}
											</span>
											<span className="truncate text-right tabular-nums text-muted-foreground">
												{formatModified(row.lastModified, i18n.language)}
											</span>
										</div>
									);
								})}
							</div>
							{loading ? (
								<Empty className="absolute inset-0 border-0">
									<EmptyHeader>
										<EmptyMedia variant="icon">
											<Spinner className="size-6" />
										</EmptyMedia>
										<EmptyTitle>{t('common.loading')}</EmptyTitle>
									</EmptyHeader>
								</Empty>
							) : null}
							{!loading && !error && sorted.length === 0 ? (
								<Empty className="absolute inset-0 border-0">
									<EmptyHeader>
										<EmptyMedia variant="icon">
											<Folder />
										</EmptyMedia>
										<EmptyTitle>{t('browser.emptyFolder')}</EmptyTitle>
										<EmptyDescription>{t('browser.emptyFolderBody')}</EmptyDescription>
									</EmptyHeader>
								</Empty>
							) : null}
						</div>
					</div>
				</ContextMenuTrigger>
				<ContextMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>
					{target ? (
						<>
							<ContextMenuGroup>
								<ContextMenuItem
									disabled={!caps.canPreview}
									title={caps.canPreview ? undefined : t('browser.needOneFile')}
									onSelect={() => onPreview()}
								>
									{t('common.preview')}
								</ContextMenuItem>
								<ContextMenuItem
									disabled={!caps.canDownload}
									title={caps.canDownload ? undefined : t('browser.downloadNoFolder')}
									onSelect={() => onDownload()}
								>
									{t('common.download')}
								</ContextMenuItem>
								<ContextMenuItem
									disabled={!caps.canDownload}
									title={caps.canDownload ? undefined : t('browser.downloadNoFolder')}
									onSelect={() => onDownloadTo()}
								>
									{t('transfer.downloadTo')}
								</ContextMenuItem>
							</ContextMenuGroup>
							<ContextMenuSeparator />
							<ContextMenuGroup>
								<ContextMenuItem
									disabled={!caps.canRename}
									title={caps.canRename ? undefined : t('browser.needOneFile')}
									onSelect={() => onRename()}
								>
									{t('common.rename')}
								</ContextMenuItem>
								<ContextMenuItem
									disabled={!caps.canCopy}
									title={caps.canCopy ? undefined : t('browser.needOneFile')}
									onSelect={() => onCopy()}
								>
									{t('common.copy')}
								</ContextMenuItem>
								{publicBase ? (
									<ContextMenuItem
										disabled={!caps.canCopy}
										title={caps.canCopy ? undefined : t('browser.needOneFile')}
										onSelect={() => {
											const key = actionPart.files[0];
											if (key) {
												onCopyPublicUrl?.(key);
											}
										}}
									>
										{t('browser.copyPublicUrl')}
									</ContextMenuItem>
								) : null}
								<ContextMenuItem
									disabled={!caps.canMove}
									title={caps.canMove ? undefined : t('browser.moveNoFolder')}
									onSelect={() => onMove()}
								>
									{t('common.move')}
								</ContextMenuItem>
							</ContextMenuGroup>
							<ContextMenuSeparator />
							<ContextMenuGroup>
								<ContextMenuItem
									variant="destructive"
									disabled={!caps.canDelete}
									onSelect={() => onDelete()}
								>
									{t('common.delete')}
								</ContextMenuItem>
							</ContextMenuGroup>
						</>
					) : (
						<ContextMenuGroup>
							<ContextMenuItem onSelect={() => onUpload()}>{t('common.upload')}</ContextMenuItem>
							<ContextMenuItem onSelect={() => onRefresh()}>{t('common.refresh')}</ContextMenuItem>
						</ContextMenuGroup>
					)}
				</ContextMenuContent>
			</ContextMenu>
		</div>
	);
}
