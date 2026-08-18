export type PreviewTarget = {
	profileId: string;
	bucket: string;
	key: string;
};

export function previewAfterLocation(
	preview: PreviewTarget | null,
	loc: { bucket: string; prefix?: string },
): PreviewTarget | null {
	if (!preview || preview.bucket !== loc.bucket) {
		return null;
	}
	return preview;
}

export function previewAfterProfile(
	preview: PreviewTarget | null,
	profileId: string | null,
): PreviewTarget | null {
	if (!preview || !profileId || preview.profileId !== profileId) {
		return null;
	}
	return preview;
}
