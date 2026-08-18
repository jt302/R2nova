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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
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
	const accountInvalid = Boolean(form.accountId.trim() && !isAccountId(form.accountId));

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
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{editing ? t('profile.edit') : t('profile.add')}</DialogTitle>
					<DialogDescription>{t('profile.emptyBody')}</DialogDescription>
				</DialogHeader>
				<FieldGroup className="gap-4">
					<Field>
						<FieldLabel htmlFor="profile-name">{t('profile.name')}</FieldLabel>
						<Input
							id="profile-name"
							value={form.name}
							onChange={(e) => setForm({ ...form, name: e.target.value })}
						/>
					</Field>
					<Field data-invalid={accountInvalid || undefined}>
						<FieldLabel htmlFor="profile-account">{t('profile.accountId')}</FieldLabel>
						<Input
							id="profile-account"
							value={form.accountId}
							aria-invalid={accountInvalid}
							onChange={(e) => setForm({ ...form, accountId: e.target.value })}
						/>
						<FieldDescription>{t('profile.accountIdHint')}</FieldDescription>
						{accountInvalid ? <FieldError>{t('profile.accountIdInvalid')}</FieldError> : null}
					</Field>
					<Field>
						<FieldLabel htmlFor="profile-ak">{t('profile.accessKeyId')}</FieldLabel>
						<Input
							id="profile-ak"
							value={form.accessKeyId}
							onChange={(e) => setForm({ ...form, accessKeyId: e.target.value })}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="profile-sk">{t('profile.secretAccessKey')}</FieldLabel>
						<Input
							id="profile-sk"
							type="password"
							value={form.secretAccessKey}
							onChange={(e) => setForm({ ...form, secretAccessKey: e.target.value })}
							placeholder={editing ? t('profile.secretUnchanged') : undefined}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="profile-token">{t('profile.cfToken')}</FieldLabel>
						<Input
							id="profile-token"
							type="password"
							value={form.cfApiToken}
							onChange={(e) => setForm({ ...form, cfApiToken: e.target.value })}
							placeholder={editing ? t('profile.tokenUnchanged') : undefined}
						/>
					</Field>
					<Field>
						<FieldLabel>{t('profile.jurisdiction')}</FieldLabel>
						<Select
							value={form.jurisdiction}
							onValueChange={(value) => setForm({ ...form, jurisdiction: value as Jurisdiction })}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="default">{t('profile.jurisdictionDefault')}</SelectItem>
									<SelectItem value="eu">{t('profile.jurisdictionEu')}</SelectItem>
									<SelectItem value="fedramp">{t('profile.jurisdictionFedramp')}</SelectItem>
								</SelectGroup>
							</SelectContent>
						</Select>
					</Field>
					{save.error ? (
						<FieldError>
							{isAppError(save.error) ? save.error.message : String(save.error)}
						</FieldError>
					) : null}
				</FieldGroup>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						{t('common.cancel')}
					</Button>
					<Button disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
						{save.isPending ? <Spinner data-icon="inline-start" /> : null}
						{t('common.save')}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
