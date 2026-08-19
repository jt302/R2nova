import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Plus, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { api } from '@/shared/api/backend';
import { queryKeys } from '@/shared/config/query-keys';
import { profileInitials } from '@/shared/lib/object-key';
import { useNavStore } from '@/store/nav';
import { CapabilityBadge } from '@/widgets/capability-badge';

export function ProfileSwitcher({
	compact = false,
	onAdd,
	onManage,
}: {
	compact?: boolean;
	onAdd?: () => void;
	onManage?: () => void;
}) {
	const { t } = useTranslation();
	const profileId = useNavStore((s) => s.profileId);
	const setProfileId = useNavStore((s) => s.setProfileId);
	const setMainView = useNavStore((s) => s.setMainView);
	const { data: profiles = [], isLoading } = useQuery({
		queryKey: queryKeys.profiles,
		queryFn: api.listProfiles,
	});
	const current = profiles.find((p) => p.id === profileId);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant={compact ? 'ghost' : 'outline'}
					size={compact ? 'icon-sm' : 'sm'}
					className={cn(!compact && 'h-9 w-full justify-between px-2')}
					aria-label={t('profile.switch')}
				>
					<Avatar className="size-6">
						<AvatarFallback className="text-[10px]">
							{current ? profileInitials(current.name) : 'R'}
						</AvatarFallback>
					</Avatar>
					{compact ? null : (
						<>
							<span className="min-w-0 flex-1 truncate text-left">
								{isLoading ? t('common.loading') : (current?.name ?? t('profile.noAccount'))}
							</span>
							<ChevronsUpDown data-icon="inline-end" />
						</>
					)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align={compact ? 'end' : 'start'} className="w-64">
				<DropdownMenuGroup>
					<DropdownMenuLabel>{t('profile.title')}</DropdownMenuLabel>
					{isLoading ? (
						<DropdownMenuItem disabled>{t('common.loading')}</DropdownMenuItem>
					) : profiles.length === 0 ? (
						<DropdownMenuItem disabled>{t('profile.noAccount')}</DropdownMenuItem>
					) : (
						profiles.map((p) => (
							<DropdownMenuItem
								key={p.id}
								onSelect={() => {
									setProfileId(p.id);
									setMainView('objects');
								}}
							>
								<Avatar className="size-6">
									<AvatarFallback className="text-[10px]">{profileInitials(p.name)}</AvatarFallback>
								</Avatar>
								<span className="min-w-0 flex-1 truncate">{p.name}</span>
								<CapabilityBadge capability={p.capability} />
								{p.id === profileId ? <Check /> : null}
							</DropdownMenuItem>
						))
					)}
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						onSelect={() => {
							onAdd?.();
						}}
					>
						<Plus />
						{t('profile.add')}
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => {
							onManage?.();
							setMainView('accounts');
						}}
					>
						<Users />
						{t('profile.manage')}
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
