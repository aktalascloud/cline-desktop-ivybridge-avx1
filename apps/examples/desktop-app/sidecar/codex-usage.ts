import { RuntimeOAuthTokenManager } from "@cline/core";

const tokenManager = new RuntimeOAuthTokenManager();

type UsageWindow = {
	usedPercent: number;
	windowSeconds?: number;
	resetsAt?: number;
};
export type CodexUsage = {
	plan?: string;
	limits: { label?: string; windows: UsageWindow[] }[];
};

function object(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === "object"
		? (value as Record<string, unknown>)
		: {};
}

function positive(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: undefined;
}

function parseWindow(value: unknown): UsageWindow[] {
	const window = object(value);
	const used = window.used_percent;
	if (typeof used !== "number" || !Number.isFinite(used) || used < 0) return [];
	return [
		{
			usedPercent: Math.min(used, 100),
			windowSeconds: positive(window.limit_window_seconds),
			resetsAt: positive(window.reset_at),
		},
	];
}

export function parseCodexUsage(response: unknown): CodexUsage {
	const data = object(response);
	const extra = Array.isArray(data.additional_rate_limits)
		? data.additional_rate_limits
		: [];
	const buckets = [
		{ rate_limit: data.rate_limit },
		...extra.slice(0, 20).map(object),
	];
	return {
		plan: typeof data.plan_type === "string" ? data.plan_type : undefined,
		limits: buckets.flatMap((bucket) => {
			const limit = object(bucket.rate_limit);
			const windows = [
				...parseWindow(limit.primary_window),
				...parseWindow(limit.secondary_window),
			];
			const label =
				"limit_name" in bucket && typeof bucket.limit_name === "string"
					? bucket.limit_name.slice(0, 100)
					: undefined;
			return windows.length ? [{ label, windows }] : [];
		}),
	};
}

export async function getCodexUsage(): Promise<CodexUsage | null> {
	const credentials = await tokenManager.resolveProviderApiKey({
		providerId: "openai-codex",
	});
	if (!credentials) return null;
	const headers = new Headers({
		Authorization: `Bearer ${credentials.apiKey}`,
		Accept: "application/json",
	});
	if (credentials.accountId) {
		headers.set("ChatGPT-Account-Id", credentials.accountId);
	}
	const response = await fetch("https://chatgpt.com/backend-api/wham/usage", {
		headers,
		redirect: "error",
		signal: AbortSignal.timeout(10_000),
	});
	if (!response.ok)
		throw new Error(`Codex usage request failed (${response.status})`);
	return parseCodexUsage(await response.json());
}
