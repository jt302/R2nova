// biome-ignore-all lint/security/noDangerouslySetInnerHtml: Shiki highlighter output
import { useQuery } from '@tanstack/react-query';
import { convertFileSrc } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { FileQuestion, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { api } from '@/shared/api/backend';
import { isAppError } from '@/shared/api/tauri-invoke';
import { queryKeys } from '@/shared/config/query-keys';
import { fileKind, formatBytes, formatModified } from '@/shared/lib/object-key';
import type { PreviewTarget } from '@/shared/lib/preview';

function extOf(key: string): string {
	return key.split('.').pop()?.toLowerCase() ?? '';
}

function isRemoteMedia(kind: ReturnType<typeof fileKind>, key: string): boolean {
	if (kind === 'video' || kind === 'pdf') {
		return true;
	}
	return kind === 'image' && extOf(key) !== 'svg';
}

function isTextKind(kind: ReturnType<typeof fileKind>): boolean {
	return kind === 'text' || kind === 'markdown';
}

function HighlightedCode({ html }: { html: string }) {
	return (
		<div className="min-h-0 min-w-0 w-full flex-1 overflow-hidden">
			<div
				className="h-full w-full max-w-full overflow-auto p-3 select-text [&_pre]:m-0 [&_pre]:max-w-full [&_pre]:min-h-full [&_pre]:rounded-md [&_pre]:p-4 [&_pre]:text-xs [&_pre]:leading-relaxed [&_pre]:whitespace-pre-wrap [&_pre]:break-all [&_code]:max-w-full [&_code]:whitespace-pre-wrap [&_code]:break-all"
				dangerouslySetInnerHTML={{ __html: html }}
			/>
		</div>
	);
}

export function PreviewPane({ target, onClose }: { target: PreviewTarget; onClose: () => void }) {
	const { t, i18n } = useTranslation();
	const { profileId, bucket, key: objectKey } = target;
	const kind = fileKind(objectKey);
	const name = objectKey.split('/').pop() ?? objectKey;
	const remoteMedia = isRemoteMedia(kind, objectKey);
	const localImage = kind === 'image' && !remoteMedia;
	const textLike = isTextKind(kind);
	const [html, setHtml] = useState('');
	const [text, setText] = useState('');
	const [expires, setExpires] = useState('3600');
	const [failedKey, setFailedKey] = useState<string | null>(null);
	const imgFailed = failedKey === objectKey;
	const useLocalFile = textLike || localImage || imgFailed;

	const detail = useQuery({
		queryKey: queryKeys.object(profileId, bucket, objectKey),
		queryFn: () => api.headObject({ profileId, bucket, key: objectKey }),
	});

	const signed = useQuery({
		queryKey: queryKeys.previewSign(profileId, bucket, objectKey),
		enabled: remoteMedia && !imgFailed,
		queryFn: () => api.presignGet({ profileId, bucket, key: objectKey, expiresInSecs: 3600 }),
	});

	const file = useQuery({
		queryKey: queryKeys.previewFile(profileId, bucket, objectKey),
		enabled: useLocalFile,
		queryFn: () => api.previewObject({ profileId, bucket, key: objectKey }),
	});

	const remoteSrc = signed.data?.url ?? '';
	const localSrc = file.data ? convertFileSrc(file.data) : '';
	const src =
		kind === 'image' && (localImage || imgFailed) ? localSrc : remoteMedia ? remoteSrc : localSrc;
	const loading =
		detail.isLoading ||
		(remoteMedia && !imgFailed && signed.isLoading) ||
		(useLocalFile && file.isLoading);
	const error =
		detail.error ??
		(remoteMedia && !imgFailed ? signed.error : null) ??
		(useLocalFile ? file.error : null);

	useEffect(() => {
		setHtml('');
		setText('');
		if (!file.data || !textLike) {
			return;
		}
		const local = convertFileSrc(file.data);
		void (async () => {
			const res = await fetch(local);
			const body = await res.text();
			if (kind === 'markdown') {
				setText(body);
				return;
			}
			const { codeToHtml } = await import('shiki');
			const lang = extOf(objectKey);
			const mapped = lang === 'jsonc' || lang === 'ndjson' ? 'json' : lang || 'txt';
			let highlighted = '';
			try {
				highlighted = await codeToHtml(body.slice(0, 200_000), {
					lang: mapped,
					theme: 'github-dark',
				});
			} catch {
				highlighted = await codeToHtml(body.slice(0, 200_000), {
					lang: 'txt',
					theme: 'github-dark',
				});
			}
			setHtml(highlighted);
		})();
	}, [file.data, kind, objectKey, textLike]);

	function errorCopy(err: unknown): { title: string; body: string } {
		if (isAppError(err) && err.kind === 'notFound') {
			return { title: t('preview.notFound'), body: err.message };
		}
		if (isAppError(err) && err.kind === 'r2Constraint') {
			return { title: t('preview.tooLarge'), body: err.message };
		}
		return {
			title: t('preview.failed'),
			body: isAppError(err) ? err.message : String(err),
		};
	}

	const fitMedia = kind === 'image' || kind === 'video';

	return (
		<div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-card contain-inline-size">
			<div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-medium select-text" title={name}>
						{name}
					</p>
					<div className="mt-0.5 flex items-center gap-2">
						<Badge variant="secondary">{kind}</Badge>
						{detail.data ? (
							<span className="truncate text-xs text-muted-foreground">
								{formatBytes(detail.data.size)} ·{' '}
								{formatModified(detail.data.lastModified, i18n.language)}
							</span>
						) : null}
					</div>
				</div>
				<Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('common.close')}>
					<X />
				</Button>
			</div>
			<div
				className={cn(
					'min-h-0 min-w-0 w-full flex-1 overflow-hidden',
					fitMedia ? 'flex items-center justify-center p-4' : 'flex w-full min-w-0 flex-col',
				)}
			>
				{loading ? <Skeleton className="h-full min-h-40 w-full" /> : null}
				{!loading && error ? (
					<Empty className="border-0">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<FileQuestion />
							</EmptyMedia>
							<EmptyTitle>{errorCopy(error).title}</EmptyTitle>
							<EmptyDescription>{errorCopy(error).body}</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<Button
								variant="outline"
								onClick={() => {
									void detail.refetch();
									void signed.refetch();
									void file.refetch();
								}}
							>
								{t('preview.retry')}
							</Button>
						</EmptyContent>
					</Empty>
				) : null}
				{!loading && !error && kind === 'image' && src ? (
					<img
						src={src}
						alt=""
						className="max-h-full max-w-full object-contain"
						onError={() => setFailedKey(objectKey)}
					/>
				) : null}
				{!loading && !error && kind === 'video' && src ? (
					<video src={src} controls className="max-h-full max-w-full">
						<track kind="captions" />
					</video>
				) : null}
				{!loading && !error && kind === 'pdf' && src ? (
					<iframe title="pdf" src={src} className="h-full min-h-0 w-full flex-1 border-0" />
				) : null}
				{!loading && !error && kind === 'markdown' ? (
					<div className="h-full min-h-0 min-w-0 w-full flex-1 overflow-auto p-4 select-text">
						<div className="prose prose-sm max-w-none dark:prose-invert">
							<Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
						</div>
					</div>
				) : null}
				{!loading && !error && kind === 'text' ? <HighlightedCode html={html} /> : null}
				{!loading && !error && kind === 'other' ? (
					<Empty className="h-full border-0">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<FileQuestion />
							</EmptyMedia>
							<EmptyTitle>{t('preview.unavailable')}</EmptyTitle>
							<EmptyDescription>{detail.data?.contentType}</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : null}
			</div>
			<div className="flex flex-col gap-3 border-t p-4">
				<FieldGroup className="gap-3">
					<Field>
						<FieldLabel>{t('preview.expires')}</FieldLabel>
						<div className="flex gap-2">
							<Select value={expires} onValueChange={setExpires}>
								<SelectTrigger className="flex-1">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="3600">{t('preview.hour')}</SelectItem>
										<SelectItem value="86400">{t('preview.day')}</SelectItem>
										<SelectItem value="604800">{t('preview.week')}</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
							<Button
								variant="outline"
								onClick={async () => {
									try {
										const res = await api.presignGet({
											profileId,
											bucket,
											key: objectKey,
											expiresInSecs: Number(expires),
										});
										await writeText(res.url);
										toast.success(t('toast.linkCopied'));
									} catch (err) {
										toast.error(isAppError(err) ? err.message : t('toast.shareFailed'));
									}
								}}
							>
								{t('common.share')}
							</Button>
						</div>
					</Field>
				</FieldGroup>
				{detail.data?.metadata?.length ? (
					<pre className="max-h-24 overflow-auto rounded-md bg-muted p-2 font-mono text-xs select-text">
						{JSON.stringify(detail.data.metadata, null, 2)}
					</pre>
				) : null}
			</div>
		</div>
	);
}
