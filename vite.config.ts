import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src'),
		},
	},
	clearScreen: false,
	envPrefix: ['VITE_', 'TAURI_ENV_*'],
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		hmr: host
			? {
					protocol: 'ws',
					host,
					port: 1421,
				}
			: undefined,
		watch: {
			ignored: ['**/src-tauri/**'],
		},
	},
	build: {
		// WebView2 is evergreen Chromium; WKWebView on Ventura 13+ is Safari 16.4+.
		target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome111' : 'safari18',
		minify: !process.env.TAURI_ENV_DEBUG,
		sourcemap: !!process.env.TAURI_ENV_DEBUG,
	},
});
