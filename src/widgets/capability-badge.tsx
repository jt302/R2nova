import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { TokenCapability } from '@/entities/profile/types';

export function CapabilityBadge({ capability }: { capability: TokenCapability }) {
	const { t } = useTranslation();
	const variant =
		capability === 'invalid' ? 'destructive' : capability === 'admin' ? 'default' : 'secondary';
	return <Badge variant={variant}>{t(`profile.capability.${capability}`)}</Badge>;
}
