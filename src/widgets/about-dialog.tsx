import { useQuery } from '@tanstack/react-query';
import { openUrl } from '@tauri-apps/plugin-opener';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api } from '@/shared/api/backend';
import { queryKeys } from '@/shared/config/query-keys';

const REPO_URL = 'https://github.com/jt302/R2nova';
const REPO_LABEL = 'github.com/jt302/R2nova';

async function checkAvailableUpdate(): Promise<string | null> {
	const update = await check();
	return update?.version ?? null;
}

export function AboutDialog() {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const [error, setError] = useState(false);
	const [installing, setInstalling] = useState(false);
	const [progress, setProgress] = useState(0);
	const { data: version } = useQuery({ queryKey: queryKeys.version, queryFn: api.appVersion });
	const {
		data: latest,
		isFetching,
		refetch,
	} = useQuery({
		queryKey: queryKeys.appUpdate,
		queryFn: checkAvailableUpdate,
		retry: false,
		staleTime: 60_000,
	});

	if (!version) {
		return null;
	}

	const hasUpdate = Boolean(latest);
	const tooltip = hasUpdate ? t('about.updateAvailable', { version: latest }) : t('about.title');
	const status = installing
		? t('about.downloading')
		: isFetching
			? t('about.checking')
			: error
				? t('about.updateFailed')
				: hasUpdate
					? t('about.updateAvailable', { version: latest })
					: t('about.upToDate');

	async function onCheck() {
		setError(false);
		const result = await refetch();
		if (result.isError) {
			setError(true);
		}
	}

	async function onUpdate() {
		setError(false);
		setInstalling(true);
		setProgress(0);
		try {
			const update = await check();
			if (!update) {
				await refetch();
				setInstalling(false);
				return;
			}
			let downloaded = 0;
			let contentLength = 0;
			await update.downloadAndInstall((event) => {
				switch (event.event) {
					case 'Started':
						contentLength = event.data.contentLength ?? 0;
						break;
					case 'Progress':
						downloaded += event.data.chunkLength;
						if (contentLength > 0) {
							setProgress(Math.round((downloaded / contentLength) * 100));
						}
						break;
					case 'Finished':
						setProgress(100);
						break;
				}
			});
			await relaunch();
		} catch {
			setError(true);
			setInstalling(false);
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (installing && !next) {
					return;
				}
				setOpen(next);
				if (!next) {
					setError(false);
				}
			}}
		>
			<Tooltip>
				<TooltipTrigger asChild>
					<DialogTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							className="relative h-8 px-2 text-xs tabular-nums text-muted-foreground"
							aria-label={tooltip}
						>
							v{version}
							{hasUpdate ? (
								<span
									className="absolute top-1.5 right-1 size-1.5 rounded-full bg-primary"
									aria-hidden
								/>
							) : null}
						</Button>
					</DialogTrigger>
				</TooltipTrigger>
				<TooltipContent>{tooltip}</TooltipContent>
			</Tooltip>
			<DialogContent
				className="sm:max-w-sm"
				showCloseButton={!installing}
				onPointerDownOutside={(e) => {
					if (installing) {
						e.preventDefault();
					}
				}}
				onEscapeKeyDown={(e) => {
					if (installing) {
						e.preventDefault();
					}
				}}
			>
				<DialogHeader>
					<DialogTitle>{t('app.name')}</DialogTitle>
					<DialogDescription>{t('app.tagline')}</DialogDescription>
				</DialogHeader>
				<dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 text-sm">
					<dt className="text-muted-foreground">{t('about.version')}</dt>
					<dd className="tabular-nums">
						v{version}
						<span className="mt-0.5 block text-xs text-muted-foreground">{status}</span>
					</dd>
					<dt className="text-muted-foreground">{t('about.repository')}</dt>
					<dd>
						<Button variant="link" className="h-auto p-0" onClick={() => void openUrl(REPO_URL)}>
							{REPO_LABEL}
						</Button>
					</dd>
					<dt className="text-muted-foreground">{t('about.license')}</dt>
					<dd>MIT</dd>
				</dl>
				{installing ? <Progress value={progress} /> : null}
				<DialogFooter>
					<Button
						variant="outline"
						disabled={installing || isFetching}
						onClick={() => void onCheck()}
					>
						{isFetching ? t('about.checking') : t('about.checkForUpdates')}
					</Button>
					{hasUpdate ? (
						<Button disabled={installing} onClick={() => void onUpdate()}>
							{t('about.updateAndRestart')}
						</Button>
					) : null}
					<DialogClose asChild>
						<Button variant="outline" disabled={installing}>
							{t('common.close')}
						</Button>
					</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
