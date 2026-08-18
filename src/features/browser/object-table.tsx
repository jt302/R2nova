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
import type { ObjectItem } from '@/entities/profile/types';
import { cn } from '@/lib/utils';
import { fileKind, formatBytes, formatModified } from '@/shared/lib/object-key';
import {
	isSelected,
	type Selection,
	selectAll,
	selectedCount,
	selectRange,
	toggleKey,
} from '@/shared/lib/selection';

const ROW = 28;
const COLS = 'grid-cols-[28px_20px_minmax(0,1fr)_88px_148px]';

type SortKey = 'name' | 'size' | 'mtime';

type Props = {
	rows: ObjectItem[];
	hasNextPage: boolean;
	selection: Selection;
	onSelectionChange: (next: Selection) => void;
	onOpen: (row: ObjectItem) => void;
	onPreview: (row: ObjectItem) => void;
	onDownload: (row: ObjectItem) => void;
	onRename: (row: ObjectItem | null) => void;
	onCopy: (row: ObjectItem | null) => void;
	onMove: () => void;
	onDelete: () => void;
};

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
	selection,
	onSelectionChange,
	onOpen,
	onPreview,
	onDownload,
	onRename,
	onCopy,
	onMove,
	onDelete,
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

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
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
					<div
						ref={parentRef}
						className="relative min-h-0 flex-1 overflow-auto"
						onContextMenu={(e) => {
							if (e.target === e.currentTarget) {
								setCtxRow(null);
							}
						}}
					>
						<div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
							{virtualizer.getVirtualItems().map((v) => {
								const row = sorted[v.index];
								const selected = isSelected(selection, row.key);
								return (
									<div
										key={row.key}
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
											if (e.shiftKey) {
												onSelectionChange(selectRange(keys, anchor, v.index));
												return;
											}
											setAnchor(v.index);
											onSelectionChange(toggleKey(selection, row.key));
										}}
										onDoubleClick={() => onOpen(row)}
										onContextMenu={() => {
											if (!selected) {
												onSelectionChange({ mode: 'include', keys: new Set([row.key]) });
											}
											setCtxRow(row);
										}}
									>
										<Checkbox
											checked={selected}
											onClick={(e) => e.stopPropagation()}
											onCheckedChange={() => onSelectionChange(toggleKey(selection, row.key))}
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
						{sorted.length === 0 ? (
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
				<ContextMenuGroup>
					<ContextMenuItem
						disabled={!target || target.isPrefix}
						onSelect={() => target && onPreview(target)}
					>
						{t('common.preview')}
					</ContextMenuItem>
					<ContextMenuItem disabled={!target} onSelect={() => target && onDownload(target)}>
						{t('common.download')}
					</ContextMenuItem>
				</ContextMenuGroup>
				<ContextMenuSeparator />
				<ContextMenuGroup>
					<ContextMenuItem onSelect={() => onRename(target)}>{t('common.rename')}</ContextMenuItem>
					<ContextMenuItem onSelect={() => onCopy(target)}>{t('common.copy')}</ContextMenuItem>
					<ContextMenuItem onSelect={onMove}>{t('common.move')}</ContextMenuItem>
				</ContextMenuGroup>
				<ContextMenuSeparator />
				<ContextMenuGroup>
					<ContextMenuItem variant="destructive" onSelect={onDelete}>
						{t('common.delete')}
					</ContextMenuItem>
				</ContextMenuGroup>
			</ContextMenuContent>
		</ContextMenu>
	);
}
