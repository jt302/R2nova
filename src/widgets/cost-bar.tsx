import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { api } from '@/shared/api/backend';
import { queryKeys } from '@/shared/config/query-keys';

export function CostBar() {
	const { t } = useTranslation();
	const { data, refetch } = useQuery({
		queryKey: queryKeys.cost,
		queryFn: api.costSnapshot,
		refetchInterval: 4000,
	});
	return (
		<div className="flex items-center gap-3 text-xs text-muted-foreground">
			<span>
				{t('cost.classA')}: {data?.classA ?? 0}
			</span>
			<span>
				{t('cost.classB')}: {data?.classB ?? 0}
			</span>
			<span>
				{t('cost.free')}: {data?.free ?? 0}
			</span>
			<Button
				variant="ghost"
				size="xs"
				onClick={async () => {
					await api.costReset();
					void refetch();
				}}
			>
				{t('cost.reset')}
			</Button>
		</div>
	);
}
