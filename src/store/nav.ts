import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Location = { bucket: string; prefix: string };
export type MainView = 'objects' | 'settings' | 'accounts';

export type Tab = {
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
	mainView: MainView;
	sidebarCollapsed: boolean;
	setProfileId: (id: string | null) => void;
	setTheme: (theme: NavState['theme']) => void;
	setMainView: (view: MainView) => void;
	setSidebarCollapsed: (collapsed: boolean) => void;
	go: (loc: Location) => void;
	back: () => void;
	forward: () => void;
	newTab: () => void;
	closeTab: (id: string) => void;
	setActiveTab: (id: string) => void;
	location: () => Location;
};

export function tabTitle(loc: Location): string {
	if (!loc.bucket) {
		return '/';
	}
	const last = loc.prefix.split('/').filter(Boolean).pop();
	return last ? last : loc.bucket;
}

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
				mainView: 'objects',
				sidebarCollapsed: false,
				setProfileId: (id) => set({ profileId: id }),
				setTheme: (theme) => set({ theme }),
				setMainView: (mainView) => set({ mainView }),
				setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
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
								title: tabTitle(loc),
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
						return { tabs: [...s.tabs, tab], activeTabId: tab.id, mainView: 'objects' };
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
				setActiveTab: (id) => set({ activeTabId: id, mainView: 'objects' }),
				location: () => {
					const s = get();
					const tab = s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0];
					return tab.stack[tab.index];
				},
			};
		},
		{
			name: 'r2nova-nav',
			merge: (persisted, current) => {
				const incoming = (persisted ?? {}) as Partial<NavState> & { tabs?: Tab[] };
				return {
					...current,
					...incoming,
					mainView: incoming.mainView ?? 'objects',
					sidebarCollapsed: incoming.sidebarCollapsed ?? false,
					tabs: incoming.tabs?.length ? incoming.tabs : current.tabs,
					activeTabId: incoming.activeTabId ?? current.activeTabId,
				};
			},
		},
	),
);

export function useActiveTab(): Tab {
	return useNavStore((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0]);
}

export function useCurrentLocation(): Location {
	const tab = useActiveTab();
	return tab.stack[tab.index];
}
