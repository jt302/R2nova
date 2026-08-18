import { describe, expect, it } from 'vitest';
import {
	type PreviewTarget,
	previewAfterLocation,
	previewAfterProfile,
} from '@/shared/lib/preview';

const target: PreviewTarget = { profileId: 'p1', bucket: 'video', key: 'a.mp4' };

describe('preview lifecycle', () => {
	it('keeps the preview when staying in the same bucket', () => {
		expect(previewAfterLocation(target, { bucket: 'video', prefix: 'clips/' })).toEqual(target);
	});

	it('clears the preview when the bucket changes', () => {
		expect(previewAfterLocation(target, { bucket: 'other', prefix: '' })).toBeNull();
	});

	it('clears the preview when the profile changes', () => {
		expect(previewAfterProfile(target, 'p2')).toBeNull();
		expect(previewAfterProfile(target, null)).toBeNull();
		expect(previewAfterProfile(target, 'p1')).toEqual(target);
	});
});
