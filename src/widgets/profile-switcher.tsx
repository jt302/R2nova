import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { api } from '@/shared/api/backend';
import { queryKeys } from '@/shared/config/query-keys';
import { useNavStore } from '@/store/nav';

export function ProfileSwitcher() {
	const { t } = useTranslation();
	const profileId = useNavStore((s) => s.profileId);
	const setProfileId = useNavStore((s) => s.setProfileId);
	const { data: profiles = [] } = useQuery({
		queryKey: queryKeys.profiles,
		queryFn: api.listProfiles,
	});

	return (
		<Select
			value={profileId ?? '__none'}
			onValueChange={(value) => setProfileId(value === '__none' ? null : value)}
		>
			<SelectTrigger size="sm" className="h-8 max-w-56 min-w-40">
				<SelectValue placeholder={t('profile.title')} />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="__none">{t('profile.title')}</SelectItem>
				{profiles.map((p) => (
					<SelectItem key={p.id} value={p.id}>
						{p.name} ({t(`profile.capability.${p.capability}`)})
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
