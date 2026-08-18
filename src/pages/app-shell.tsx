import { useQuery } from '@tanstack/react-query';
import {
	ArrowUpDown,
	CircleDollarSign,
	Cloud,
	FolderOpen,
	Languages,
	Moon,
	Search,
	Sun,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@/components/ui/empty';
import {
	Item,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemTitle,
} from '@/components/ui/item';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Separator } from '@/components/ui/separator';
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
import { useActiveTab, useNavStore } from '@/store/nav';
import { ActivityRail } from '@/widgets/activity-rail';
import { BucketSidebar } from '@/widgets/bucket-sidebar';
import { CostBar } from '@/widgets/cost-bar';
import { TabStrip } from '@/widgets/tab-strip';

function useThemeClass(theme: 'light' | 'dark' | 'system') {
	useEffect(() => {
		const root = document.documentElement;
		const apply = () => {
			const dark =
				theme === 'dark' ||
				(theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
			root.classList.toggle('dark', dark);
		};
		apply();
		if (theme !== 'system') {
			return;
		}
		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		mq.addEventListener('change', apply);
		return () => mq.removeEventListener('change', apply);
	}, [theme]);
}

export function AppShell() {
	const { t, i18n } = useTranslation();
	const theme = useNavStore((s) => s.theme);
	const setTheme = useNavStore((s) => s.setTheme);
	const profileId = useNavStore((s) => s.profileId);
	const mainView = useNavStore((s) => s.mainView);
	const setMainView = useNavStore((s) => s.setMainView);
	const newTab = useNavStore((s) => s.newTab);
	const closeTab = useNavStore((s) => s.closeTab);
	const activeTabId = useNavStore((s) => s.activeTabId);
	const back = useNavStore((s) => s.back);
	const forward = useNavStore((s) => s.forward);
	const sidebarCollapsed = useNavStore((s) => s.sidebarCollapsed);
	const setPreview = useNavStore((s) => s.setPreview);
	const activeTab = useActiveTab();
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

	useThemeClass(theme);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (!(e.metaKey || e.ctrlKey)) {
				return;
			}
			const key = e.key.toLowerCase();
			if (key === 't') {
				e.preventDefault();
				newTab();
			}
			if (key === 'w') {
				e.preventDefault();
				closeTab(activeTabId);
			}
			if (key === 'k') {
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
			if (key === '1') {
				e.preventDefault();
				setMainView('objects');
			}
			if (key === '2') {
				e.preventDefault();
				setMainView('settings');
			}
			if (key === '3') {
				e.preventDefault();
				setMainView('accounts');
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [activeTabId, back, closeTab, forward, newTab, setMainView]);

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

	const showSidebar = Boolean(profileId) && mainView !== 'accounts' && !sidebarCollapsed;
	const preview = activeTab.preview;
	const showPreview = Boolean(preview) && mainView === 'objects';

	return (
		<div className="flex h-full flex-col bg-background text-foreground">
			{update ? (
				<Alert className="rounded-none border-x-0 border-t-0">
					<AlertTitle>{t('app.name')}</AlertTitle>
					<AlertDescription>{update}</AlertDescription>
				</Alert>
			) : null}
			<header className="flex h-11 shrink-0 items-center gap-2 border-b bg-titlebar px-2">
				<TabStrip />
				<Button
					variant="outline"
					size="sm"
					className="hidden h-8 max-w-64 justify-between gap-3 text-muted-foreground sm:inline-flex"
					onClick={() => setCommandOpen(true)}
				>
					<span className="flex min-w-0 items-center gap-2">
						<Search />
						<span className="truncate">{t('app.searchHint')}</span>
					</span>
					<KbdGroup>
						<Kbd>⌘</Kbd>
						<Kbd>K</Kbd>
					</KbdGroup>
				</Button>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							className="sm:hidden"
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
				{version ? (
					<span className="pr-1 text-xs tabular-nums text-muted-foreground">v{version}</span>
				) : null}
			</header>
			<div className="flex min-h-0 flex-1">
				<ActivityRail
					transferCount={transferCount}
					transfersOpen={transfersOpen}
					onTransfers={() => setTransfersOpen((v) => !v)}
					onAdd={openAdd}
				/>
				<main className="flex min-h-0 min-w-0 flex-1">
					{mainView === 'accounts' ? (
						<AccountsPage onAdd={openAdd} onEdit={openEdit} />
					) : !profileId ? (
						<Onboarding onAdd={openAdd} />
					) : (
						<ResizablePanelGroup orientation="horizontal" className="h-full">
							{showSidebar ? (
								<>
									<ResizablePanel
										defaultSize="20"
										minSize="14"
										maxSize="32"
										className="min-w-[220px]"
									>
										<BucketSidebar onAdd={openAdd} onManage={() => setMainView('accounts')} />
									</ResizablePanel>
									<ResizableHandle />
								</>
							) : null}
							<ResizablePanel
								defaultSize={showPreview ? '52' : '80'}
								minSize="30"
								className="min-w-0 overflow-hidden"
							>
								{mainView === 'settings' ? (
									<ControlPanel />
								) : currentProfile?.capability === 'invalid' ? (
									<InvalidAccountState
										lastError={currentProfile.lastError}
										onEdit={() => openEdit(currentProfile)}
										onManage={() => setMainView('accounts')}
									/>
								) : (
									<BrowserPage />
								)}
							</ResizablePanel>
							{showPreview ? (
								<>
									<ResizableHandle />
									<ResizablePanel
										defaultSize="28"
										minSize="18"
										maxSize="45"
										className="min-w-0 overflow-hidden"
									>
										<PreviewPane target={preview!} onClose={() => setPreview(null)} />
									</ResizablePanel>
								</>
							) : null}
						</ResizablePanelGroup>
					)}
				</main>
			</div>
			{transfersOpen ? (
				<div className="flex h-56 shrink-0 flex-col border-t bg-card">
					<div className="flex h-10 shrink-0 items-center gap-2 px-4">
						<p className="text-sm font-medium">{t('transfer.queue')}</p>
						<div className="flex-1" />
						<Button variant="ghost" size="xs" onClick={() => setTransfersOpen(false)}>
							{t('common.close')}
						</Button>
					</div>
					<Separator />
					<div className="min-h-0 flex-1 overflow-auto">
						<QueuePanel />
					</div>
				</div>
			) : null}
			<footer className="flex h-9 shrink-0 items-center gap-3 border-t bg-titlebar px-3">
				<CostBar />
				<Button
					className="ml-auto"
					variant="ghost"
					size="sm"
					onClick={() => setTransfersOpen((v) => !v)}
				>
					{transferCount > 0 ? t('transfer.active', { count: transferCount }) : t('transfer.idle')}
				</Button>
			</footer>
			<CommandPalette
				open={commandOpen}
				onOpenChange={setCommandOpen}
				onTransfers={() => setTransfersOpen(true)}
			/>
			<ProfileFormDialog open={formOpen} onOpenChange={setFormOpen} profile={editing} />
		</div>
	);
}

function Onboarding({ onAdd }: { onAdd: () => void }) {
	const { t } = useTranslation();
	return (
		<div className="flex h-full w-full items-center justify-center overflow-auto p-8">
			<div className="flex w-full max-w-xl flex-col gap-8">
				<Empty className="border-dashed">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Cloud />
						</EmptyMedia>
						<EmptyTitle>{t('profile.emptyTitle')}</EmptyTitle>
						<EmptyDescription>{t('profile.emptyBody')}</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button onClick={onAdd}>{t('profile.add')}</Button>
					</EmptyContent>
				</Empty>
				<ItemGroup className="gap-3">
					<Item variant="muted" size="sm">
						<ItemMedia variant="icon">
							<FolderOpen />
						</ItemMedia>
						<ItemContent>
							<ItemTitle>{t('onboarding.browse')}</ItemTitle>
							<ItemDescription>{t('onboarding.browseBody')}</ItemDescription>
						</ItemContent>
					</Item>
					<Item variant="muted" size="sm">
						<ItemMedia variant="icon">
							<ArrowUpDown />
						</ItemMedia>
						<ItemContent>
							<ItemTitle>{t('onboarding.transfer')}</ItemTitle>
							<ItemDescription>{t('onboarding.transferBody')}</ItemDescription>
						</ItemContent>
					</Item>
					<Item variant="muted" size="sm">
						<ItemMedia variant="icon">
							<CircleDollarSign />
						</ItemMedia>
						<ItemContent>
							<ItemTitle>{t('onboarding.cost')}</ItemTitle>
							<ItemDescription>{t('onboarding.costBody')}</ItemDescription>
						</ItemContent>
					</Item>
				</ItemGroup>
			</div>
		</div>
	);
}
