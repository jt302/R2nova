import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import type { Profile } from '@/entities/profile/types';
import { api } from '@/shared/api/backend';
import { isAppError } from '@/shared/api/tauri-invoke';
import { queryKeys } from '@/shared/config/query-keys';
import { useNavStore } from '@/store/nav';

function keyPrefix(value: string): string {
	return value.length <= 8 ? value : `${value.slice(0, 8)}…`;
}

export function toastProbeResult(t: (key: string) => string, profile: Profile) {
	if (profile.capability === 'admin' || profile.capability === 'object') {
		toast.success(t(`profile.capability.${profile.capability}`));
		return;
	}
	toast.error(profile.lastError || t('profile.invalidHint'));
}

export function AccountsPage({
	onAdd,
	onEdit,
	onClose,
}: {
	onAdd: () => void;
	onEdit: (profile: Profile) => void;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const qc = useQueryClient();
	const profileId = useNavStore((s) => s.profileId);
	const setProfileId = useNavStore((s) => s.setProfileId);
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
		},
		onError: (err) => toast.error(isAppError(err) ? err.message : String(err)),
	});

	return (
		<div className="h-full overflow-auto">
			<div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
				<div className="flex items-center gap-2">
					<Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('common.close')}>
						<ArrowLeft />
					</Button>
					<div className="min-w-0 flex-1">
						<h1 className="text-lg font-semibold">{t('profile.manage')}</h1>
						<p className="text-sm text-muted-foreground">{t('profile.emptyBody')}</p>
					</div>
					<Button size="sm" onClick={onAdd}>
						<Plus />
						{t('profile.add')}
					</Button>
				</div>
				{profiles.length === 0 ? (
					<p className="py-10 text-center text-sm text-muted-foreground">{t('common.empty')}</p>
				) : (
					<div className="grid gap-3">
						{profiles.map((p) => (
							<Card key={p.id}>
								<CardHeader className="gap-2">
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<CardTitle className="truncate">{p.name}</CardTitle>
											<CardDescription className="truncate">{p.accountId}</CardDescription>
										</div>
										<Badge variant={p.capability === 'invalid' ? 'destructive' : 'secondary'}>
											{t(`profile.capability.${p.capability}`)}
										</Badge>
									</div>
									{p.lastError ? (
										<p className="text-xs break-all text-destructive">{p.lastError}</p>
									) : null}
								</CardHeader>
								<CardContent className="flex flex-wrap items-center gap-2">
									<p className="mr-auto text-xs text-muted-foreground">
										{t('profile.accessKeyId')}: {keyPrefix(p.accessKeyId)} ·{' '}
										{t(`profile.jurisdiction${jurisdictionKey(p.jurisdiction)}`)}
									</p>
									<Button size="sm" variant="outline" onClick={() => onEdit(p)}>
										{t('profile.edit')}
									</Button>
									<Button
										size="sm"
										variant="outline"
										disabled={probe.isPending}
										onClick={() => probe.mutate(p.id)}
									>
										{t('profile.probe')}
									</Button>
									<Button size="sm" variant="destructive" onClick={() => setPendingDelete(p)}>
										{t('profile.deleteAccount')}
									</Button>
								</CardContent>
							</Card>
						))}
					</div>
				)}
			</div>
			<Dialog
				open={pendingDelete !== null}
				onOpenChange={(open) => !open && setPendingDelete(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('profile.deleteAccount')}</DialogTitle>
						<DialogDescription>{t('profile.deleteConfirm')}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setPendingDelete(null)}>
							{t('common.cancel')}
						</Button>
						<Button
							variant="destructive"
							disabled={!pendingDelete || remove.isPending}
							onClick={() => pendingDelete && remove.mutate(pendingDelete.id)}
						>
							{t('common.delete')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
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
		<div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
			<p className="text-base font-medium">{t('profile.invalidTitle')}</p>
			<p className="max-w-sm text-sm text-muted-foreground">
				{lastError || t('profile.invalidHint')}
			</p>
			<div className="flex gap-2">
				<Button onClick={onEdit}>{t('profile.edit')}</Button>
				<Button variant="outline" onClick={onManage}>
					{t('profile.manage')}
				</Button>
			</div>
		</div>
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
