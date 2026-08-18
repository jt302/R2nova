import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import type { Jurisdiction, Profile } from '@/entities/profile/types';
import { toastProbeResult } from '@/features/profile/accounts-page';
import { api } from '@/shared/api/backend';
import { isAppError } from '@/shared/api/tauri-invoke';
import { queryKeys } from '@/shared/config/query-keys';
import { useNavStore } from '@/store/nav';

function isAccountId(value: string): boolean {
	return /^[0-9a-fA-F]{32}$/.test(value.trim());
}

type Form = {
	name: string;
	accountId: string;
	accessKeyId: string;
	secretAccessKey: string;
	jurisdiction: Jurisdiction;
	cfApiToken: string;
};

function emptyForm(): Form {
	return {
		name: '',
		accountId: '',
		accessKeyId: '',
		secretAccessKey: '',
		jurisdiction: 'default',
		cfApiToken: '',
	};
}

function fromProfile(profile: Profile): Form {
	return {
		name: profile.name,
		accountId: profile.accountId,
		accessKeyId: profile.accessKeyId,
		secretAccessKey: '',
		jurisdiction: profile.jurisdiction,
		cfApiToken: '',
	};
}

export function ProfileFormDialog({
	open,
	onOpenChange,
	profile,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	profile?: Profile | null;
}) {
	const { t } = useTranslation();
	const qc = useQueryClient();
	const setProfileId = useNavStore((s) => s.setProfileId);
	const editing = Boolean(profile);
	const [form, setForm] = useState<Form>(emptyForm);

	useEffect(() => {
		if (!open) {
			return;
		}
		setForm(profile ? fromProfile(profile) : emptyForm());
	}, [open, profile]);

	const save = useMutation({
		mutationFn: () =>
			api.upsertProfile({
				id: profile?.id,
				name: form.name.trim(),
				accountId: form.accountId.trim(),
				accessKeyId: form.accessKeyId.trim(),
				secretAccessKey: form.secretAccessKey.trim(),
				jurisdiction: form.jurisdiction,
				cfApiToken: form.cfApiToken.trim() || undefined,
			}),
		onSuccess: (p) => {
			void qc.invalidateQueries({ queryKey: queryKeys.profiles });
			void qc.invalidateQueries({ queryKey: queryKeys.buckets(p.id) });
			setProfileId(p.id);
			toastProbeResult(t, p);
			onOpenChange(false);
		},
	});

	const canSave =
		form.name.trim() &&
		isAccountId(form.accountId) &&
		form.accessKeyId.trim() &&
		(editing || form.secretAccessKey.trim());

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{editing ? t('profile.edit') : t('profile.add')}</DialogTitle>
					<DialogDescription>{t('profile.emptyBody')}</DialogDescription>
				</DialogHeader>
				<div className="grid gap-3">
					<div className="grid gap-1.5">
						<Label htmlFor="profile-name">{t('profile.name')}</Label>
						<Input
							id="profile-name"
							value={form.name}
							onChange={(e) => setForm({ ...form, name: e.target.value })}
						/>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="profile-account">{t('profile.accountId')}</Label>
						<Input
							id="profile-account"
							value={form.accountId}
							onChange={(e) => setForm({ ...form, accountId: e.target.value })}
						/>
						<p className="text-xs text-muted-foreground">{t('profile.accountIdHint')}</p>
						{form.accountId.trim() && !isAccountId(form.accountId) ? (
							<p className="text-xs text-destructive">{t('profile.accountIdInvalid')}</p>
						) : null}
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="profile-ak">{t('profile.accessKeyId')}</Label>
						<Input
							id="profile-ak"
							value={form.accessKeyId}
							onChange={(e) => setForm({ ...form, accessKeyId: e.target.value })}
						/>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="profile-sk">{t('profile.secretAccessKey')}</Label>
						<Input
							id="profile-sk"
							type="password"
							value={form.secretAccessKey}
							onChange={(e) => setForm({ ...form, secretAccessKey: e.target.value })}
							placeholder={editing ? t('profile.secretUnchanged') : undefined}
						/>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="profile-token">{t('profile.cfToken')}</Label>
						<Input
							id="profile-token"
							type="password"
							value={form.cfApiToken}
							onChange={(e) => setForm({ ...form, cfApiToken: e.target.value })}
							placeholder={editing ? t('profile.tokenUnchanged') : undefined}
						/>
					</div>
					<div className="grid gap-1.5">
						<Label>{t('profile.jurisdiction')}</Label>
						<Select
							value={form.jurisdiction}
							onValueChange={(value) => setForm({ ...form, jurisdiction: value as Jurisdiction })}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="default">{t('profile.jurisdictionDefault')}</SelectItem>
								<SelectItem value="eu">{t('profile.jurisdictionEu')}</SelectItem>
								<SelectItem value="fedramp">{t('profile.jurisdictionFedramp')}</SelectItem>
							</SelectContent>
						</Select>
					</div>
					{save.error ? (
						<p className="text-sm text-destructive">
							{isAppError(save.error) ? save.error.message : String(save.error)}
						</p>
					) : null}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						{t('common.cancel')}
					</Button>
					<Button disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
						{t('common.save')}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
