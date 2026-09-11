export function externalHref(href?: string | null): boolean {
	if (!href) {
		return false;
	}
	return /^(https?:|mailto:)/i.test(href);
}

export function fenceLanguage(className?: string): string | undefined {
	if (!className) {
		return undefined;
	}
	const token = className.split(/\s+/).find((part) => part.startsWith('language-'));
	const lang = token?.slice('language-'.length);
	return lang || undefined;
}
