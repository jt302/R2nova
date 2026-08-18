import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HardDrive, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { api } from '@/shared/api/backend';
import { isAppError } from '@/shared/api/tauri-invoke';
import { queryKeys } from '@/shared/config/query-keys';
import { useNavStore } from '@/store/nav';

export function BucketSidebar({ onManage }: { onManage: () => void }) {
	const { t } = useTranslation();
	const qc = useQueryClient();
	const profileId = useNavStore((s) => s.profileId);
	const go = useNavStore((s) => s.go);
	const tabs = useNavStore((s) => s.tabs);
	const activeTabId = useNavStore((s) => s.activeTabId);
	const tab = tabs.find((item) => item.id === activeTabId) ?? tabs[0];
	const bucket = tab.stack[tab.index].bucket;
	const [filter, setFilter] = useState('');
	const [createOpen, setCreateOpen] = useState(false);
	const [newName, setNewName] = useState('');

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

	const create = useMutation({
		mutationFn: () => api.cfCreateBucket(profileId ?? '', newName.trim()),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: queryKeys.buckets(profileId ?? '') });
			go({ bucket: newName.trim(), prefix: '' });
			toast.success(t('control.createBucket'));
			setCreateOpen(false);
			setNewName('');
		},
		onError: (err) => toast.error(isAppError(err) ? err.message : String(err)),
	});

	return (
		<div className="flex h-full min-h-0 flex-col bg-card">
			<div className="flex items-center justify-between px-3 pt-3 pb-2">
				<span className="text-sm font-medium">{t('nav.buckets')}</span>
				{profile && profile.capability !== 'admin' ? (
					<Badge variant="secondary">{t(`profile.capability.${profile.capability}`)}</Badge>
				) : null}
			</div>
			<div className="px-3 pb-2">
				<div className="relative">
					<Search className="pointer-events-none absolute top-2.5 left-2 size-3.5 text-muted-foreground" />
					<Input
						className="h-8 pl-7"
						placeholder={t('browser.searchBuckets')}
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
					/>
				</div>
			</div>
			{profile?.capability === 'object' ? (
				<p className="px-3 pb-2 text-xs text-muted-foreground">{t('profile.needAdmin')}</p>
			) : null}
			{profile?.capability === 'invalid' ? (
				<div className="space-y-2 px-3 pb-2">
					<p className="text-xs text-muted-foreground">{t('profile.invalidHint')}</p>
					<Button size="sm" variant="outline" className="w-full" onClick={onManage}>
						{t('profile.manage')}
					</Button>
				</div>
			) : null}
			<ScrollArea className="min-h-0 flex-1">
				<div className="px-2 pb-2">
					{filtered.map((b) => (
						<button
							key={b.name}
							type="button"
							className={cn(
								'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
								bucket === b.name ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/70',
							)}
							onClick={() => go({ bucket: b.name, prefix: '' })}
						>
							<HardDrive className="size-3.5 shrink-0 text-muted-foreground" />
							<span className="truncate">{b.name}</span>
						</button>
					))}
					{buckets.isLoading ? (
						<p className="px-2 py-6 text-center text-xs text-muted-foreground">
							{t('common.loading')}
						</p>
					) : null}
					{!buckets.isLoading && filtered.length === 0 ? (
						<p className="px-2 py-6 text-center text-xs text-muted-foreground">
							{t('common.empty')}
						</p>
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
						<Plus />
						{t('control.createBucket')}
					</Button>
				</div>
			) : null}
			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('control.createBucket')}</DialogTitle>
						<DialogDescription>{t('control.createBucketDesc')}</DialogDescription>
					</DialogHeader>
					<div className="grid gap-1.5">
						<Label htmlFor="new-bucket">{t('control.bucketName')}</Label>
						<Input
							id="new-bucket"
							value={newName}
							onChange={(e) => setNewName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && newName.trim()) {
									create.mutate();
								}
							}}
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setCreateOpen(false)}>
							{t('common.cancel')}
						</Button>
						<Button disabled={!newName.trim() || create.isPending} onClick={() => create.mutate()}>
							{t('common.save')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
