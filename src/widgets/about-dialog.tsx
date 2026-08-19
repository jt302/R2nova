import { openUrl } from '@tauri-apps/plugin-opener';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const REPO_URL = 'https://github.com/jt302/R2nova';
const REPO_LABEL = 'github.com/jt302/R2nova';

export function AboutDialog({ version, latest }: { version?: string; latest?: string | null }) {
	const { t } = useTranslation();
	if (!version) {
		return null;
	}
	const hasUpdate = Boolean(latest && latest !== version);

	return (
		<Dialog>
			<Tooltip>
				<TooltipTrigger asChild>
					<DialogTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							className="h-8 px-2 text-xs tabular-nums text-muted-foreground"
							aria-label={t('about.title')}
						>
							v{version}
						</Button>
					</DialogTrigger>
				</TooltipTrigger>
				<TooltipContent>{t('about.title')}</TooltipContent>
			</Tooltip>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>{t('app.name')}</DialogTitle>
					<DialogDescription>{t('app.tagline')}</DialogDescription>
				</DialogHeader>
				<dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 text-sm">
					<dt className="text-muted-foreground">{t('about.version')}</dt>
					<dd className="tabular-nums">
						v{version}
						<span className="mt-0.5 block text-xs text-muted-foreground">
							{hasUpdate ? t('app.updateAvailable', { version: latest }) : t('about.upToDate')}
						</span>
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
				<DialogFooter>
					<DialogClose asChild>
						<Button variant="outline">{t('common.close')}</Button>
					</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
