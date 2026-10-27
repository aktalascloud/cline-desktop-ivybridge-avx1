import { beforeEach, describe, expect, it, vi } from "vitest";
const read = vi.hoisted(() => vi.fn());
vi.mock("@cline/core", () => ({
	readModelsFileSync: () => ({
		providers: {
			"local-test": {
				models: { "historical-model": { supportsAuthorModes: true } },
			},
		},
	}),
	resolveModelsRegistryPath: () => "fixture-model-registry",
	toProviderConfig: (settings: { provider: string }) => ({
		providerId: settings.provider,
	}),
	ProviderSettingsManager: class {
		getProviderSettings = read;
	},
}));
import { refreshLocalSamplingConfig } from "./sampling-settings";
beforeEach(() => read.mockReset());
describe("local sampling connection refresh", () => {
	it("updates defaults without replacing historical routes, credentials or thinking", () => {
		read.mockReturnValue({
			client: "openai-compatible",
			protocol: "openai-chat",
			sampling: { temperature: 0.7 },
		});
		const config = {
			provider: "local-test",
			model: "historical-model",
			thinking: true,
			reasoningEffort: "xhigh",
			providerConfig: {
				providerId: "local-test",
				apiKey: "private-test-key",
				sampling: { temperature: 1 },
			},
		};
		expect(refreshLocalSamplingConfig(config)).toEqual({
			...config,
			providerConfig: {
				providerId: "local-test",
				apiKey: "private-test-key",
				sampling: { temperature: 0.7 },
			},
		});
		expect(config.providerConfig.sampling).toEqual({ temperature: 1 });
	});
	it("clears old defaults and leaves other provider types unchanged", () => {
		read.mockReturnValue({
			client: "openai-compatible",
			protocol: "openai-chat",
		});
		expect(
			refreshLocalSamplingConfig({
				provider: "local-test",
				providerConfig: { sampling: { top_k: 20 } },
			}),
		).toMatchObject({ providerConfig: { sampling: {} } });
		read.mockReturnValue({ client: "anthropic", sampling: { temperature: 1 } });
		const config = { provider: "cloud" };
		expect(refreshLocalSamplingConfig(config)).toBe(config);
	});
});

it("makes Ultra an explicit session choice while High/XHigh ignore the old global toggle", () => {
	read.mockReturnValue({
		client: "openai-compatible",
		protocol: "openai-chat",
		authorReasoningMode: "ultra",
	});
	const base = {
		provider: "local-test",
		model: "historical-model",
		reasoningEffort: "xhigh",
		providerConfig: { providerId: "local-test", apiKey: "private-test-key" },
	};
	expect(
		(refreshLocalSamplingConfig(base).providerConfig as Record<string, unknown>)
			.authorReasoningMode,
	).toBeUndefined();
	const ultra = refreshLocalSamplingConfig({
		...base,
		reasoningEffort: "ultra",
	});
	expect(
		(ultra.providerConfig as Record<string, unknown>).authorReasoningMode,
	).toBe("ultra");
	const stock = refreshLocalSamplingConfig({
		...ultra,
		reasoningEffort: "xhigh",
	});
	expect(JSON.stringify(stock)).toBe(
		JSON.stringify(refreshLocalSamplingConfig(base)),
	);
	expect(
		(
			refreshLocalSamplingConfig({ ...base, reasoningEffort: "high" })
				.providerConfig as Record<string, unknown>
		).authorReasoningMode,
	).toBeUndefined();
	expect(() =>
		refreshLocalSamplingConfig({
			...base,
			model: "unverified-model",
			reasoningEffort: "ultra",
		}),
	).toThrow("not enabled");
});
