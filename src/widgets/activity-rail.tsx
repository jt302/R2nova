import { ArrowUpDown, FolderOpen, Settings, SlidersHorizontal, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { type MainView, useNavStore } from '@/store/nav';
import { ProfileSwitcher } from '@/widgets/profile-switcher';

type RailItem = {
	view: MainView;
	labelKey:
		| 'nav.objects'
		| 'nav.transfers'
		| 'nav.bucketSettings'
		| 'nav.accounts'
		| 'nav.preferences';
	icon: typeof FolderOpen;
};

const TOP_ITEMS: RailItem[] = [
	{ view: 'objects', labelKey: 'nav.objects', icon: FolderOpen },
	{ view: 'transfers', labelKey: 'nav.transfers', icon: ArrowUpDown },
	{ view: 'settings', labelKey: 'nav.bucketSettings', icon: SlidersHorizontal },
	{ view: 'accounts', labelKey: 'nav.accounts', icon: Users },
];

const BOTTOM_ITEMS: RailItem[] = [
	{ view: 'preferences', labelKey: 'nav.preferences', icon: Settings },
];

function RailButtons({
	items,
	mainView,
	transferCount,
	onSelect,
}: {
	items: RailItem[];
	mainView: MainView;
	transferCount: number;
	onSelect: (view: MainView) => void;
}) {
	const { t } = useTranslation();
	return items.map((item) => {
		const Icon = item.icon;
		const active = mainView === item.view;
		const label =
			item.view === 'transfers' && transferCount > 0
				? t('transfer.active', { count: transferCount })
				: t(item.labelKey);
		return (
			<Tooltip key={item.view}>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={label}
						aria-current={active ? 'page' : undefined}
						className={cn(
							'relative',
							active && 'bg-sidebar-accent text-foreground hover:bg-sidebar-accent',
						)}
						onClick={() => onSelect(item.view)}
					>
						<Icon />
						{active ? (
							<span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />
						) : null}
						{item.view === 'transfers' && transferCount > 0 ? (
							<span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-primary" />
						) : null}
					</Button>
				</TooltipTrigger>
				<TooltipContent side="right">{label}</TooltipContent>
			</Tooltip>
		);
	});
}

export function ActivityRail({
	transferCount,
	onAdd,
}: {
	transferCount: number;
	onAdd: () => void;
}) {
	const mainView = useNavStore((s) => s.mainView);
	const setMainView = useNavStore((s) => s.setMainView);

	return (
		<aside className="flex w-12 shrink-0 flex-col items-center gap-1 border-r bg-sidebar py-2 text-sidebar-foreground">
			<div className="mb-1 flex size-8 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
				R2
			</div>
			<RailButtons
				items={TOP_ITEMS}
				mainView={mainView}
				transferCount={transferCount}
				onSelect={setMainView}
			/>
			<div className="flex-1" />
			<RailButtons
				items={BOTTOM_ITEMS}
				mainView={mainView}
				transferCount={transferCount}
				onSelect={setMainView}
			/>
			<ProfileSwitcher compact onAdd={onAdd} onManage={() => setMainView('accounts')} />
		</aside>
	);
}
