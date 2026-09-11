import { useQuery } from '@tanstack/react-query';
import { HardDrive, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { CreateBucketDialog } from '@/features/control/create-bucket-dialog';
import { cn } from '@/lib/utils';
import { api } from '@/shared/api/backend';
import { queryKeys } from '@/shared/config/query-keys';
import { useCurrentLocation, useNavStore } from '@/store/nav';
import { CapabilityBadge } from '@/widgets/capability-badge';
import { ProfileSwitcher } from '@/widgets/profile-switcher';

export function BucketSidebar({ onAdd, onManage }: { onAdd: () => void; onManage: () => void }) {
	const { t } = useTranslation();
	const profileId = useNavStore((s) => s.profileId);
	const go = useNavStore((s) => s.go);
	const loc = useCurrentLocation();
	const bucket = loc.bucket;
	const [filter, setFilter] = useState('');
	const [createOpen, setCreateOpen] = useState(false);

	const { data: profiles = [] } = useQuery({
		queryKey: queryKeys.profiles,
		queryFn: api.listProfiles,
	});
	const profile = profiles.find((p) => p.id === profileId);
	const admin = profile?.capability === 'admin';

	const buckets = useQuery({
		queryKey: queryKeys.buckets(profileId ?? ''),
		queryFn: () => api.listBuckets(profileId ?? ''),
		enabled: Boolean(profileId) && profile?.capability !== 'invalid',
	});

	const filtered = useMemo(() => {
		const q = filter.toLowerCase();
		return (buckets.data ?? []).filter((b) => !q || b.name.toLowerCase().includes(q));
	}, [buckets.data, filter]);

	return (
		<div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
			<div className="flex flex-col gap-2 p-3">
				<ProfileSwitcher onAdd={onAdd} onManage={onManage} />
				{profile && profile.capability !== 'admin' ? (
					<CapabilityBadge capability={profile.capability} />
				) : null}
				<InputGroup className="h-8">
					<InputGroupAddon>
						<Search />
					</InputGroupAddon>
					<InputGroupInput
						placeholder={t('browser.searchBuckets')}
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
					/>
				</InputGroup>
			</div>
			{profile?.capability === 'object' ? (
				<p className="px-3 pb-2 text-xs text-muted-foreground">{t('profile.needAdmin')}</p>
			) : null}
			{profile?.capability === 'invalid' ? (
				<div className="px-3 pb-2">
					<Alert variant="destructive">
						<AlertTitle>{t('profile.invalidTitle')}</AlertTitle>
						<AlertDescription>{t('profile.invalidHint')}</AlertDescription>
					</Alert>
					<Button size="sm" variant="outline" className="mt-2 w-full" onClick={onManage}>
						{t('profile.manage')}
					</Button>
				</div>
			) : null}
			<ScrollArea className="min-h-0 flex-1">
				<div className="flex flex-col gap-0.5 px-2 pb-2">
					{buckets.isLoading
						? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)
						: null}
					{filtered.map((b) => (
						<button
							key={b.name}
							type="button"
							className={cn(
								'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
								bucket === b.name
									? 'bg-sidebar-accent text-foreground'
									: 'hover:bg-sidebar-accent/70',
							)}
							onClick={() => go({ bucket: b.name, prefix: '' })}
						>
							<HardDrive className="size-3.5 shrink-0 text-muted-foreground" />
							<span className="truncate">{b.name}</span>
						</button>
					))}
					{!buckets.isLoading && filtered.length === 0 ? (
						<Empty className="border-0 py-8 md:p-4">
							<EmptyHeader>
								<EmptyTitle>{t('common.empty')}</EmptyTitle>
								<EmptyDescription>{t('browser.selectBucketBody')}</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : null}
				</div>
			</ScrollArea>
			{admin ? (
				<div className="border-t p-3">
					<Button
						className="w-full"
						size="sm"
						variant="outline"
						onClick={() => setCreateOpen(true)}
					>
						<Plus data-icon="inline-start" />
						{t('control.createBucket')}
					</Button>
				</div>
			) : null}
			{profile ? (
				<CreateBucketDialog open={createOpen} onOpenChange={setCreateOpen} profile={profile} />
			) : null}
		</div>
	);
}
