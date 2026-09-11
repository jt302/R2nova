import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// CSP 只在 tauri build 产物里生效，dev 走 Vite 不注入；这里锁住预览面板依赖的几条指令，
// 避免再次出现「dev 正常、生产留白」。
const conf = JSON.parse(
	readFileSync(resolve(__dirname, '../../../src-tauri/tauri.conf.json'), 'utf8'),
) as { app: { security: { csp: Record<string, string> } } };

function sources(directive: string): string[] {
	return (conf.app.security.csp[directive] ?? '').split(/\s+/).filter(Boolean);
}

describe('preview CSP contract', () => {
	it('lets fetch() read text previews through the asset protocol', () => {
		// fetch 受 connect-src 管，不受 img-src 管；macOS/Linux 是 asset:，Windows 是 http://asset.localhost。
		expect(sources('connect-src')).toEqual(
			expect.arrayContaining(['asset:', 'http://asset.localhost']),
		);
	});

	it('lets shiki instantiate its Oniguruma WebAssembly engine', () => {
		expect(sources('script-src')).toContain("'wasm-unsafe-eval'");
	});

	it('keeps IPC reachable after adding asset sources', () => {
		expect(sources('connect-src')).toEqual(
			expect.arrayContaining(['ipc:', 'http://ipc.localhost']),
		);
	});
});
