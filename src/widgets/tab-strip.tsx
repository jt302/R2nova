import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useNavStore } from '@/store/nav';

export function TabStrip() {
	const { t } = useTranslation();
	const tabs = useNavStore((s) => s.tabs);
	const activeTabId = useNavStore((s) => s.activeTabId);
	const setActiveTab = useNavStore((s) => s.setActiveTab);
	const closeTab = useNavStore((s) => s.closeTab);
	const newTab = useNavStore((s) => s.newTab);

	return (
		<div className="flex min-w-0 flex-1 items-center gap-1">
			<div className="flex min-w-0 items-center gap-1 overflow-x-auto">
				{tabs.map((tab) => {
					const active = tab.id === activeTabId;
					return (
						<button
							key={tab.id}
							type="button"
							className={cn(
								'group flex h-8 max-w-52 min-w-24 items-center gap-1 rounded-md px-2.5 text-left text-sm transition-colors',
								active
									? 'bg-background text-foreground shadow-xs'
									: 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
							)}
							onClick={() => setActiveTab(tab.id)}
							onAuxClick={(e) => {
								if (e.button === 1) {
									closeTab(tab.id);
								}
							}}
						>
							<span className="min-w-0 flex-1 truncate">{tab.title}</span>
							<span
								className={cn(
									'rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground',
									active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
								)}
								onClick={(e) => {
									e.stopPropagation();
									closeTab(tab.id);
								}}
							>
								<X className="size-3" />
							</span>
						</button>
					);
				})}
			</div>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button variant="ghost" size="icon-sm" onClick={newTab} aria-label={t('nav.newTab')}>
						<Plus />
					</Button>
				</TooltipTrigger>
				<TooltipContent>{t('nav.newTab')}</TooltipContent>
			</Tooltip>
		</div>
	);
}
