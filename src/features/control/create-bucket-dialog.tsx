import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSeparator,
	FieldSet,
	FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
	LOCATION_HINTS,
	type LocationHint,
	type Profile,
	type StorageClass,
} from '@/entities/profile/types';
import { validateBucketName } from '@/features/control/cf-forms';
import { api } from '@/shared/api/backend';
import { isAppError } from '@/shared/api/tauri-invoke';
import { queryKeys } from '@/shared/config/query-keys';
import { useNavStore } from '@/store/nav';

type LocationHintValue = LocationHint | 'none';

function jurisdictionLabel(jurisdiction: Profile['jurisdiction'], t: (key: string) => string) {
	if (jurisdiction === 'eu') {
		return t('profile.jurisdictionEu');
	}
	if (jurisdiction === 'fedramp') {
		return t('profile.jurisdictionFedramp');
	}
	return t('profile.jurisdictionDefault');
}

export function CreateBucketDialog({
	open,
	onOpenChange,
	profile,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	profile: Profile;
}) {
	const { t } = useTranslation();
	const qc = useQueryClient();
	const go = useNavStore((s) => s.go);
	const [name, setName] = useState('');
	const [locationHint, setLocationHint] = useState<LocationHintValue>('none');
	const [storageClass, setStorageClass] = useState<StorageClass>('standard');
	const restricted = profile.jurisdiction !== 'default';
	const locationMode = restricted ? 'jurisdiction' : 'auto';
	const trimmed = name.trim();
	const nameIssue = trimmed ? validateBucketName(trimmed) : 'length';
	const nameValid = nameIssue === 'ok';

	useEffect(() => {
		if (!open) {
			return;
		}
		setName('');
		setLocationHint('none');
		setStorageClass('standard');
	}, [open]);

	const create = useMutation({
		mutationFn: () =>
			api.cfCreateBucket({
				profileId: profile.id,
				name: trimmed,
				locationHint: restricted || locationHint === 'none' ? null : locationHint,
				storageClass,
			}),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: queryKeys.buckets(profile.id) });
			go({ bucket: trimmed, prefix: '' });
			toast.success(t('toast.bucketCreated', { name: trimmed }));
			onOpenChange(false);
		},
		onError: (err) => toast.error(isAppError(err) ? err.message : String(err)),
	});

	function submit() {
		if (!nameValid || create.isPending) {
			return;
		}
		create.mutate();
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>{t('control.createBucket')}</DialogTitle>
					<DialogDescription>{t('control.createBucketDesc')}</DialogDescription>
				</DialogHeader>
				<FieldGroup className="min-h-0 overflow-y-auto">
					<Field data-invalid={trimmed.length > 0 && !nameValid ? true : undefined}>
						<FieldLabel htmlFor="create-bucket-name">{t('control.bucketName')}</FieldLabel>
						<Input
							id="create-bucket-name"
							value={name}
							autoComplete="off"
							spellCheck={false}
							aria-invalid={trimmed.length > 0 && !nameValid}
							onChange={(e) => setName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') {
									submit();
								}
							}}
						/>
						<FieldDescription>{t('control.bucketNameHint')}</FieldDescription>
						{trimmed.length > 0 && !nameValid ? (
							<FieldError>{t('control.bucketNameInvalid')}</FieldError>
						) : null}
					</Field>
					<FieldSeparator />
					<FieldSet>
						<FieldLegend>{t('control.location')}</FieldLegend>
						<RadioGroup
							className="grid sm:grid-cols-2"
							value={locationMode}
							onValueChange={() => undefined}
						>
							<FieldLabel htmlFor="create-bucket-location-auto">
								<Field orientation="horizontal" data-disabled={restricted || undefined}>
									<RadioGroupItem
										id="create-bucket-location-auto"
										value="auto"
										disabled={restricted}
									/>
									<FieldContent>
										<FieldTitle>{t('control.locationAuto')}</FieldTitle>
										<FieldDescription>
											{restricted
												? t('control.locationFollowsAccount')
												: t('control.locationAutoDesc')}
										</FieldDescription>
										{restricted ? null : (
											<Field className="mt-2">
												<FieldLabel htmlFor="create-bucket-location-hint">
													{t('control.locationHint')}
												</FieldLabel>
												<Select
													value={locationHint}
													onValueChange={(value) => setLocationHint(value as LocationHintValue)}
												>
													<SelectTrigger id="create-bucket-location-hint" className="w-full">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectGroup>
															<SelectItem value="none">{t('control.locationHintNone')}</SelectItem>
															{LOCATION_HINTS.map((hint) => (
																<SelectItem key={hint} value={hint}>
																	{t(`control.hint.${hint}`)}
																</SelectItem>
															))}
														</SelectGroup>
													</SelectContent>
												</Select>
												<FieldDescription>{t('control.locationHintDesc')}</FieldDescription>
											</Field>
										)}
									</FieldContent>
								</Field>
							</FieldLabel>
							<FieldLabel htmlFor="create-bucket-location-jurisdiction">
								<Field orientation="horizontal" data-disabled={!restricted || undefined}>
									<RadioGroupItem
										id="create-bucket-location-jurisdiction"
										value="jurisdiction"
										disabled={!restricted}
									/>
									<FieldContent>
										<FieldTitle>{t('control.locationJurisdiction')}</FieldTitle>
										<FieldDescription>
											{restricted
												? t('control.locationJurisdictionDesc')
												: t('control.locationFollowsAccount')}
										</FieldDescription>
										{restricted ? (
											<p className="text-sm font-medium">
												{jurisdictionLabel(profile.jurisdiction, t)}
											</p>
										) : null}
									</FieldContent>
								</Field>
							</FieldLabel>
						</RadioGroup>
					</FieldSet>
					<FieldSeparator />
					<FieldSet>
						<FieldLegend>{t('control.storageClass')}</FieldLegend>
						<RadioGroup
							className="grid sm:grid-cols-2"
							value={storageClass}
							onValueChange={(value) => setStorageClass(value as StorageClass)}
						>
							<FieldLabel htmlFor="create-bucket-class-standard">
								<Field orientation="horizontal">
									<RadioGroupItem id="create-bucket-class-standard" value="standard" />
									<FieldContent>
										<FieldTitle>{t('control.storageStandard')}</FieldTitle>
										<FieldDescription>{t('control.storageStandardDesc')}</FieldDescription>
									</FieldContent>
								</Field>
							</FieldLabel>
							<FieldLabel htmlFor="create-bucket-class-ia">
								<Field orientation="horizontal">
									<RadioGroupItem id="create-bucket-class-ia" value="infrequentAccess" />
									<FieldContent>
										<FieldTitle>{t('control.storageIa')}</FieldTitle>
										<FieldDescription>{t('control.storageIaDesc')}</FieldDescription>
									</FieldContent>
								</Field>
							</FieldLabel>
						</RadioGroup>
					</FieldSet>
				</FieldGroup>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						{t('common.cancel')}
					</Button>
					<Button disabled={!nameValid || create.isPending} onClick={submit}>
						{create.isPending ? <Spinner data-icon="inline-start" /> : null}
						{t('control.createBucket')}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
