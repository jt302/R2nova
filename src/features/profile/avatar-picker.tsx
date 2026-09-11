import { useMutation } from '@tanstack/react-query';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AVATAR_IMAGE_EXTENSIONS, PROFILE_AVATAR_PRESETS } from '@/entities/profile/avatars';
import type { Profile, ProfileAvatar } from '@/entities/profile/types';
import { api } from '@/shared/api/backend';
import { isAppError } from '@/shared/api/tauri-invoke';
import { ProfileAvatar as ProfileAvatarView } from '@/widgets/profile-avatar';

export function AvatarPicker({
	profile,
	onChange,
	disabled = false,
}: {
	profile: Pick<Profile, 'name' | 'avatar'>;
	onChange: (avatar: ProfileAvatar | null) => void;
	disabled?: boolean;
}) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const emojiValue = profile.avatar?.kind === 'emoji' ? profile.avatar.value : '';

	const importImage = useMutation({
		mutationFn: (sourcePath: string) => api.importAvatarImage(sourcePath),
		onSuccess: (path) => {
			onChange({ kind: 'image', path });
			setOpen(false);
		},
		onError: (err) => toast.error(isAppError(err) ? err.message : String(err)),
	});

	async function pickImage() {
		const picked = await openDialog({
			multiple: false,
			filters: [
				{
					name: t('profile.avatarImageFilter'),
					extensions: [...AVATAR_IMAGE_EXTENSIONS],
				},
			],
		});
		const path = Array.isArray(picked) ? picked[0] : picked;
		if (typeof path === 'string' && path) {
			importImage.mutate(path);
		}
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					disabled={disabled || importImage.isPending}
					aria-label={t('profile.avatarPick')}
					className="rounded-full outline-none hover:ring-2 hover:ring-ring focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
				>
					<ProfileAvatarView profile={profile} className="size-10" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-3">
				<ToggleGroup
					type="single"
					variant="outline"
					size="sm"
					spacing={1}
					value={emojiValue}
					className="grid w-full grid-cols-6"
					onValueChange={(value) => {
						if (!value) {
							return;
						}
						onChange({ kind: 'emoji', value });
						setOpen(false);
					}}
				>
					{PROFILE_AVATAR_PRESETS.map((emoji) => (
						<ToggleGroupItem
							key={emoji}
							value={emoji}
							aria-label={emoji}
							className="size-8 min-w-8 p-0 text-base leading-none"
						>
							{emoji}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
				<div className="mt-3 flex flex-col gap-1">
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={importImage.isPending}
						onClick={() => void pickImage()}
					>
						{importImage.isPending ? <Spinner data-icon="inline-start" /> : null}
						{t('profile.avatarUpload')}
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={!profile.avatar}
						onClick={() => {
							onChange(null);
							setOpen(false);
						}}
					>
						{t('profile.avatarUseInitials')}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
