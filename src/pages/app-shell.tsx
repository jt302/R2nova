import { useQuery } from '@tanstack/react-query';
import {
	ArrowUpDown,
	CircleDollarSign,
	Cloud,
	FolderOpen,
	Languages,
	Monitor,
	Moon,
	Search,
	Sun,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePanelRef } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Profile } from '@/entities/profile/types';
import { BrowserPage } from '@/features/browser/browser-page';
import { CommandPalette } from '@/features/command-palette/command-palette';
import { ControlPanel } from '@/features/control/control-panel';
import { PreviewPane } from '@/features/preview/preview-pane';
import { AccountsPage, InvalidAccountState } from '@/features/profile/accounts-page';
import { ProfileFormDialog } from '@/features/profile/profile-form-dialog';
import { TransferPage, useActiveTransferCount } from '@/features/transfer/transfer-page';
import { api } from '@/shared/api/backend';
import { queryKeys } from '@/shared/config/query-keys';
import { SIDEBAR_MAX_PX, SIDEBAR_MIN_PX } from '@/shared/lib/prefs';
import { applyDocumentTheme, windowTheme } from '@/shared/lib/theme';
import { useActiveTab, useNavStore } from '@/store/nav';
import { AboutDialog } from '@/widgets/about-dialog';
import { ActivityRail } from '@/widgets/activity-rail';
import { BucketSidebar } from '@/widgets/bucket-sidebar';
import { CostBar } from '@/widgets/cost-bar';
import { TabStrip } from '@/widgets/tab-strip';

