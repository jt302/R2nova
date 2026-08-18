import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { useNavStore } from '@/store/nav';

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
		<details className="mt-4">
			<summary className="cursor-pointer text-sm text-muted-foreground">
				{t('common.advanced')}
			</summary>
			<Textarea
				className="mt-2 font-mono text-xs"
				rows={8}
				value={text}
				onChange={(e) => setText(e.target.value)}
			/>
			<Button
				className="mt-2"
				size="sm"
				variant="outline"
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
		</details>
	);
}

export function ControlPanel() {
	const { t } = useTranslation();
	const qc = useQueryClient();
	const profileId = useNavStore((s) => s.profileId);
	const go = useNavStore((s) => s.go);
	const tabs = useNavStore((s) => s.tabs);
	const activeTabId = useNavStore((s) => s.activeTabId);
	const tab = tabs.find((item) => item.id === activeTabId) ?? tabs[0];
	const bucket = tab.stack[tab.index].bucket;
	const { data: profiles = [] } = useQuery({
		queryKey: queryKeys.profiles,
		queryFn: api.listProfiles,
	});
	const profile = profiles.find((p) => p.id === profileId);
	const admin = profile?.capability === 'admin';
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
			<div className="flex h-full items-center justify-center p-8">
				<Card className="max-w-md">
					<CardHeader>
						<CardTitle>{t('nav.settings')}</CardTitle>
						<CardDescription>{t('profile.needAdmin')}</CardDescription>
					</CardHeader>
				</Card>
			</div>
		);
	}

	const devParsed = parseDevUrl(dev.data);
	const domainList = parseDomains(domains.data);
	const metricsList = metricEntries(metrics.data);
	const lockOn = parseLockEnabled(lock.data);

	return (
		<div className="h-full overflow-auto">
			<div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
				<div>
					<h1 className="text-lg font-semibold">{t('nav.settings')}</h1>
					<p className="text-sm text-muted-foreground">{bucket || t('browser.selectBucket')}</p>
				</div>

				<Card>
					<CardHeader>
						<CardTitle>{t('control.createBucket')}</CardTitle>
						<CardDescription>{t('control.createBucketDesc')}</CardDescription>
					</CardHeader>
					<CardContent className="flex gap-2">
						<Input
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
					</CardContent>
				</Card>

				{bucket ? (
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
				) : null}

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
									<div key={key}>
										<dt className="text-xs text-muted-foreground">{key}</dt>
										<dd className="text-sm font-medium">{value}</dd>
									</div>
								))}
							</dl>
						)}
					</CardContent>
				</Card>

				{bucket ? (
					<>
						<Card>
							<CardHeader>
								<CardTitle>{t('control.devUrl')}</CardTitle>
								<CardDescription>{t('control.devUrlDesc')}</CardDescription>
							</CardHeader>
							<CardContent className="space-y-3">
								<div className="flex items-center justify-between gap-3">
									<Label htmlFor="dev-url">
										{devParsed.enabled ? t('common.enabled') : t('common.disabled')}
									</Label>
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
								</div>
								{devParsed.url ? (
									<p className="text-sm">
										<span className="text-muted-foreground">{t('control.currentUrl')}: </span>
										{devParsed.url}
									</p>
								) : null}
							</CardContent>
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
									<ul className="space-y-1 text-sm">
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
							<CardContent className="space-y-4">
								{corsRules.map((rule, i) => (
									<div key={rule.id} className="space-y-2 rounded-lg border p-3">
										<div className="grid gap-2">
											<Label>{t('control.origins')}</Label>
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
										</div>
										<div className="grid gap-2">
											<Label>{t('control.methods')}</Label>
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
										</div>
										<div className="grid gap-2">
											<Label>{t('control.headers')}</Label>
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
										</div>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => setCorsRules((list) => list.filter((_, idx) => idx !== i))}
										>
											{t('control.removeRule')}
										</Button>
									</div>
								))}
								<div className="flex gap-2">
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
								</div>
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

						<Card>
							<CardHeader>
								<CardTitle>{t('control.lifecycle')}</CardTitle>
								<CardDescription>{t('control.lifecycleDesc')}</CardDescription>
							</CardHeader>
							<CardContent className="space-y-4">
								{lifeRules.map((rule, i) => (
									<div
										key={rule.id || i}
										className="grid grid-cols-[1fr_100px_auto] items-end gap-2"
									>
										<div className="grid gap-1.5">
											<Label>{t('control.prefix')}</Label>
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
										</div>
										<div className="grid gap-1.5">
											<Label>{t('control.days')}</Label>
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
										</div>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => setLifeRules((list) => list.filter((_, idx) => idx !== i))}
										>
											{t('control.removeRule')}
										</Button>
									</div>
								))}
								<div className="flex gap-2">
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
								</div>
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
							</CardHeader>
							<CardContent className="space-y-3">
								<div className="flex items-center justify-between gap-3">
									<Label htmlFor="lock-switch">
										{lockOn ? t('common.enabled') : t('common.disabled')}
									</Label>
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
								</div>
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
							<CardContent>
								<pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs">
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

						<Card>
							<CardHeader>
								<CardTitle>{t('control.multipart')}</CardTitle>
								<CardDescription>{t('control.multipartDesc')}</CardDescription>
							</CardHeader>
							<CardContent>
								{(multipart.data ?? []).length === 0 ? (
									<p className="text-sm text-muted-foreground">{t('control.noUploads')}</p>
								) : (
									<div className="space-y-2">
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
					</>
				) : null}
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
