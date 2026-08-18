import { describe, expect, it } from 'vitest';
import {
	corsToPayload,
	lifecycleToPayload,
	parseCorsRules,
	parseDevUrl,
	parseDomains,
	parseLifecycleRules,
	parseLockEnabled,
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

	it('treats any enabled lock rule as on', () => {
		expect(parseLockEnabled({ rules: [{ enabled: false }, { enabled: true }] })).toBe(true);
		expect(parseLockEnabled({ enabled: false })).toBe(false);
	});
});
