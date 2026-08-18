import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
	Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
} else if (!globalThis.crypto.getRandomValues) {
	Object.defineProperty(globalThis.crypto, 'getRandomValues', {
		value: webcrypto.getRandomValues.bind(webcrypto),
	});
}
