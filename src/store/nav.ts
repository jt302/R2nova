import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
	type PreviewTarget,
	previewAfterLocation,
	previewAfterProfile,
} from '@/shared/lib/preview';

export type Location = { bucket: string; prefix: string };
export type MainView = 'objects' | 'settings' | 'accounts';
export type { PreviewTarget };

export type Tab = {
	id: string;
	title: string;
	stack: Location[];
	index: number;
	preview: PreviewTarget | null;
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
	setPreview: (preview: PreviewTarget | null) => void;
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
		preview: null,
	};
}

function withPreview(tab: Tab, loc: Location): Tab {
	return { ...tab, preview: previewAfterLocation(tab.preview, loc) };
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
				setProfileId: (id) =>
					set((s) => ({
						profileId: id,
						tabs: s.tabs.map((t) => ({
							...t,
							preview: previewAfterProfile(t.preview, id),
						})),
					})),
				setTheme: (theme) => set({ theme }),
				setMainView: (mainView) => set({ mainView }),
				setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
				setPreview: (preview) =>
					set((s) => ({
						tabs: s.tabs.map((t) => (t.id === s.activeTabId ? { ...t, preview } : t)),
					})),
				go: (loc) =>
					set((s) => {
						const tabs = s.tabs.map((t) => {
							if (t.id !== s.activeTabId) {
								return t;
							}
							const stack = [...t.stack.slice(0, t.index + 1), loc];
							return withPreview(
								{
									...t,
									stack,
									index: stack.length - 1,
									title: tabTitle(loc),
								},
								loc,
							);
						});
						return { tabs };
					}),
				back: () =>
					set((s) => ({
						tabs: s.tabs.map((t) => {
							if (t.id !== s.activeTabId || t.index <= 0) {
								return t;
							}
							const index = t.index - 1;
							return withPreview({ ...t, index }, t.stack[index]);
						}),
					})),
				forward: () =>
					set((s) => ({
						tabs: s.tabs.map((t) => {
							if (t.id !== s.activeTabId || t.index >= t.stack.length - 1) {
								return t;
							}
							const index = t.index + 1;
							return withPreview({ ...t, index }, t.stack[index]);
						}),
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
				const tabs = (incoming.tabs?.length ? incoming.tabs : current.tabs).map((t) => ({
					...t,
					preview: t.preview ?? null,
				}));
				return {
					...current,
					...incoming,
					mainView: incoming.mainView ?? 'objects',
					sidebarCollapsed: incoming.sidebarCollapsed ?? false,
					tabs,
					activeTabId: incoming.activeTabId ?? current.activeTabId,
				};
			},
			partialize: (s) => ({
				profileId: s.profileId,
				tabs: s.tabs.map((t) => ({ ...t, preview: null })),
				activeTabId: s.activeTabId,
				theme: s.theme,
				mainView: s.mainView,
				sidebarCollapsed: s.sidebarCollapsed,
			}),
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
