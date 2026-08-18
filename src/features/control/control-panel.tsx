import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HardDrive, Shield } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
	type CorsRuleForm,
	corsToPayload,
	type LifecycleRuleForm,
	lifecycleToPayload,
	lockPayload,
	metricEntries,
	parseCorsRules,
	parseDevUrl,
	parseDomains,
	parseJson,
	parseLifecycleRules,
	parseLockEnabled,
	stringifyJson,
} from '@/features/control/cf-forms';
import { api } from '@/shared/api/backend';
import { isAppError } from '@/shared/api/tauri-invoke';
import { queryKeys } from '@/shared/config/query-keys';
import { useCurrentLocation, useNavStore } from '@/store/nav';
import { PageHeader } from '@/widgets/page-header';

function AdvancedJson({
	data,
	onSave,
}: {
	data: unknown;
	onSave: (value: unknown) => Promise<void>;
}) {
	const { t } = useTranslation();
	const [text, setText] = useState(() => stringifyJson(data));
	useEffect(() => {
		setText(stringifyJson(data));
	}, [data]);
	return (
		<details>
			<summary className="cursor-pointer text-sm text-muted-foreground">
				{t('common.advanced')}
			</summary>
			<div className="mt-2 flex flex-col gap-2">
				<Textarea
					className="font-mono text-xs"
					rows={8}
					value={text}
					onChange={(e) => setText(e.target.value)}
				/>
				<Button
					size="sm"
					variant="outline"
					className="self-start"
					onClick={async () => {
						try {
							await onSave(parseJson(text));
						} catch {
							toast.error(t('control.jsonInvalid'));
						}
					}}
				>
					{t('common.save')}
				</Button>
			</div>
		</details>
	);
}

