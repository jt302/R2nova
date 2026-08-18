import {
	ArrowUpDown,
	FolderOpen,
	PanelLeft,
	PanelLeftClose,
	SlidersHorizontal,
	Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { type MainView, useNavStore } from '@/store/nav';
import { ProfileSwitcher } from '@/widgets/profile-switcher';

type RailItem = {
	view: MainView;
	labelKey: 'nav.objects' | 'nav.settings' | 'nav.accounts';
	icon: typeof FolderOpen;
};

const ITEMS: RailItem[] = [
	{ view: 'objects', labelKey: 'nav.objects', icon: FolderOpen },
	{ view: 'settings', labelKey: 'nav.settings', icon: SlidersHorizontal },
	{ view: 'accounts', labelKey: 'nav.accounts', icon: Users },
];

export function ActivityRail({
	transferCount,
	transfersOpen,
	onTransfers,
	onAdd,
}: {
	transferCount: number;
	transfersOpen: boolean;
	onTransfers: () => void;
	onAdd: () => void;
}) {
	const { t } = useTranslation();
	const mainView = useNavStore((s) => s.mainView);
	const setMainView = useNavStore((s) => s.setMainView);
	const sidebarCollapsed = useNavStore((s) => s.sidebarCollapsed);
	const setSidebarCollapsed = useNavStore((s) => s.setSidebarCollapsed);
	const canToggleSidebar = mainView !== 'accounts';
	const SidebarIcon = sidebarCollapsed ? PanelLeft : PanelLeftClose;

	return (
		<aside className="flex w-12 shrink-0 flex-col items-center gap-1 border-r bg-sidebar py-2 text-sidebar-foreground">
			<div className="mb-1 flex size-8 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
				R2
			</div>
			{ITEMS.map((item) => {
				const Icon = item.icon;
				const active = mainView === item.view;
				return (
					<Tooltip key={item.view}>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={t(item.labelKey)}
								aria-current={active ? 'page' : undefined}
								className={cn(
									'relative',
									active && 'bg-sidebar-accent text-foreground hover:bg-sidebar-accent',
								)}
								onClick={() => setMainView(item.view)}
							>
								<Icon />
								{active ? (
									<span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />
								) : null}
							</Button>
						</TooltipTrigger>
						<TooltipContent side="right">{t(item.labelKey)}</TooltipContent>
					</Tooltip>
				);
			})}
			{canToggleSidebar ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={sidebarCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
							aria-pressed={!sidebarCollapsed}
							onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
						>
							<SidebarIcon />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="right">
						{sidebarCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
					</TooltipContent>
				</Tooltip>
			) : null}
			<div className="flex-1" />
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={t('nav.transfers')}
						aria-pressed={transfersOpen}
						className={cn('relative', transfersOpen && 'bg-sidebar-accent')}
						onClick={onTransfers}
					>
						<ArrowUpDown />
						{transferCount > 0 ? (
							<span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-primary" />
						) : null}
					</Button>
				</TooltipTrigger>
				<TooltipContent side="right">
					{transferCount > 0 ? t('transfer.active', { count: transferCount }) : t('nav.transfers')}
				</TooltipContent>
			</Tooltip>
			<ProfileSwitcher compact onAdd={onAdd} onManage={() => setMainView('accounts')} />
		</aside>
	);
}
