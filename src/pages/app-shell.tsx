import { useQuery } from '@tanstack/react-query';
import { ArrowUpDown, Cloud, Languages, Moon, Plus, Search, Sun, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Profile } from '@/entities/profile/types';
import { BrowserPage } from '@/features/browser/browser-page';
import { CommandPalette } from '@/features/command-palette/command-palette';
import { ControlPanel } from '@/features/control/control-panel';
import { PreviewPane } from '@/features/preview/preview-pane';
import { AccountsPage, InvalidAccountState } from '@/features/profile/accounts-page';
import { ProfileFormDialog } from '@/features/profile/profile-form-dialog';
import { QueuePanel, useActiveTransferCount } from '@/features/transfer/queue-panel';
import { api } from '@/shared/api/backend';
import { queryKeys } from '@/shared/config/query-keys';
import { useNavStore } from '@/store/nav';
import { BucketSidebar } from '@/widgets/bucket-sidebar';
import { CostBar } from '@/widgets/cost-bar';
import { ProfileSwitcher } from '@/widgets/profile-switcher';

export function AppShell() {
	const { t, i18n } = useTranslation();
	const tabs = useNavStore((s) => s.tabs);
	const activeTabId = useNavStore((s) => s.activeTabId);
	const setActiveTab = useNavStore((s) => s.setActiveTab);
	const newTab = useNavStore((s) => s.newTab);
	const closeTab = useNavStore((s) => s.closeTab);
	const back = useNavStore((s) => s.back);
	const forward = useNavStore((s) => s.forward);
	const theme = useNavStore((s) => s.theme);
	const setTheme = useNavStore((s) => s.setTheme);
	const profileId = useNavStore((s) => s.profileId);
	const [previewKey, setPreviewKey] = useState<string | null>(null);
	const [mainView, setMainView] = useState<'objects' | 'settings' | 'accounts'>('objects');
	const [transfersOpen, setTransfersOpen] = useState(false);
	const [commandOpen, setCommandOpen] = useState(false);
	const [formOpen, setFormOpen] = useState(false);
	const [editing, setEditing] = useState<Profile | null>(null);
	const transferCount = useActiveTransferCount();
	const { data: profiles = [] } = useQuery({
		queryKey: queryKeys.profiles,
		queryFn: api.listProfiles,
	});
	const currentProfile = profiles.find((p) => p.id === profileId);
	const { data: version } = useQuery({ queryKey: ['version'], queryFn: api.appVersion });
	const { data: latest } = useQuery({
		queryKey: ['latest-release'],
		queryFn: api.checkLatestRelease,
		staleTime: 60_000,
	});

	useEffect(() => {
		const root = document.documentElement;
		const dark =
			theme === 'dark' ||
			(theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
		root.classList.toggle('dark', dark);
	}, [theme]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey) {
				if (e.key.toLowerCase() === 't') {
					e.preventDefault();
					newTab();
				}
				if (e.key.toLowerCase() === 'w') {
					e.preventDefault();
					closeTab(activeTabId);
				}
				if (e.key.toLowerCase() === 'k') {
					e.preventDefault();
					setCommandOpen((v) => !v);
				}
				if (e.key === '[') {
					e.preventDefault();
					back();
				}
				if (e.key === ']') {
					e.preventDefault();
					forward();
				}
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [activeTabId, back, closeTab, forward, newTab]);

	const update =
		latest && version && latest !== version ? t('app.updateAvailable', { version: latest }) : null;
	const dark =
		theme === 'dark' ||
		(theme === 'system' &&
			typeof window !== 'undefined' &&
			window.matchMedia('(prefers-color-scheme: dark)').matches);

	function openAdd() {
		setEditing(null);
		setFormOpen(true);
	}

	function openEdit(profile: Profile) {
		setEditing(profile);
		setFormOpen(true);
	}

	return (
		<div className="flex h-full flex-col bg-background text-foreground">
			<header className="flex h-12 shrink-0 items-center gap-2 border-b bg-card px-3">
				<div className="flex min-w-0 flex-1 items-center gap-1">
					{tabs.map((tab) => (
						<button
							key={tab.id}
							type="button"
							className={`group flex max-w-48 items-center gap-1 truncate rounded-md px-2.5 py-1 text-sm ${
								tab.id === activeTabId ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
							}`}
							onClick={() => setActiveTab(tab.id)}
							onAuxClick={(e) => {
								if (e.button === 1) {
									closeTab(tab.id);
								}
							}}
						>
							<span className="truncate">{tab.title}</span>
							<span
								className="rounded-sm p-0.5 opacity-0 hover:bg-background group-hover:opacity-100"
								onClick={(e) => {
									e.stopPropagation();
									closeTab(tab.id);
								}}
							>
								<X className="size-3" />
							</span>
						</button>
					))}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button variant="ghost" size="icon-sm" onClick={newTab} aria-label={t('nav.newTab')}>
								<Plus />
							</Button>
						</TooltipTrigger>
						<TooltipContent>{t('nav.newTab')}</TooltipContent>
					</Tooltip>
				</div>
				<ProfileSwitcher />
				<Button variant="outline" size="sm" onClick={openAdd}>
					{t('profile.add')}
				</Button>
				<Button variant="outline" size="sm" onClick={() => setMainView('accounts')}>
					{t('profile.manage')}
				</Button>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={() => setCommandOpen(true)}
							aria-label={t('app.commandPalette')}
						>
							<Search />
						</Button>
					</TooltipTrigger>
					<TooltipContent>{t('app.commandPalette')}</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={t('command.language')}
							onClick={() =>
								void i18n.changeLanguage(i18n.language.startsWith('zh') ? 'en-US' : 'zh-CN')
							}
						>
							<Languages />
						</Button>
					</TooltipTrigger>
					<TooltipContent>{t('command.language')}</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={dark ? t('command.themeLight') : t('command.themeDark')}
							onClick={() => setTheme(dark ? 'light' : 'dark')}
						>
							{dark ? <Sun /> : <Moon />}
						</Button>
					</TooltipTrigger>
					<TooltipContent>{dark ? t('command.themeLight') : t('command.themeDark')}</TooltipContent>
				</Tooltip>
				<span className="text-xs text-muted-foreground">v{version}</span>
			</header>
			{update ? <div className="bg-accent px-4 py-2 text-sm">{update}</div> : null}
			<main className="flex min-h-0 flex-1">
				{mainView === 'accounts' ? (
					<AccountsPage onAdd={openAdd} onEdit={openEdit} onClose={() => setMainView('objects')} />
				) : !profileId ? (
					<div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
						<Cloud className="size-12 text-muted-foreground" />
						<h1 className="text-xl font-semibold">{t('profile.emptyTitle')}</h1>
						<p className="max-w-md text-sm text-muted-foreground">{t('profile.emptyBody')}</p>
						<Button onClick={openAdd}>{t('profile.add')}</Button>
					</div>
				) : (
					<ResizablePanelGroup orientation="horizontal" className="h-full">
						<ResizablePanel defaultSize="18" minSize="12" maxSize="32" className="min-w-[200px]">
							<BucketSidebar onManage={() => setMainView('accounts')} />
						</ResizablePanel>
						<ResizableHandle />
						<ResizablePanel
							defaultSize={previewKey && mainView === 'objects' ? '54' : '82'}
							minSize="30"
						>
							<div className="flex h-full min-h-0 flex-col">
								<div className="flex h-11 shrink-0 items-center border-b px-3">
									<Tabs
										value={mainView}
										onValueChange={(value) => setMainView(value as 'objects' | 'settings')}
									>
										<TabsList>
											<TabsTrigger value="objects">{t('nav.objects')}</TabsTrigger>
											<TabsTrigger value="settings">{t('nav.settings')}</TabsTrigger>
										</TabsList>
									</Tabs>
								</div>
								<div className="min-h-0 flex-1">
									{mainView === 'settings' ? (
										<ControlPanel />
									) : currentProfile?.capability === 'invalid' ? (
										<InvalidAccountState
											lastError={currentProfile.lastError}
											onEdit={() => openEdit(currentProfile)}
											onManage={() => setMainView('accounts')}
										/>
									) : (
										<BrowserPage onPreview={setPreviewKey} />
									)}
								</div>
							</div>
						</ResizablePanel>
						{previewKey && mainView === 'objects' ? (
							<>
								<ResizableHandle />
								<ResizablePanel defaultSize="28" minSize="18" maxSize="45">
									<PreviewPane objectKey={previewKey} onClose={() => setPreviewKey(null)} />
								</ResizablePanel>
							</>
						) : null}
					</ResizablePanelGroup>
				)}
			</main>
			<footer className="flex h-10 shrink-0 items-center gap-3 border-t bg-card px-3">
				<CostBar />
				<Button
					className="ml-auto"
					variant="ghost"
					size="sm"
					onClick={() => setTransfersOpen(true)}
				>
					<ArrowUpDown />
					{transferCount > 0 ? t('transfer.active', { count: transferCount }) : t('transfer.idle')}
				</Button>
			</footer>
			<Sheet open={transfersOpen} onOpenChange={setTransfersOpen}>
				<SheetContent side="bottom" className="h-[min(28rem,70vh)]">
					<SheetHeader>
						<SheetTitle>{t('transfer.queue')}</SheetTitle>
						<SheetDescription className="sr-only">{t('transfer.queue')}</SheetDescription>
					</SheetHeader>
					<div className="min-h-0 flex-1 overflow-auto">
						<QueuePanel />
					</div>
				</SheetContent>
			</Sheet>
			<CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
			<ProfileFormDialog open={formOpen} onOpenChange={setFormOpen} profile={editing} />
		</div>
	);
}
