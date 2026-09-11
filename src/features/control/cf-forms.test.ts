import { describe, expect, it } from 'vitest';
import {
	corsToPayload,
	lifecycleToPayload,
	parseAccountMetrics,
	parseCorsRules,
	parseDevUrl,
	parseDomains,
	parseLifecycleRules,
	parseLockEnabled,
	publicBaseUrl,
	publicObjectUrl,
} from '@/features/control/cf-forms';

describe('cf form parsers', () => {
	it('round-trips CORS origins and methods', () => {
		const parsed = parseCorsRules({
			rules: [
				{ allowed: { origins: ['https://a.test'], methods: ['GET', 'PUT'], headers: ['*'] } },
			],
		});
		expect(parsed[0]).toEqual({
			id: 'cors-1',
			origins: 'https://a.test',
			methods: 'GET, PUT',
			headers: '*',
		});
		expect(corsToPayload(parsed)).toEqual({
			rules: [
				{
					id: 'cors-1',
					allowed: {
						origins: ['https://a.test'],
						methods: ['GET', 'PUT'],
						headers: ['*'],
					},
				},
			],
		});
	});

	it('converts lifecycle maxAge seconds to days', () => {
		const parsed = parseLifecycleRules({
			rules: [
				{
					id: 'logs',
					conditions: { prefix: 'logs/' },
					deleteObjectsTransition: { condition: { maxAge: 86_400 * 7, type: 'Age' } },
				},
			],
		});
		expect(parsed[0]).toEqual({ id: 'logs', prefix: 'logs/', days: '7' });
		const payload = lifecycleToPayload(parsed);
		const rule = (
			payload.rules[0] as { deleteObjectsTransition: { condition: { maxAge: number } } }
		).deleteObjectsTransition.condition.maxAge;
		expect(rule).toBe(86_400 * 7);
	});

	it('reads r2.dev and custom domains', () => {
		expect(parseDevUrl({ enabled: true, bucketId: 'abc' })).toEqual({
			enabled: true,
			url: 'https://pub-abc.r2.dev',
		});
		expect(parseDomains({ domains: [{ domain: 'cdn.example.com' }, 'also.test'] })).toEqual([
			'cdn.example.com',
			'also.test',
		]);
	});

	it('prefers a custom domain, then enabled r2.dev', () => {
		const dev = { enabled: true, url: 'https://pub-abc.r2.dev' };
		expect(publicBaseUrl(dev, ['cdn.example.com'])).toBe('cdn.example.com');
		expect(publicBaseUrl(dev, [])).toBe('https://pub-abc.r2.dev');
		expect(publicBaseUrl({ enabled: false, url: 'https://pub-abc.r2.dev' }, [])).toBeNull();
	});

	it('builds a public object URL with encoded path segments', () => {
		expect(publicObjectUrl('https://pub-abc.r2.dev/', 'photos/a b.png')).toBe(
			'https://pub-abc.r2.dev/photos/a%20b.png',
		);
		expect(publicObjectUrl('cdn.example.com', 'v1/app.js')).toBe(
			'https://cdn.example.com/v1/app.js',
		);
	});

	it('treats any enabled lock rule as on', () => {
		expect(parseLockEnabled({ rules: [{ enabled: false }, { enabled: true }] })).toBe(true);
		expect(parseLockEnabled({ enabled: false })).toBe(false);
	});

	it('parses nested r2/metrics storage slices', () => {
		expect(
			parseAccountMetrics({
				standard: {
					published: { metadataSize: 100, objects: 2422, payloadSize: 75_130_000 },
					uploaded: { metadataSize: 0, objects: 2, payloadSize: 4096 },
				},
				infrequentAccess: {
					published: { metadataSize: 10, objects: 3, payloadSize: 2048 },
					uploaded: { metadataSize: 0, objects: 0, payloadSize: 0 },
				},
			}),
		).toEqual({
			standard: {
				published: { objects: 2422, bytes: 75_130_100 },
				uploaded: { objects: 2, bytes: 4096 },
			},
			infrequentAccess: {
				published: { objects: 3, bytes: 2058 },
				uploaded: { objects: 0, bytes: 0 },
			},
		});
	});

	it('returns null for non-object metrics payloads', () => {
		expect(parseAccountMetrics(null)).toBeNull();
		expect(parseAccountMetrics([])).toBeNull();
	});
});
