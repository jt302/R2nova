import { useQuery } from '@tanstack/react-query';
import {
	FolderOpen,
	HardDrive,
	Languages,
	Monitor,
	Moon,
	Plus,
	SlidersHorizontal,
	Sun,
	Users,
} from 'lucide-react';
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
	onTransfers,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onTransfers?: () => void;
}) {
	const { t } = useTranslation();
	const profileId = useNavStore((s) => s.profileId);
	const go = useNavStore((s) => s.go);
	const newTab = useNavStore((s) => s.newTab);
	const setTheme = useNavStore((s) => s.setTheme);
	const setLanguage = useNavStore((s) => s.setLanguage);
	const setMainView = useNavStore((s) => s.setMainView);
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
								setMainView('objects');
								onOpenChange(false);
							}}
						>
							<HardDrive />
							{b.name}
						</CommandItem>
					))}
				</CommandGroup>
				<CommandGroup heading={t('nav.settings')}>
					<CommandItem
						value="objects"
						onSelect={() => {
							setMainView('objects');
							onOpenChange(false);
						}}
					>
						<FolderOpen />
						{t('command.objects')}
					</CommandItem>
					<CommandItem
						value="settings"
						onSelect={() => {
							setMainView('settings');
							onOpenChange(false);
						}}
					>
						<SlidersHorizontal />
						{t('command.settings')}
					</CommandItem>
					<CommandItem
						value="accounts"
						onSelect={() => {
							setMainView('accounts');
							onOpenChange(false);
						}}
					>
						<Users />
						{t('command.accounts')}
					</CommandItem>
					<CommandItem
						value="transfers"
						onSelect={() => {
							onTransfers?.();
							onOpenChange(false);
						}}
					>
						{t('command.transfers')}
					</CommandItem>
					<CommandItem
						value="new-tab"
						onSelect={() => {
							newTab();
							onOpenChange(false);
						}}
					>
						<Plus />
						{t('command.newTab')}
					</CommandItem>
					<CommandItem
						value="dark"
						onSelect={() => {
							setTheme('dark');
							onOpenChange(false);
						}}
					>
						<Moon />
						{t('command.themeDark')}
					</CommandItem>
					<CommandItem
						value="light"
						onSelect={() => {
							setTheme('light');
							onOpenChange(false);
						}}
					>
						<Sun />
						{t('command.themeLight')}
					</CommandItem>
					<CommandItem
						value="system"
						onSelect={() => {
							setTheme('system');
							onOpenChange(false);
						}}
					>
						<Monitor />
						{t('command.themeSystem')}
					</CommandItem>
					<CommandItem
						value="language-zh"
						onSelect={() => {
							setLanguage('zh-CN');
							onOpenChange(false);
						}}
					>
						<Languages />
						{t('command.languageZh')}
					</CommandItem>
					<CommandItem
						value="language-en"
						onSelect={() => {
							setLanguage('en-US');
							onOpenChange(false);
						}}
					>
						<Languages />
						{t('command.languageEn')}
					</CommandItem>
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	);
}
