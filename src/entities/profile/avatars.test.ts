import { describe, expect, it } from 'vitest';
import { PROFILE_AVATAR_PRESETS, profileAvatarFallbackLabel } from '@/entities/profile/avatars';

describe('profile avatars', () => {
	it('keeps presets unique and trimmed', () => {
		expect(PROFILE_AVATAR_PRESETS.length).toBeGreaterThan(0);
		expect(new Set(PROFILE_AVATAR_PRESETS).size).toBe(PROFILE_AVATAR_PRESETS.length);
		for (const emoji of PROFILE_AVATAR_PRESETS) {
			expect(emoji).toBe(emoji.trim());
			expect(emoji.length).toBeGreaterThan(0);
		}
	});

	it('uses emoji, otherwise name initials', () => {
		expect(
			profileAvatarFallbackLabel({
				name: 'prod',
				avatar: { kind: 'emoji', value: '🚀' },
			}),
		).toBe('🚀');
		expect(
			profileAvatarFallbackLabel({
				name: 'prod',
				avatar: { kind: 'image', path: '/tmp/a.png' },
			}),
		).toBe('PR');
		expect(profileAvatarFallbackLabel({ name: 'prod', avatar: null })).toBe('PR');
		expect(profileAvatarFallbackLabel({ name: '工作室' })).toBe('工作');
	});
});