export function ControlPanel() {
	const { t } = useTranslation();
	const qc = useQueryClient();
	const profileId = useNavStore((s) => s.profileId);
	const go = useNavStore((s) => s.go);
	const loc = useCurrentLocation();
	const bucket = loc.bucket;
	const { data: profiles = [] } = useQuery({
		queryKey: queryKeys.profiles,
		queryFn: api.listProfiles,
	});
	const profile = profiles.find((p) => p.id === profileId);
	const admin = profile?.capability === 'admin';
	const [section, setSection] = useState('overview');
	const [newBucket, setNewBucket] = useState('');
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [corsRules, setCorsRules] = useState<CorsRuleForm[]>(parseCorsRules(null));
	const [lifeRules, setLifeRules] = useState<LifecycleRuleForm[]>(parseLifecycleRules(null));

	const enabled = Boolean(admin && profileId && bucket);
	const cors = useQuery({
		queryKey: queryKeys.cf.cors(profileId ?? '', bucket),
		queryFn: () => api.cfGetCors(profileId ?? '', bucket),
		enabled,
	});
	const life = useQuery({
		queryKey: queryKeys.cf.lifecycle(profileId ?? '', bucket),
		queryFn: () => api.cfGetLifecycle(profileId ?? '', bucket),
		enabled,
	});
	const dev = useQuery({
		queryKey: queryKeys.cf.devUrl(profileId ?? '', bucket),
		queryFn: () => api.cfGetDevUrl(profileId ?? '', bucket),
		enabled,
	});
	const domains = useQuery({
		queryKey: queryKeys.cf.domains(profileId ?? '', bucket),
		queryFn: () => api.cfListCustomDomains(profileId ?? '', bucket),
		enabled,
	});
	const lock = useQuery({
		queryKey: queryKeys.cf.lock(profileId ?? '', bucket),
		queryFn: () => api.cfGetLock(profileId ?? '', bucket),
		enabled,
	});
	const metrics = useQuery({
		queryKey: queryKeys.cf.metrics(profileId ?? ''),
		queryFn: () => api.cfMetrics(profileId ?? ''),
		enabled: Boolean(admin && profileId),
	});
	const events = useQuery({
		queryKey: queryKeys.cf.events(profileId ?? '', bucket),
		queryFn: () => api.cfGetEvents(profileId ?? '', bucket),
		enabled,
	});
	const multipart = useQuery({
		queryKey: queryKeys.multipart(profileId ?? '', bucket),
		queryFn: () => api.listMultipart(profileId ?? '', bucket),
		enabled: Boolean(profileId && bucket),
	});

	useEffect(() => {
		if (cors.data) {
			setCorsRules(parseCorsRules(cors.data));
		}
	}, [cors.data]);
	useEffect(() => {
		if (life.data) {
			setLifeRules(parseLifecycleRules(life.data));
		}
	}, [life.data]);

	const createBucket = useMutation({
		mutationFn: () => api.cfCreateBucket(profileId ?? '', newBucket.trim()),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: queryKeys.buckets(profileId ?? '') });
			go({ bucket: newBucket.trim(), prefix: '' });
			toast.success(t('control.createBucket'));
			setNewBucket('');
		},
		onError: (err) => toast.error(isAppError(err) ? err.message : String(err)),
	});

	function fail(err: unknown) {
		toast.error(isAppError(err) ? err.message : String(err));
	}

	if (!admin) {
		return (
			<Empty className="h-full border-0">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Shield />
					</EmptyMedia>
					<EmptyTitle>{t('nav.settings')}</EmptyTitle>
					<EmptyDescription>{t('profile.needAdmin')}</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	const devParsed = parseDevUrl(dev.data);
	const domainList = parseDomains(domains.data);
	const metricsList = metricEntries(metrics.data);
	const lockOn = parseLockEnabled(lock.data);

	return (
		<div className="h-full overflow-auto">
			<div className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
				<PageHeader title={t('nav.settings')} description={bucket || t('browser.selectBucket')} />

				<Tabs value={section} onValueChange={setSection}>
					<TabsList variant="line">
						<TabsTrigger value="overview">{t('control.sectionOverview')}</TabsTrigger>
						<TabsTrigger value="access" disabled={!bucket}>
							{t('control.sectionAccess')}
						</TabsTrigger>
						<TabsTrigger value="rules" disabled={!bucket}>
							{t('control.sectionRules')}
						</TabsTrigger>
						<TabsTrigger value="danger" disabled={!bucket}>
							{t('control.sectionDanger')}
						</TabsTrigger>
					</TabsList>

					<TabsContent value="overview" className="flex flex-col gap-4 pt-4">
						<Card>
							<CardHeader>
								<CardTitle>{t('control.createBucket')}</CardTitle>
								<CardDescription>{t('control.createBucketDesc')}</CardDescription>
							</CardHeader>
							<CardContent>
								<FieldGroup className="gap-3">
									<Field orientation="horizontal">
										<FieldLabel htmlFor="create-bucket" className="sr-only">
											{t('control.bucketName')}
										</FieldLabel>
										<Input
											id="create-bucket"
											value={newBucket}
											onChange={(e) => setNewBucket(e.target.value)}
											placeholder={t('control.bucketName')}
										/>
										<Button
											disabled={!newBucket.trim() || createBucket.isPending}
											onClick={() => createBucket.mutate()}
										>
											{t('common.save')}
										</Button>
									</Field>
								</FieldGroup>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>{t('control.metrics')}</CardTitle>
								<CardDescription>{t('control.metricsDesc')}</CardDescription>
							</CardHeader>
							<CardContent>
								{metricsList.length === 0 ? (
									<p className="text-sm text-muted-foreground">{t('common.empty')}</p>
								) : (
									<dl className="grid grid-cols-2 gap-3">
										{metricsList.map(([key, value]) => (
											<div key={key} className="rounded-lg border bg-muted/30 p-3">
												<dt className="text-xs text-muted-foreground">{key}</dt>
												<dd className="mt-1 text-sm font-medium tabular-nums">{value}</dd>
											</div>
										))}
									</dl>
								)}
							</CardContent>
						</Card>

						{!bucket ? (
							<Empty>
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<HardDrive />
									</EmptyMedia>
									<EmptyTitle>{t('control.noBucketTitle')}</EmptyTitle>
									<EmptyDescription>{t('control.noBucketBody')}</EmptyDescription>
								</EmptyHeader>
							</Empty>
						) : (
							<Card>
								<CardHeader>
									<CardTitle>{t('control.multipart')}</CardTitle>
									<CardDescription>{t('control.multipartDesc')}</CardDescription>
								</CardHeader>
								<CardContent>
									{(multipart.data ?? []).length === 0 ? (
										<p className="text-sm text-muted-foreground">{t('control.noUploads')}</p>
									) : (
										<div className="flex flex-col gap-2">
											{(multipart.data ?? []).map((u) => (
												<div key={u.uploadId} className="flex items-center gap-2 text-sm">
													<span className="min-w-0 flex-1 truncate">{u.key}</span>
													<Badge variant="outline">{u.uploadId.slice(0, 8)}</Badge>
													<Button
														size="xs"
														variant="ghost"
														onClick={async () => {
															if (!profileId) {
																return;
															}
															await api.abortMultipart({
																profileId,
																bucket,
																key: u.key,
																uploadId: u.uploadId,
															});
															void qc.invalidateQueries({
																queryKey: queryKeys.multipart(profileId, bucket),
															});
														}}
													>
														{t('control.abort')}
													</Button>
												</div>
											))}
										</div>
									)}
								</CardContent>
							</Card>
						)}
					</TabsContent>

					<TabsContent value="access" className="flex flex-col gap-4 pt-4">
						<Card>
							<CardHeader>
								<CardTitle>{t('control.devUrl')}</CardTitle>
								<CardDescription>{t('control.devUrlDesc')}</CardDescription>
								<CardAction>
									<Switch
										id="dev-url"
										checked={devParsed.enabled}
										onCheckedChange={async (on) => {
											if (!profileId) {
												return;
											}
											try {
												await api.cfSetDevUrl(profileId, bucket, on);
												void qc.invalidateQueries({
													queryKey: queryKeys.cf.devUrl(profileId, bucket),
												});
											} catch (err) {
												fail(err);
											}
										}}
									/>
								</CardAction>
							</CardHeader>
							{devParsed.url ? (
								<CardContent>
									<p className="text-sm">
										<span className="text-muted-foreground">{t('control.currentUrl')}: </span>
										{devParsed.url}
									</p>
								</CardContent>
							) : null}
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>{t('control.domains')}</CardTitle>
								<CardDescription>{t('control.domainsDesc')}</CardDescription>
							</CardHeader>
							<CardContent>
								{domainList.length === 0 ? (
									<p className="text-sm text-muted-foreground">{t('control.noDomains')}</p>
								) : (
									<ul className="flex flex-col gap-1 text-sm">
										{domainList.map((d) => (
											<li key={d}>{d}</li>
										))}
									</ul>
								)}
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>{t('control.cors')}</CardTitle>
								<CardDescription>{t('control.corsDesc')}</CardDescription>
							</CardHeader>
							<CardContent className="flex flex-col gap-4">
								{corsRules.map((rule, i) => (
									<div key={rule.id} className="flex flex-col gap-3 rounded-lg border p-3">
										<FieldGroup className="gap-3">
											<Field>
												<FieldLabel>{t('control.origins')}</FieldLabel>
												<Input
													value={rule.origins}
													onChange={(e) =>
														setCorsRules((list) =>
															list.map((item, idx) =>
																idx === i ? { ...item, origins: e.target.value } : item,
															),
														)
													}
												/>
											</Field>
											<Field>
												<FieldLabel>{t('control.methods')}</FieldLabel>
												<Input
													value={rule.methods}
													onChange={(e) =>
														setCorsRules((list) =>
															list.map((item, idx) =>
																idx === i ? { ...item, methods: e.target.value } : item,
															),
														)
													}
												/>
											</Field>
											<Field>
												<FieldLabel>{t('control.headers')}</FieldLabel>
												<Input
													value={rule.headers}
													onChange={(e) =>
														setCorsRules((list) =>
															list.map((item, idx) =>
																idx === i ? { ...item, headers: e.target.value } : item,
															),
														)
													}
												/>
											</Field>
										</FieldGroup>
										<Button
											size="sm"
											variant="ghost"
											className="self-start"
											onClick={() => setCorsRules((list) => list.filter((_, idx) => idx !== i))}
										>
											{t('control.removeRule')}
										</Button>
									</div>
								))}
							</CardContent>
							<CardFooter className="flex-wrap gap-2 border-t">
								<Button
									size="sm"
									variant="outline"
									onClick={() =>
										setCorsRules((list) => [
											...list,
											{
												id: `cors-${list.length + 1}`,
												origins: '',
												methods: 'GET',
												headers: '',
											},
										])
									}
								>
									{t('control.addRule')}
								</Button>
								<Button
									size="sm"
									onClick={async () => {
										if (!profileId) {
											return;
										}
										try {
											await api.cfPutCors(profileId, bucket, corsToPayload(corsRules));
											toast.success(t('common.save'));
										} catch (err) {
											fail(err);
										}
									}}
								>
									{t('common.save')}
								</Button>
							</CardFooter>
							<CardContent>
								<AdvancedJson
									data={cors.data}
									onSave={async (value) => {
										if (!profileId) {
											return;
										}
										await api.cfPutCors(profileId, bucket, value);
										toast.success(t('common.save'));
									}}
								/>
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="rules" className="flex flex-col gap-4 pt-4">
						<Card>
							<CardHeader>
								<CardTitle>{t('control.lifecycle')}</CardTitle>
								<CardDescription>{t('control.lifecycleDesc')}</CardDescription>
							</CardHeader>
							<CardContent className="flex flex-col gap-4">
								{lifeRules.map((rule, i) => (
									<div
										key={rule.id || i}
										className="grid grid-cols-[1fr_100px_auto] items-end gap-2"
									>
										<Field>
											<FieldLabel>{t('control.prefix')}</FieldLabel>
											<Input
												value={rule.prefix}
												onChange={(e) =>
													setLifeRules((list) =>
														list.map((item, idx) =>
															idx === i ? { ...item, prefix: e.target.value } : item,
														),
													)
												}
											/>
										</Field>
										<Field>
											<FieldLabel>{t('control.days')}</FieldLabel>
											<Input
												type="number"
												min={1}
												value={rule.days}
												onChange={(e) =>
													setLifeRules((list) =>
														list.map((item, idx) =>
															idx === i ? { ...item, days: e.target.value } : item,
														),
													)
												}
											/>
										</Field>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => setLifeRules((list) => list.filter((_, idx) => idx !== i))}
										>
											{t('control.removeRule')}
										</Button>
									</div>
								))}
							</CardContent>
							<CardFooter className="flex-wrap gap-2 border-t">
								<Button
									size="sm"
									variant="outline"
									onClick={() =>
										setLifeRules((list) => [
											...list,
											{ id: `expire-${list.length + 1}`, prefix: '', days: '30' },
										])
									}
								>
									{t('control.addRule')}
								</Button>
								<Button
									size="sm"
									onClick={async () => {
										if (!profileId) {
											return;
										}
										try {
											await api.cfPutLifecycle(profileId, bucket, lifecycleToPayload(lifeRules));
											toast.success(t('common.save'));
										} catch (err) {
											fail(err);
										}
									}}
								>
									{t('common.save')}
								</Button>
							</CardFooter>
							<CardContent>
								<AdvancedJson
									data={life.data}
									onSave={async (value) => {
										if (!profileId) {
											return;
										}
										await api.cfPutLifecycle(profileId, bucket, value);
										toast.success(t('common.save'));
									}}
								/>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>{t('control.lock')}</CardTitle>
								<CardDescription>{t('control.lockDesc')}</CardDescription>
								<CardAction>
									<Switch
										id="lock-switch"
										checked={lockOn}
										onCheckedChange={async (on) => {
											if (!profileId) {
												return;
											}
											try {
												await api.cfPutLock(profileId, bucket, lockPayload(lock.data, on));
												void qc.invalidateQueries({
													queryKey: queryKeys.cf.lock(profileId, bucket),
												});
											} catch (err) {
												fail(err);
											}
										}}
									/>
								</CardAction>
							</CardHeader>
							<CardContent>
								<AdvancedJson
									data={lock.data}
									onSave={async (value) => {
										if (!profileId) {
											return;
										}
										await api.cfPutLock(profileId, bucket, value);
										toast.success(t('common.save'));
									}}
								/>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>{t('control.events')}</CardTitle>
								<CardDescription>{t('control.eventsDesc')}</CardDescription>
							</CardHeader>
							<CardContent className="flex flex-col gap-3">
								<pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
									{stringifyJson(events.data)}
								</pre>
								<AdvancedJson
									data={events.data}
									onSave={async (value) => {
										if (!profileId) {
											return;
										}
										await api.cfPutEvents(profileId, bucket, value);
										toast.success(t('common.save'));
									}}
								/>
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="danger" className="flex flex-col gap-4 pt-4">
						<Card>
							<CardHeader>
								<CardTitle>{t('control.deleteBucket')}</CardTitle>
								<CardDescription>{t('control.deleteBucketDesc')}</CardDescription>
							</CardHeader>
							<CardContent>
								<Button variant="destructive" onClick={() => setDeleteOpen(true)}>
									{t('control.deleteBucket')}
								</Button>
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>
			</div>

			<Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('control.deleteBucket')}</DialogTitle>
						<DialogDescription>{t('control.deleteBucketDesc')}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeleteOpen(false)}>
							{t('common.cancel')}
						</Button>
						<Button
							variant="destructive"
							onClick={async () => {
								if (!profileId || !bucket) {
									return;
								}
								try {
									await api.cfDeleteBucket(profileId, bucket);
									void qc.invalidateQueries({ queryKey: queryKeys.buckets(profileId) });
									go({ bucket: '', prefix: '' });
									setDeleteOpen(false);
								} catch (err) {
									fail(err);
								}
							}}
						>
							{t('common.delete')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
