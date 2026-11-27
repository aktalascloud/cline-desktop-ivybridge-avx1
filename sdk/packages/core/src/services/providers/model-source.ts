function parseModelIdList(input: unknown): string[] {
	if (!Array.isArray(input)) return [];
	return input
		.map((item) => {
			if (typeof item === "string") return item.trim();
			if (item && typeof item === "object") {
				const entry = item as { id?: unknown; name?: unknown; model?: unknown };
				for (const value of [entry.id, entry.name, entry.model]) {
					if (typeof value === "string" && value.trim()) {
						return value.trim();
					}
				}
			}
			return "";
		})
		.filter((id) => id.length > 0);
}

export function extractModelIdsFromPayload(
	payload: unknown,
	providerId: string,
): string[] {
	const rootArray = parseModelIdList(payload);
	if (rootArray.length > 0) return rootArray;
	if (!payload || typeof payload !== "object") return [];

	const data = payload as {
		data?: unknown;
		models?: unknown;
		providers?: Record<string, unknown>;
	};

	const direct = parseModelIdList(data.data ?? data.models);
	if (direct.length > 0) return direct;

	if (
		data.models &&
		typeof data.models === "object" &&
		!Array.isArray(data.models)
	) {
		const keys = Object.keys(data.models).filter((k) => k.trim().length > 0);
		if (keys.length > 0) return keys;
	}

	const scoped = data.providers?.[providerId];
	if (scoped && typeof scoped === "object") {
		const nested = scoped as { models?: unknown };
		const list = parseModelIdList(nested.models ?? scoped);
		if (list.length > 0) return list;
	}

	return [];
}

export interface DiscoveredModel {
 id: string;
 name?: string;
 contextWindow?: number;
 maxInputTokens?: number;
 maxTokens?: number;
}

/** Keep declared limits; missing limits remain unknown, never a guessed model size. */
export function extractModelsFromPayload(payload: unknown, providerId: string): DiscoveredModel[] {
 const ids = extractModelIdsFromPayload(payload, providerId);
 const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
 const scoped = (root.providers as Record<string, { models?: unknown }> | undefined)?.[providerId];
 const source = Array.isArray(payload) ? payload : root.data ?? root.models ?? scoped?.models ?? [];
 const rows = Array.isArray(source) ? source : typeof source === "object" && source ? Object.entries(source).map(([id, value]) => ({ ...(value && typeof value === "object" ? value : {}), id })) : [];
 const records = new Map<string, Record<string, unknown>>();
 for (const entry of rows) {
  if (!entry || typeof entry !== "object") continue;
  const record = entry as Record<string, unknown>;
  const id = [record.id, record.name, record.model].find(v => typeof v === "string" && v.trim());
  if (typeof id === "string") records.set(id.trim(), record);
 }
 const positive = (...values: unknown[]): number | undefined => {
  const value = values.find(v => typeof v === "number" && Number.isSafeInteger(v) && v > 0);
  return typeof value === "number" ? value : undefined;
 };
 return ids.map(id => {
  const row = records.get(id) ?? {};
  const meta = row.meta && typeof row.meta === "object" ? row.meta as Record<string, unknown> : {};
  const contextWindow = positive(row.contextWindow, row.context_length, row.max_model_len, meta.n_ctx);
  const maxInputTokens = positive(row.maxInputTokens, row.max_input_tokens);
  const maxTokens = positive(row.maxTokens, row.max_output_tokens);
  return { id, ...(contextWindow !== undefined ? {contextWindow} : {}), ...(maxInputTokens !== undefined ? {maxInputTokens} : {}), ...(maxTokens !== undefined ? {maxTokens} : {}) };
 });
}

export interface ModelSourceAuth {
	baseUrl?: string;
	apiKey?: string;
	headers?: Record<string, string>;
}

export async function fetchModelsFromSource(
	url: string,
	providerId: string,
	auth: ModelSourceAuth = {},
): Promise<DiscoveredModel[]> {
	// A model source may be a third-party public catalog. Only send provider
	// credentials to its own origin, and do not follow authenticated redirects.
	const headers = new Headers();
	let sameOrigin = false;
	try {
		sameOrigin =
			!!auth.baseUrl && new URL(url).origin === new URL(auth.baseUrl).origin;
	} catch {
		// An invalid API endpoint cannot establish trust, but should not prevent
		// an independent public catalog from loading without credentials.
	}
	if (sameOrigin) {
		if (auth.apiKey?.trim()) {
			headers.set("Authorization", `Bearer ${auth.apiKey.trim()}`);
		}
		for (const [name, value] of Object.entries(auth.headers ?? {})) {
			headers.set(name, value);
		}
	}
	let hasHeaders = false;
	headers.forEach(() => {
		hasHeaders = true;
	});
	const response = await fetch(url, {
		method: "GET",
		...(hasHeaders ? { headers, redirect: "error" as const } : {}),
		signal: AbortSignal.timeout(5_000),
	});
	if (!response.ok) {
		throw new Error(
			`failed to fetch models from ${url}: HTTP ${response.status}`,
		);
	}
	return extractModelsFromPayload(
		(await response.json()) as unknown,
		providerId,
	);
}

export async function fetchModelIdsFromSource(url: string, providerId: string, auth: ModelSourceAuth = {}): Promise<string[]> {
 return (await fetchModelsFromSource(url, providerId, auth)).map(model => model.id);
}

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

export function resolveModelsSourceUrl(
	baseUrl: string | undefined,
	defaultBaseUrl: string | undefined,
	modelsSourceUrl: string | undefined,
): string | undefined {
	const source = modelsSourceUrl?.trim();
	if (!source) return undefined;
	const configuredBase = baseUrl?.trim();
	if (!configuredBase || !defaultBaseUrl?.trim()) return source;

	try {
		const sourceUrl = new URL(source);
		const defaultBase = new URL(defaultBaseUrl);
		const configured = new URL(configuredBase);
		if (sourceUrl.origin !== defaultBase.origin) return source;

		const defaultPath = trimTrailingSlash(defaultBase.pathname);
		const configuredPath = trimTrailingSlash(configured.pathname);
		if (defaultPath && sourceUrl.pathname.startsWith(`${defaultPath}/`)) {
			const suffix = sourceUrl.pathname.slice(defaultPath.length);
			configured.pathname = `${configuredPath}${suffix}`;
		} else {
			configured.pathname = sourceUrl.pathname;
		}
		configured.search = sourceUrl.search;
		configured.hash = sourceUrl.hash;
		return configured.toString();
	} catch {
		return source;
	}
}
