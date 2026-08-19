export function createDropGate(windowMs = 400) {
	let lastKey = '';
	let lastAt = 0;
	return (paths: string[], now = Date.now()) => {
		const key = paths.join('\0');
		if (key === lastKey && now - lastAt < windowMs) {
			return false;
		}
		lastKey = key;
		lastAt = now;
		return true;
	};
}
