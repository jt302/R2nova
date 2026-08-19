export type Selection =
	| { mode: 'include'; keys: Set<string> }
	| { mode: 'all'; except: Set<string> };

export function emptySelection(): Selection {
	return { mode: 'include', keys: new Set() };
}

export function isSelected(selection: Selection, key: string): boolean {
	if (selection.mode === 'include') {
		return selection.keys.has(key);
	}
	return !selection.except.has(key);
}

export function selectedCount(selection: Selection, total: number): number {
	if (selection.mode === 'include') {
		return selection.keys.size;
	}
	return Math.max(0, total - selection.except.size);
}

export function toggleKey(selection: Selection, key: string): Selection {
	if (selection.mode === 'include') {
		const keys = new Set(selection.keys);
		if (keys.has(key)) {
			keys.delete(key);
		} else {
			keys.add(key);
		}
		return { mode: 'include', keys };
	}
	const except = new Set(selection.except);
	if (except.has(key)) {
		except.delete(key);
	} else {
		except.add(key);
	}
	return { mode: 'all', except };
}

export function selectAll(): Selection {
	return { mode: 'all', except: new Set() };
}

export function clearSelection(): Selection {
	return emptySelection();
}

export function selectRange(keys: string[], anchor: number, target: number): Selection {
	const from = Math.min(anchor, target);
	const to = Math.max(anchor, target);
	return { mode: 'include', keys: new Set(keys.slice(from, to + 1)) };
}

export function selectedKeys(selection: Selection, allKeys: string[]): string[] {
	if (selection.mode === 'include') {
		return allKeys.filter((k) => selection.keys.has(k));
	}
	return allKeys.filter((k) => !selection.except.has(k));
}

/** Object actions operate on the selection, else the right-clicked row, else nothing. */
export function actionKeys(selected: string[], contextKey?: string | null): string[] {
	if (selected.length > 0) {
		return selected;
	}
	return contextKey ? [contextKey] : [];
}

export function partitionSelected(
	rows: { key: string; isPrefix: boolean }[],
	selected: string[],
): { files: string[]; prefixes: string[] } {
	const want = new Set(selected);
	const files: string[] = [];
	const prefixes: string[] = [];
	for (const row of rows) {
		if (!want.has(row.key)) {
			continue;
		}
		if (row.isPrefix) {
			prefixes.push(row.key);
		} else {
			files.push(row.key);
		}
	}
	return { files, prefixes };
}

export type SelectionCaps = {
	canPreview: boolean;
	canDownload: boolean;
	canRename: boolean;
	canCopy: boolean;
	canMove: boolean;
	canDelete: boolean;
};

export function selectionCaps(part: { files: string[]; prefixes: string[] }): SelectionCaps {
	const onlyFiles = part.prefixes.length === 0;
	const oneFile = onlyFiles && part.files.length === 1;
	return {
		canPreview: oneFile,
		canDownload: onlyFiles && part.files.length > 0,
		canRename: oneFile,
		canCopy: oneFile,
		canMove: onlyFiles && part.files.length > 0,
		canDelete: part.files.length + part.prefixes.length > 0,
	};
}

/** Keys the object context menu should act on, including the opening-frame before selection flushes. */
export function contextActionKeys(
	selection: Selection,
	allKeys: string[],
	contextKey?: string | null,
): string[] {
	if (!contextKey) {
		return selectedKeys(selection, allKeys);
	}
	if (!isSelected(selection, contextKey)) {
		return [contextKey];
	}
	return selectedKeys(selection, allKeys);
}
