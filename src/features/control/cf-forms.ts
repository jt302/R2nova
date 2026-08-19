export type CorsRuleForm = {
	id: string;
	origins: string;
	methods: string;
	headers: string;
};

export type LifecycleRuleForm = {
	id: string;
	prefix: string;
	days: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function csv(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}
	return asArray(value)
		.map((item) => String(item).trim())
		.filter(Boolean)
		.join(', ');
}

function splitCsv(value: string): string[] {
	return value
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
}

export function parseCorsRules(data: unknown): CorsRuleForm[] {
	const root = asRecord(data);
	const rules = asArray(root?.rules);
	if (rules.length === 0) {
		return [{ id: 'cors-1', origins: '', methods: 'GET', headers: '' }];
	}
	return rules.map((rule, i) => {
		const rec = asRecord(rule);
		const allowed = asRecord(rec?.allowed) ?? rec ?? {};
		return {
			id: typeof rec?.id === 'string' && rec.id ? rec.id : `cors-${i + 1}`,
			origins: csv(allowed.origins),
			methods: csv(allowed.methods) || 'GET',
			headers: csv(allowed.headers),
		};
	});
}

export function corsToPayload(rules: CorsRuleForm[]): { rules: unknown[] } {
	return {
		rules: rules
			.filter((rule) => rule.origins.trim())
			.map((rule, i) => ({
				id: rule.id || `cors-${i + 1}`,
				allowed: {
					origins: splitCsv(rule.origins),
					methods: splitCsv(rule.methods).length > 0 ? splitCsv(rule.methods) : ['GET'],
					headers: splitCsv(rule.headers),
				},
			})),
	};
}

export function parseLifecycleRules(data: unknown): LifecycleRuleForm[] {
	const root = asRecord(data);
	const rules = asArray(root?.rules);
	if (rules.length === 0) {
		return [{ id: 'expire-1', prefix: '', days: '30' }];
	}
	return rules.map((rule, i) => {
		const rec = asRecord(rule) ?? {};
		const conditions = asRecord(rec.conditions);
		const transition = asRecord(rec.deleteObjectsTransition);
		const condition = asRecord(transition?.condition);
		const maxAge = typeof condition?.maxAge === 'number' ? condition.maxAge : 0;
		return {
			id: typeof rec.id === 'string' && rec.id ? rec.id : `expire-${i + 1}`,
			prefix: typeof conditions?.prefix === 'string' ? conditions.prefix : '',
			days: String(Math.max(1, Math.round(maxAge / 86_400)) || 30),
		};
	});
}

export function lifecycleToPayload(rules: LifecycleRuleForm[]): { rules: unknown[] } {
	return {
		rules: rules.map((rule, i) => ({
			id: rule.id || `expire-${i + 1}`,
			enabled: true,
			conditions: { prefix: rule.prefix.trim() },
			deleteObjectsTransition: {
				condition: {
					maxAge: Math.max(1, Number(rule.days) || 1) * 86_400,
					type: 'Age',
				},
			},
		})),
	};
}

export function parseDevUrl(data: unknown): { enabled: boolean; url: string } {
	const rec = asRecord(data) ?? {};
	const domain = typeof rec.domain === 'string' ? rec.domain : '';
	const bucketId = typeof rec.bucketId === 'string' ? rec.bucketId : '';
	const url = domain
		? domain.startsWith('http')
			? domain
			: `https://${domain}`
		: bucketId
			? `https://pub-${bucketId}.r2.dev`
			: '';
	return { enabled: Boolean(rec.enabled), url };
}

export function parseDomains(data: unknown): string[] {
	const rec = asRecord(data);
	const list = asArray(rec?.domains ?? rec?.hostnames ?? data);
	return list
		.map((item) => {
			if (typeof item === 'string') {
				return item;
			}
			const row = asRecord(item);
			return String(row?.domain ?? row?.hostname ?? row?.name ?? '');
		})
		.filter(Boolean);
}

export function publicBaseUrl(
	dev: { enabled: boolean; url: string },
	domains: string[],
): string | null {
	const custom = domains.find((d) => d.trim());
	if (custom) {
		return custom.trim();
	}
	if (dev.enabled && dev.url.trim()) {
		return dev.url.trim();
	}
	return null;
}

export function publicObjectUrl(base: string, key: string): string {
	const origin = base.trim().replace(/\/+$/, '');
	const withScheme = /^https?:\/\//i.test(origin) ? origin : `https://${origin}`;
	const path = key
		.replace(/^\/+/, '')
		.split('/')
		.filter(Boolean)
		.map((part) => encodeURIComponent(part))
		.join('/');
	return path ? `${withScheme}/${path}` : withScheme;
}

export function metricEntries(data: unknown): [string, string][] {
	const rec = asRecord(data);
	if (!rec) {
		return [];
	}
	return Object.entries(rec)
		.filter(([, value]) => value !== null && typeof value !== 'object')
		.slice(0, 12)
		.map(([key, value]) => [key, String(value)]);
}

export function parseLockEnabled(data: unknown): boolean {
	const rec = asRecord(data);
	if (!rec) {
		return false;
	}
	if (typeof rec.enabled === 'boolean') {
		return rec.enabled;
	}
	return asArray(rec.rules).some((rule) => asRecord(rule)?.enabled !== false);
}

export function lockPayload(data: unknown, enabled: boolean): unknown {
	const rec = asRecord(data) ?? {};
	const rules = asArray(rec.rules);
	if (rules.length > 0) {
		return {
			...rec,
			rules: rules.map((rule) => ({ ...(asRecord(rule) ?? {}), enabled })),
		};
	}
	return { ...rec, enabled };
}

export function stringifyJson(data: unknown): string {
	try {
		return JSON.stringify(data ?? {}, null, 2);
	} catch {
		return '{}';
	}
}

export function parseJson(text: string): unknown {
	return JSON.parse(text) as unknown;
}
