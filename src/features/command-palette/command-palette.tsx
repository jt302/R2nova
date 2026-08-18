import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from '@/components/ui/command';
import { api } from '@/shared/api/backend';
import { queryKeys } from '@/shared/config/query-keys';
import { useNavStore } from '@/store/nav';

export function CommandPalette({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { t, i18n } = useTranslation();
	const profileId = useNavStore((s) => s.profileId);
	const go = useNavStore((s) => s.go);
	const newTab = useNavStore((s) => s.newTab);
	const setTheme = useNavStore((s) => s.setTheme);
	const { data: buckets = [] } = useQuery({
		queryKey: queryKeys.buckets(profileId ?? ''),
		queryFn: () => api.listBuckets(profileId ?? ''),
		enabled: Boolean(profileId) && open,
	});

	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title={t('command.title')}
			description={t('command.placeholder')}
		>
			<CommandInput placeholder={t('command.placeholder')} />
			<CommandList>
				<CommandEmpty>{t('common.empty')}</CommandEmpty>
				<CommandGroup heading={t('nav.buckets')}>
					{buckets.map((b) => (
						<CommandItem
							key={b.name}
							value={b.name}
							onSelect={() => {
								go({ bucket: b.name, prefix: '' });
								onOpenChange(false);
							}}
						>
							{b.name}
						</CommandItem>
					))}
				</CommandGroup>
				<CommandGroup heading={t('nav.settings')}>
					<CommandItem
						value="new-tab"
						onSelect={() => {
							newTab();
							onOpenChange(false);
						}}
					>
						{t('command.newTab')}
					</CommandItem>
					<CommandItem
						value="dark"
						onSelect={() => {
							setTheme('dark');
							onOpenChange(false);
						}}
					>
						{t('command.themeDark')}
					</CommandItem>
					<CommandItem
						value="light"
						onSelect={() => {
							setTheme('light');
							onOpenChange(false);
						}}
					>
						{t('command.themeLight')}
					</CommandItem>
					<CommandItem
						value="language"
						onSelect={() => {
							void i18n.changeLanguage(i18n.language.startsWith('zh') ? 'en-US' : 'zh-CN');
							onOpenChange(false);
						}}
					>
						{t('command.language')}
					</CommandItem>
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	);
}
