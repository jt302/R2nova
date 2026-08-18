import { useQuery } from '@tanstack/react-query';
import { convertFileSrc } from '@tauri-apps/api/core';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { api } from '@/shared/api/backend';
import { queryKeys } from '@/shared/config/query-keys';
import { fileKind } from '@/shared/lib/object-key';
import { useNavStore } from '@/store/nav';

export function PreviewPane({ objectKey, onClose }: { objectKey: string; onClose: () => void }) {
	const { t } = useTranslation();
	const profileId = useNavStore((s) => s.profileId);
	const tabs = useNavStore((s) => s.tabs);
	const activeTabId = useNavStore((s) => s.activeTabId);
	const tab = tabs.find((item) => item.id === activeTabId) ?? tabs[0];
	const bucket = tab.stack[tab.index].bucket;
	const kind = fileKind(objectKey);
	const name = objectKey.split('/').pop() ?? objectKey;
	const [html, setHtml] = useState('');
	const [text, setText] = useState('');
	const [expires, setExpires] = useState('3600');

	const preview = useQuery({
		queryKey: ['preview', profileId, bucket, objectKey],
		enabled: Boolean(profileId && bucket && objectKey),
		queryFn: () => api.previewObject({ profileId: profileId ?? '', bucket, key: objectKey }),
	});

	const detail = useQuery({
		queryKey: queryKeys.object(profileId ?? '', bucket, objectKey),
		enabled: Boolean(profileId && bucket && objectKey),
		queryFn: () => api.headObject({ profileId: profileId ?? '', bucket, key: objectKey }),
	});

	const src = preview.data ? convertFileSrc(preview.data) : '';

	useEffect(() => {
		if (!preview.data || (kind !== 'text' && kind !== 'markdown')) {
			return;
		}
		void (async () => {
			const res = await fetch(src);
			const body = await res.text();
			if (kind === 'markdown') {
				setText(body);
				return;
			}
			const { codeToHtml } = await import('shiki');
			const highlighted = await codeToHtml(body.slice(0, 200_000), {
				lang: objectKey.split('.').pop() ?? 'txt',
				theme: 'github-dark',
			});
			setHtml(highlighted);
		})();
	}, [preview.data, kind, src, objectKey]);

	return (
		<div className="flex h-full min-h-0 flex-col bg-card">
			<div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-medium">{name}</p>
					<Badge variant="secondary" className="mt-0.5">
						{kind}
					</Badge>
				</div>
				<Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('common.close')}>
					<X />
				</Button>
			</div>
			<div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-4">
				{kind === 'image' && src ? (
					<img src={src} alt="" className="max-h-full max-w-full object-contain" />
				) : null}
				{kind === 'video' && src ? (
					<video src={src} controls className="max-h-full w-full">
						<track kind="captions" />
					</video>
				) : null}
				{kind === 'pdf' && src ? (
					<iframe title="pdf" src={src} className="h-full min-h-80 w-full border-0" />
				) : null}
				{kind === 'markdown' ? (
					<div className="prose prose-sm w-full dark:prose-invert">
						<Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
					</div>
				) : null}
				{kind === 'text' ? (
					// biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki highlighter output
					<div className="w-full text-xs" dangerouslySetInnerHTML={{ __html: html }} />
				) : null}
				{kind === 'other' ? (
					<p className="text-sm text-muted-foreground">{detail.data?.contentType}</p>
				) : null}
			</div>
			<div className="space-y-3 border-t p-4">
				<div className="grid gap-1.5">
					<Label>{t('preview.expires')}</Label>
					<div className="flex gap-2">
						<Select value={expires} onValueChange={setExpires}>
							<SelectTrigger className="flex-1">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="3600">{t('preview.hour')}</SelectItem>
								<SelectItem value="86400">{t('preview.day')}</SelectItem>
								<SelectItem value="604800">{t('preview.week')}</SelectItem>
							</SelectContent>
						</Select>
						<Button
							variant="outline"
							onClick={async () => {
								if (!profileId) {
									return;
								}
								const res = await api.presignGet({
									profileId,
									bucket,
									key: objectKey,
									expiresInSecs: Number(expires),
								});
								await navigator.clipboard.writeText(res.url);
								toast.success(t('preview.copied'));
							}}
						>
							{t('common.share')}
						</Button>
					</div>
				</div>
				{detail.data?.metadata?.length ? (
					<pre className="max-h-24 overflow-auto rounded-md bg-muted p-2 text-xs">
						{JSON.stringify(detail.data.metadata, null, 2)}
					</pre>
				) : null}
			</div>
		</div>
	);
}
