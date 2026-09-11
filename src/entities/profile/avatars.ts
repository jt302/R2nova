import type { Profile } from '@/entities/profile/types';
import { profileInitials } from '@/shared/lib/object-key';

export const PROFILE_AVATAR_PRESETS = [
	'🚀',
	'☁️',
	'📦',
	'🗄️',
	'🧪',
	'🏠',
	'🏢',
	'🎯',
	'🔥',
	'🌈',
	'⭐',
	'🌙',
	'💎',
	'🍀',
	'🐱',
	'🐶',
	'🦊',
	'🐼',
	'🐧',
	'🎮',
	'🎵',
	'📷',
	'🛰️',
	'🧊',
] as const;

export const AVATAR_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] as const;

export function profileAvatarFallbackLabel(profile: Pick<Profile, 'name' | 'avatar'>): string {
	if (profile.avatar?.kind === 'emoji' && profile.avatar.value) {
		return profile.avatar.value;
	}
	return profileInitials(profile.name);
}
