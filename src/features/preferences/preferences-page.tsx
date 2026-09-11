import { useQuery } from '@tanstack/react-query';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Minus, Monitor, Moon, Plus, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldGroup,
	FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { api } from '@/shared/api/backend';
import { queryKeys } from '@/shared/config/query-keys';
import { modKeyLabel } from '@/shared/lib/mod-key';
import {
	TRANSFER_CONCURRENCY_MAX,
	TRANSFER_CONCURRENCY_MIN,
	ZOOM_DEFAULT,
} from '@/shared/lib/prefs';
import { useNavStore } from '@/store/nav';
import { AboutDialog, checkAvailableUpdate, REPO_LABEL, REPO_URL } from '@/widgets/about-dialog';
import { PageHeader } from '@/widgets/page-header';

export function PreferencesPage() {
	const { t } = useTranslation();
	const theme = useNavStore((s) => s.theme);
	const setTheme = useNavStore((s) => s.setTheme);
	const language = useNavStore((s) => s.language);
	const setLanguage = useNavStore((s) => s.setLanguage);
	const zoom = useNavStore((s) => s.zoom);
	const zoomIn = useNavStore((s) => s.zoomIn);
	const zoomOut = useNavStore((s) => s.zoomOut);
	const resetZoom = useNavStore((s) => s.resetZoom);
	const downloadDir = useNavStore((s) => s.downloadDir);
	const setDownloadDir = useNavStore((s) => s.setDownloadDir);
	const transferConcurrency = useNavStore((s) => s.transferConcurrency);
	const setTransferConcurrency = useNavStore((s) => s.setTransferConcurrency);
	const { data: version } = useQuery({ queryKey: queryKeys.version, queryFn: api.appVersion });
	const { data: latest, isFetching } = useQuery({
		queryKey: queryKeys.appUpdate,
		queryFn: checkAvailableUpdate,
		retry: false,
		staleTime: 60_000,
	});
	const updateStatus = isFetching
		? t('about.checking')
		: latest
			? t('about.updateAvailable', { version: latest })
			: t('about.upToDate');
	const mod = modKeyLabel();

	async function pickDownloadDir() {
		const picked = await openDialog({ directory: true, multiple: false });
		const dir = Array.isArray(picked) ? picked[0] : picked;
		if (typeof dir === 'string' && dir) {
			setDownloadDir(dir);
		}
	}

	return (
		<div className="h-full min-h-0 w-full flex-1 overflow-y-auto scrollbar-gutter-stable">
			<div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8">
				<PageHeader title={t('preferences.title')} description={t('preferences.description')} />

				<Card>
					<CardHeader>
						<CardTitle>{t('preferences.appearance')}</CardTitle>
					</CardHeader>
					<CardContent>
						<FieldGroup className="gap-5">
							<Field orientation="horizontal">
								<FieldContent>
									<FieldTitle>{t('preferences.theme')}</FieldTitle>
								</FieldContent>
								<ToggleGroup
									type="single"
									variant="outline"
									size="sm"
									value={theme}
									onValueChange={(value) => {
										if (value === 'light' || value === 'dark' || value === 'system') {
											setTheme(value);
										}
									}}
								>
									<ToggleGroupItem value="light" aria-label={t('command.themeLight')}>
										<Sun />
										{t('command.themeLight')}
									</ToggleGroupItem>
									<ToggleGroupItem value="dark" aria-label={t('command.themeDark')}>
										<Moon />
										{t('command.themeDark')}
									</ToggleGroupItem>
									<ToggleGroupItem value="system" aria-label={t('command.themeSystem')}>
										<Monitor />
										{t('command.themeSystem')}
									</ToggleGroupItem>
								</ToggleGroup>
							</Field>
							<Field orientation="horizontal">
								<FieldContent>
									<FieldTitle>{t('preferences.language')}</FieldTitle>
								</FieldContent>
								<ToggleGroup
									type="single"
									variant="outline"
									size="sm"
									value={language}
									onValueChange={(value) => {
										if (value === 'zh-CN' || value === 'en-US') {
											setLanguage(value);
										}
									}}
								>
									<ToggleGroupItem value="zh-CN">{t('command.languageZh')}</ToggleGroupItem>
									<ToggleGroupItem value="en-US">{t('command.languageEn')}</ToggleGroupItem>
								</ToggleGroup>
							</Field>
							<Field orientation="horizontal">
								<FieldContent>
									<FieldTitle>{t('preferences.zoom')}</FieldTitle>
									<FieldDescription>{t('preferences.zoomDesc', { mod })}</FieldDescription>
								</FieldContent>
								<div className="flex flex-wrap items-center justify-end gap-2">
									<Button
										variant="outline"
										size="icon-sm"
										aria-label={t('command.zoomOut')}
										onClick={zoomOut}
									>
										<Minus />
									</Button>
									<span className="w-12 text-center text-sm tabular-nums">
										{Math.round(zoom * 100)}%
									</span>
									<Button
										variant="outline"
										size="icon-sm"
										aria-label={t('command.zoomIn')}
										onClick={zoomIn}
									>
										<Plus />
									</Button>
									<Button
										variant="ghost"
										size="sm"
										disabled={zoom === ZOOM_DEFAULT}
										onClick={resetZoom}
									>
										{t('preferences.reset')}
									</Button>
									<KbdGroup>
										<Kbd>{mod}</Kbd>
										<Kbd>=</Kbd>
										<Kbd>-</Kbd>
										<Kbd>0</Kbd>
									</KbdGroup>
								</div>
							</Field>
						</FieldGroup>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{t('preferences.transfers')}</CardTitle>
					</CardHeader>
					<CardContent>
						<FieldGroup className="gap-5">
							<Field orientation="horizontal">
								<FieldContent className="min-w-0">
									<FieldTitle>{t('preferences.downloadDir')}</FieldTitle>
									<FieldDescription>
										{downloadDir ? (
											<span className="block truncate font-mono select-text" title={downloadDir}>
												{downloadDir}
											</span>
										) : (
											t('preferences.downloadDirDesc')
										)}
									</FieldDescription>
								</FieldContent>
								<Button variant="outline" size="sm" onClick={() => void pickDownloadDir()}>
									{downloadDir ? t('transfer.downloadDirSet') : t('preferences.choose')}
								</Button>
							</Field>
							<Field orientation="horizontal">
								<FieldContent>
									<FieldTitle>{t('preferences.concurrency')}</FieldTitle>
									<FieldDescription>{t('preferences.concurrencyDesc')}</FieldDescription>
								</FieldContent>
								<Input
									type="number"
									min={TRANSFER_CONCURRENCY_MIN}
									max={TRANSFER_CONCURRENCY_MAX}
									className="h-8 w-16 px-2 text-center"
									value={transferConcurrency}
									onChange={(e) => setTransferConcurrency(Number(e.target.value))}
								/>
							</Field>
						</FieldGroup>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{t('preferences.about')}</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 text-sm">
							<dt className="text-muted-foreground">{t('about.version')}</dt>
							<dd className="tabular-nums">
								{version ? `v${version}` : t('common.loading')}
								<span className="mt-0.5 block text-xs text-muted-foreground">{updateStatus}</span>
							</dd>
							<dt className="text-muted-foreground">{t('about.repository')}</dt>
							<dd>
								<Button
									variant="link"
									className="h-auto p-0"
									onClick={() => void openUrl(REPO_URL)}
								>
									{REPO_LABEL}
								</Button>
							</dd>
						</dl>
						<AboutDialog
							trigger={
								<Button variant="outline" size="sm">
									{t('preferences.openAbout')}
								</Button>
							}
						/>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
