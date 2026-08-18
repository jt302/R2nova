import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Location = { bucket: string; prefix: string };

type Tab = {
	id: string;
	title: string;
	stack: Location[];
	index: number;
};

type NavState = {
	profileId: string | null;
	tabs: Tab[];
	activeTabId: string;
	theme: 'light' | 'dark' | 'system';
	setProfileId: (id: string | null) => void;
	setTheme: (theme: NavState['theme']) => void;
	go: (loc: Location) => void;
	back: () => void;
	forward: () => void;
	newTab: () => void;
	closeTab: (id: string) => void;
	setActiveTab: (id: string) => void;
	location: () => Location;
};

function emptyTab(): Tab {
	return {
		id: crypto.randomUUID(),
		title: '/',
		stack: [{ bucket: '', prefix: '' }],
		index: 0,
	};
}

export const useNavStore = create<NavState>()(
	persist(
		(set, get) => {
			const first = emptyTab();
			return {
				profileId: null,
				tabs: [first],
				activeTabId: first.id,
				theme: 'system',
				setProfileId: (id) => set({ profileId: id }),
				setTheme: (theme) => set({ theme }),
				go: (loc) =>
					set((s) => {
						const tabs = s.tabs.map((t) => {
							if (t.id !== s.activeTabId) {
								return t;
							}
							const stack = [...t.stack.slice(0, t.index + 1), loc];
							return {
								...t,
								stack,
								index: stack.length - 1,
								title: loc.bucket ? `${loc.bucket}/${loc.prefix}` : '/',
							};
						});
						return { tabs };
					}),
				back: () =>
					set((s) => ({
						tabs: s.tabs.map((t) =>
							t.id === s.activeTabId && t.index > 0 ? { ...t, index: t.index - 1 } : t,
						),
					})),
				forward: () =>
					set((s) => ({
						tabs: s.tabs.map((t) =>
							t.id === s.activeTabId && t.index < t.stack.length - 1
								? { ...t, index: t.index + 1 }
								: t,
						),
					})),
				newTab: () =>
					set((s) => {
						const tab = emptyTab();
						return { tabs: [...s.tabs, tab], activeTabId: tab.id };
					}),
				closeTab: (id) =>
					set((s) => {
						const tabs = s.tabs.filter((t) => t.id !== id);
						if (tabs.length === 0) {
							const tab = emptyTab();
							return { tabs: [tab], activeTabId: tab.id };
						}
						return {
							tabs,
							activeTabId: s.activeTabId === id ? tabs[0].id : s.activeTabId,
						};
					}),
				setActiveTab: (id) => set({ activeTabId: id }),
				location: () => {
					const s = get();
					const tab = s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0];
					return tab.stack[tab.index];
				},
			};
		},
		{ name: 'r2nova-nav' },
	),
);
