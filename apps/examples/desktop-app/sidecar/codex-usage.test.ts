import { afterEach, expect, it, vi } from "vitest";
import { getCodexUsage, parseCodexUsage } from "./codex-usage";

const resolveProviderApiKey = vi.hoisted(() => vi.fn());
vi.mock("@cline/core", () => ({
	RuntimeOAuthTokenManager: class {
		resolveProviderApiKey = resolveProviderApiKey;
	},
}));

afterEach(() => {
	vi.unstubAllGlobals();
	resolveProviderApiKey.mockReset();
});

it("uses the signed-in account only against the ChatGPT usage endpoint", async () => {
	resolveProviderApiKey.mockResolvedValue({
		apiKey: "synthetic-access-token",
		accountId: "synthetic-account-id",
	});
	const request = vi.fn().mockResolvedValue(
		Response.json({
			account_id: "synthetic-account-id",
			rate_limit: { primary_window: { used_percent: 42 } },
		}),
	);
	vi.stubGlobal("fetch", request);
	expect(await getCodexUsage()).toEqual({
		limits: [{ windows: [{ usedPercent: 42 }] }],
	});
	expect(resolveProviderApiKey).toHaveBeenCalledWith({
		providerId: "openai-codex",
	});
	expect(request).toHaveBeenCalledTimes(1);
	const [url, init] = request.mock.calls[0];
	expect(url).toBe("https://chatgpt.com/backend-api/wham/usage");
	expect(init.redirect).toBe("error");
	expect(init.headers.get("Authorization")).toBe(
		"Bearer synthetic-access-token",
	);
	expect(init.headers.get("ChatGPT-Account-Id")).toBe("synthetic-account-id");
});

it("skips the network without OAuth credentials", async () => {
	resolveProviderApiKey.mockResolvedValue(null);
	const request = vi.fn();
	vi.stubGlobal("fetch", request);
	expect(await getCodexUsage()).toBeNull();
	expect(request).not.toHaveBeenCalled();
});

it("reads subscription and additional model limit windows", () => {
	expect(
		parseCodexUsage({
			plan_type: "plus",
			rate_limit: {
				primary_window: {
					used_percent: 23.5,
					limit_window_seconds: 18000,
					reset_at: 1795885200,
				},
				secondary_window: { used_percent: 100, limit_window_seconds: 604800 },
			},
			additional_rate_limits: [
				{
					limit_name: "Extra model",
					rate_limit: { primary_window: { used_percent: 0 } },
				},
			],
		}),
	).toEqual({
		plan: "plus",
		limits: [
			{
				windows: [
					{ usedPercent: 23.5, windowSeconds: 18000, resetsAt: 1795885200 },
					{ usedPercent: 100, windowSeconds: 604800 },
				],
			},
			{ label: "Extra model", windows: [{ usedPercent: 0 }] },
		],
	});
});

it("does not report missing or invalid limits as an unused quota", () => {
	expect(parseCodexUsage(null).limits).toEqual([]);
	expect(
		parseCodexUsage({
			rate_limit: {
				primary_window: { used_percent: null },
				secondary_window: { used_percent: -1 },
			},
		}).limits,
	).toEqual([]);
});
