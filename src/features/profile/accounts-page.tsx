import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { KeyRound, MoreHorizontal, Plus, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
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
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemTitle,
} from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import type { Profile } from '@/entities/profile/types';
import { api } from '@/shared/api/backend';
import { isAppError } from '@/shared/api/tauri-invoke';
import { queryKeys } from '@/shared/config/query-keys';
import { profileInitials } from '@/shared/lib/object-key';
import { useNavStore } from '@/store/nav';
import { CapabilityBadge } from '@/widgets/capability-badge';
import { PageHeader } from '@/widgets/page-header';

function keyPrefix(value: string): string {
	return value.length <= 8 ? value : `${value.slice(0, 8)}…`;
}

export function toastProbeResult(t: TFunction, profile: Profile, kind: 'save' | 'probe' = 'probe') {
	if (profile.capability === 'admin' || profile.capability === 'object') {
		toast.success(
			t(kind === 'save' ? 'toast.accountSaved' : 'toast.probeOk', {
				capability: t(`profile.capability.${profile.capability}`),
			}),
		);
		return;
	}
	toast.error(profile.lastError || t('profile.invalidHint'));
}

export function AccountsPage({
	onAdd,
	onEdit,
}: {
	onAdd: () => void;
	onEdit: (profile: Profile) => void;
}) {
	const { t } = useTranslation();
	const qc = useQueryClient();
	const profileId = useNavStore((s) => s.profileId);
	const setProfileId = useNavStore((s) => s.setProfileId);
	const setMainView = useNavStore((s) => s.setMainView);
	const { data: profiles = [] } = useQuery({
		queryKey: queryKeys.profiles,
		queryFn: api.listProfiles,
	});
	const [pendingDelete, setPendingDelete] = useState<Profile | null>(null);

	const probe = useMutation({
		mutationFn: (id: string) => api.probeProfile(id),
		onSuccess: (profile) => {
			void qc.invalidateQueries({ queryKey: queryKeys.profiles });
			toastProbeResult(t, profile);
		},
		onError: (err) => toast.error(isAppError(err) ? err.message : String(err)),
	});

	const remove = useMutation({
		mutationFn: (id: string) => api.deleteProfile(id),
		onSuccess: (_, id) => {
			void qc.invalidateQueries({ queryKey: queryKeys.profiles });
			if (profileId === id) {
				const next = profiles.find((p) => p.id !== id);
				setProfileId(next?.id ?? null);
			}
			setPendingDelete(null);
			toast.success(t('toast.accountDeleted'));
		},
		onError: (err) => toast.error(isAppError(err) ? err.message : String(err)),
	});

	return (
		<div className="h-full min-h-0 w-full flex-1 overflow-y-auto scrollbar-gutter-stable">
			<div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8">
				<PageHeader
					title={t('profile.manage')}
					description={t('profile.emptyBody')}
					actions={
						<Button size="sm" onClick={onAdd}>
							<Plus data-icon="inline-start" />
							{t('profile.add')}
						</Button>
					}
				/>
				{profiles.length === 0 ? (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<KeyRound />
							</EmptyMedia>
							<EmptyTitle>{t('profile.emptyTitle')}</EmptyTitle>
							<EmptyDescription>{t('profile.emptyBody')}</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<Button onClick={onAdd}>
								<Plus data-icon="inline-start" />
								{t('profile.add')}
							</Button>
						</EmptyContent>
					</Empty>
				) : (
					<ItemGroup className="gap-3">
						{profiles.map((p) => (
							<Item key={p.id} variant="outline">
								<Avatar className="size-10">
									<AvatarFallback>{profileInitials(p.name)}</AvatarFallback>
								</Avatar>
								<ItemContent>
									<ItemTitle className="min-w-0 max-w-full">
										<span className="truncate" title={p.name}>
											{p.name}
										</span>
										<CapabilityBadge capability={p.capability} />
									</ItemTitle>
									<ItemDescription>
										{p.accountId} · {t('profile.accessKeyId')}: {keyPrefix(p.accessKeyId)} ·{' '}
										{t(`profile.jurisdiction${jurisdictionKey(p.jurisdiction)}`)}
									</ItemDescription>
									{p.lastError ? (
										<Alert variant="destructive" className="mt-2">
											<AlertTitle>{t('profile.invalidTitle')}</AlertTitle>
											<AlertDescription>{p.lastError}</AlertDescription>
										</Alert>
									) : null}
								</ItemContent>
								<ItemActions>
									<Button
										size="sm"
										variant={profileId === p.id ? 'secondary' : 'outline'}
										onClick={() => {
											setProfileId(p.id);
											setMainView('objects');
										}}
									>
										{t('profile.useAccount')}
									</Button>
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button size="icon-sm" variant="ghost" aria-label={t('common.more')}>
												<MoreHorizontal />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuGroup>
												<DropdownMenuItem onSelect={() => onEdit(p)}>
													{t('profile.edit')}
												</DropdownMenuItem>
												<DropdownMenuItem
													disabled={probe.isPending}
													onSelect={() => probe.mutate(p.id)}
												>
													{probe.isPending ? <Spinner /> : null}
													{t('profile.probe')}
												</DropdownMenuItem>
											</DropdownMenuGroup>
											<DropdownMenuSeparator />
											<DropdownMenuGroup>
												<DropdownMenuItem
													variant="destructive"
													onSelect={() => setPendingDelete(p)}
												>
													{t('profile.deleteAccount')}
												</DropdownMenuItem>
											</DropdownMenuGroup>
										</DropdownMenuContent>
									</DropdownMenu>
								</ItemActions>
							</Item>
						))}
					</ItemGroup>
				)}
			</div>
			<AlertDialog
				open={pendingDelete !== null}
				onOpenChange={(open) => !open && setPendingDelete(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t('profile.deleteAccount')}</AlertDialogTitle>
						<AlertDialogDescription>{t('profile.deleteConfirm')}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={!pendingDelete || remove.isPending}
							onClick={() => pendingDelete && remove.mutate(pendingDelete.id)}
						>
							{t('common.delete')}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

export function InvalidAccountState({
	lastError,
	onEdit,
	onManage,
}: {
	lastError?: string | null;
	onEdit: () => void;
	onManage: () => void;
}) {
	const { t } = useTranslation();
	return (
		<Empty className="h-full border-0">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<ShieldAlert />
				</EmptyMedia>
				<EmptyTitle>{t('profile.invalidTitle')}</EmptyTitle>
				<EmptyDescription>{lastError || t('profile.invalidHint')}</EmptyDescription>
			</EmptyHeader>
			<EmptyContent>
				<div className="flex gap-2">
					<Button onClick={onEdit}>{t('profile.edit')}</Button>
					<Button variant="outline" onClick={onManage}>
						{t('profile.manage')}
					</Button>
				</div>
			</EmptyContent>
		</Empty>
	);
}

function jurisdictionKey(value: Profile['jurisdiction']): 'Default' | 'Eu' | 'Fedramp' {
	if (value === 'eu') {
		return 'Eu';
	}
	if (value === 'fedramp') {
		return 'Fedramp';
	}
	return 'Default';
}