function useThemeClass(theme: 'light' | 'dark' | 'system') {
	useEffect(() => {
		const apply = () => {
			applyDocumentTheme(theme, window.matchMedia('(prefers-color-scheme: dark)').matches);
			void import('@tauri-apps/api/window')
				.then(({ getCurrentWindow }) => getCurrentWindow().setTheme(windowTheme(theme)))
				.catch(() => undefined);
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
	const language = useNavStore((s) => s.language);
	const setLanguage = useNavStore((s) => s.setLanguage);
	const sidebarWidth = useNavStore((s) => s.sidebarWidth);
	const setSidebarWidth = useNavStore((s) => s.setSidebarWidth);
	const previewSize = useNavStore((s) => s.previewSize);
	const setPreviewSize = useNavStore((s) => s.setPreviewSize);
	const sidebarRef = usePanelRef();
	const profileId = useNavStore((s) => s.profileId);
	const mainView = useNavStore((s) => s.mainView);
	const setMainView = useNavStore((s) => s.setMainView);
	const newTab = useNavStore((s) => s.newTab);
	const closeTab = useNavStore((s) => s.closeTab);
	const activeTabId = useNavStore((s) => s.activeTabId);
	const back = useNavStore((s) => s.back);
	const forward = useNavStore((s) => s.forward);
	const setPreview = useNavStore((s) => s.setPreview);
	const transferConcurrency = useNavStore((s) => s.transferConcurrency);
	const activeTab = useActiveTab();
	const [commandOpen, setCommandOpen] = useState(false);
	const [formOpen, setFormOpen] = useState(false);
	const [editing, setEditing] = useState<Profile | null>(null);
	const transferCount = useActiveTransferCount();
	const { data: profiles = [] } = useQuery({
		queryKey: queryKeys.profiles,
		queryFn: api.listProfiles,
	});
	const currentProfile = profiles.find((p) => p.id === profileId);

	useThemeClass(theme);

	useEffect(() => {
		document.documentElement.lang = language;
		if (i18n.language !== language) {
			void i18n.changeLanguage(language);
		}
	}, [i18n, language]);

	useEffect(() => {
		void api.setTransferConcurrency(transferConcurrency).catch(() => undefined);
	}, [transferConcurrency]);

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
			if (key === '4') {
				e.preventDefault();
				setMainView('transfers');
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [activeTabId, back, closeTab, forward, newTab, setMainView]);

	const themeLabel =
		theme === 'dark'
			? t('command.themeDark')
			: theme === 'light'
				? t('command.themeLight')
				: t('command.themeSystem');
	const languageLabel = language === 'zh-CN' ? t('command.languageZh') : t('command.languageEn');

	function openAdd() {
		setEditing(null);
		setFormOpen(true);
	}

	function openEdit(profile: Profile) {
		setEditing(profile);
		setFormOpen(true);
	}

	const showSidebar = Boolean(profileId) && mainView !== 'accounts' && mainView !== 'transfers';
	const preview = activeTab.preview;
	const showPreview = Boolean(preview) && mainView === 'objects';

	return (
		<div className="flex h-full flex-col bg-background text-foreground">
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
				<DropdownMenu>
					<Tooltip>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" size="icon-sm" aria-label={t('command.language')}>
									<Languages />
								</Button>
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<TooltipContent>{languageLabel}</TooltipContent>
					</Tooltip>
					<DropdownMenuContent align="end">
						<DropdownMenuRadioGroup
							value={language}
							onValueChange={(value) => {
								if (value === 'zh-CN' || value === 'en-US') {
									setLanguage(value);
								}
							}}
						>
							<DropdownMenuRadioItem value="zh-CN">{t('command.languageZh')}</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="en-US">{t('command.languageEn')}</DropdownMenuRadioItem>
						</DropdownMenuRadioGroup>
					</DropdownMenuContent>
				</DropdownMenu>
				<DropdownMenu>
					<Tooltip>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" size="icon-sm" aria-label={t('command.theme')}>
									{theme === 'system' ? <Monitor /> : theme === 'dark' ? <Moon /> : <Sun />}
								</Button>
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<TooltipContent>{themeLabel}</TooltipContent>
					</Tooltip>
					<DropdownMenuContent align="end">
						<DropdownMenuRadioGroup
							value={theme}
							onValueChange={(value) => {
								if (value === 'light' || value === 'dark' || value === 'system') {
									setTheme(value);
								}
							}}
						>
							<DropdownMenuRadioItem value="light">{t('command.themeLight')}</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="dark">{t('command.themeDark')}</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="system">
								{t('command.themeSystem')}
							</DropdownMenuRadioItem>
						</DropdownMenuRadioGroup>
					</DropdownMenuContent>
				</DropdownMenu>
				<AboutDialog />
			</header>
			<div className="flex min-h-0 flex-1">
				<ActivityRail transferCount={transferCount} onAdd={openAdd} />
				<main className="flex min-h-0 min-w-0 flex-1">
					{mainView === 'accounts' ? (
						<AccountsPage onAdd={openAdd} onEdit={openEdit} />
					) : mainView === 'transfers' ? (
						<TransferPage />
					) : !profileId ? (
						<Onboarding onAdd={openAdd} />
					) : (
						<ResizablePanelGroup
							id="shell-outer"
							orientation="horizontal"
							className="h-full"
							onLayoutChanged={(_layout, { isUserInteraction }) => {
								if (!isUserInteraction) {
									return;
								}
								const px = sidebarRef.current?.getSize().inPixels;
								if (px) {
									setSidebarWidth(px);
								}
							}}
						>
							{showSidebar ? (
								<>
									<ResizablePanel
										id="sidebar"
										panelRef={sidebarRef}
										defaultSize={`${sidebarWidth}px`}
										minSize={`${SIDEBAR_MIN_PX}px`}
										maxSize={`${SIDEBAR_MAX_PX}px`}
										groupResizeBehavior="preserve-pixel-size"
										className="overflow-hidden"
									>
										<BucketSidebar onAdd={openAdd} onManage={() => setMainView('accounts')} />
									</ResizablePanel>
									<ResizableHandle />
								</>
							) : null}
							<ResizablePanel id="rest" minSize="30" className="min-w-0 overflow-hidden">
								<ResizablePanelGroup
									id="shell-inner"
									orientation="horizontal"
									className="h-full"
									onLayoutChanged={(layout, { isUserInteraction }) => {
										if (!isUserInteraction) {
											return;
										}
										const size = layout.preview;
										if (typeof size === 'number') {
											setPreviewSize(size);
										}
									}}
								>
									<ResizablePanel id="browser" minSize="30" className="min-w-0 overflow-hidden">
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
												id="preview"
												defaultSize={`${previewSize}%`}
												minSize="18"
												maxSize="45"
												className="min-w-0 overflow-hidden"
											>
												<PreviewPane target={preview!} onClose={() => setPreview(null)} />
											</ResizablePanel>
										</>
									) : null}
								</ResizablePanelGroup>
							</ResizablePanel>
						</ResizablePanelGroup>
					)}
				</main>
			</div>
			<footer className="flex h-9 shrink-0 items-center gap-3 border-t bg-titlebar px-3">
				<CostBar />
				<Button
					className="ml-auto"
					variant="ghost"
					size="sm"
					onClick={() => setMainView(mainView === 'transfers' ? 'objects' : 'transfers')}
				>
					{transferCount > 0 ? t('transfer.active', { count: transferCount }) : t('transfer.idle')}
				</Button>
			</footer>
			<CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
			<ProfileFormDialog open={formOpen} onOpenChange={setFormOpen} profile={editing} />
		</div>
	);
}

function Onboarding({ onAdd }: { onAdd: () => void }) {
	const { t } = useTranslation();
	return (
		<div className="flex h-full w-full items-center justify-center overflow-y-auto scrollbar-gutter-stable p-8">
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
