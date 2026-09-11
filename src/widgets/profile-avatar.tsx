import { convertFileSrc } from '@tauri-apps/api/core';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { profileAvatarFallbackLabel } from '@/entities/profile/avatars';
import type { Profile } from '@/entities/profile/types';
import { cn } from '@/lib/utils';

export function ProfileAvatar({
	profile,
	className,
	fallbackClassName,
}: {
	profile?: Pick<Profile, 'name' | 'avatar'> | null;
	className?: string;
	fallbackClassName?: string;
}) {
	const label = profile ? profileAvatarFallbackLabel(profile) : 'R';
	const imageSrc = profile?.avatar?.kind === 'image' ? convertFileSrc(profile.avatar.path) : null;
	const isEmoji = profile?.avatar?.kind === 'emoji';

	return (
		<Avatar className={className}>
			{imageSrc ? <AvatarImage src={imageSrc} alt="" /> : null}
			<AvatarFallback className={cn(isEmoji && 'text-base leading-none', fallbackClassName)}>
				{label}
			</AvatarFallback>
		</Avatar>
	);
}
