import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
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
	const estimated = data?.estimatedUsd ?? 0;

	return (
		<div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
			<span className="text-muted-foreground">{t('cost.session')}</span>
			<Badge variant="outline">
				{t('cost.classA')} {data?.classA ?? 0}
			</Badge>
			<Badge variant="secondary">
				{t('cost.classB')} {data?.classB ?? 0}
			</Badge>
			<Badge variant="outline">
				{t('cost.free')} {data?.free ?? 0}
			</Badge>
			{estimated > 0 ? (
				<span className="tabular-nums text-muted-foreground">
					{t('cost.estimated', { amount: estimated.toFixed(4) })}
				</span>
			) : null}
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
