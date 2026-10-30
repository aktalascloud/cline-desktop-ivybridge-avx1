import { beforeEach, describe, expect, it, vi } from "vitest";
const read = vi.hoisted(() => vi.fn());
const registry = vi.hoisted(() => ({
	window: undefined as number | undefined,
}));
vi.mock("@cline/core", () => ({
	readModelsFileSync: () => ({
		providers: {
			"local-test": {
				models: {
					"DavidAU/Qwen3.8-Flash-Next-fixture": { supportsAuthorModes: true },
					"other-model": {
						supportsAuthorModes: true,
						contextWindow: registry.window,
					},
				},
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
beforeEach(() => {
	read.mockReset();
	registry.window = undefined;
});
describe("local sampling connection refresh", () => {
	it("updates defaults without replacing historical routes, credentials or thinking", () => {
		read.mockReturnValue({
			client: "openai-compatible",
			protocol: "openai-chat",
			sampling: { temperature: 0.7 },
		});
		const config = {
			provider: "local-test",
			model: "DavidAU/Qwen3.8-Flash-Next-fixture",
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
		model: "DavidAU/Qwen3.8-Flash-Next-fixture",
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

it("blocks author modes on another model even with stale opt-in while preserving sampling", () => {
	read.mockReturnValue({
		client: "openai-compatible",
		protocol: "openai-chat",
		sampling: { temperature: 0.7, top_k: 20 },
	});
	const config = {
		provider: "local-test",
		model: "other-model",
		reasoningEffort: "xhigh",
	};
	expect(
		(
			refreshLocalSamplingConfig(config).providerConfig as Record<
				string,
				unknown
			>
		).sampling,
	).toEqual({ temperature: 0.7, top_k: 20 });
	for (const reasoningEffort of ["ultra", "adaptive"])
		expect(() =>
			refreshLocalSamplingConfig({ ...config, reasoningEffort }),
		).toThrow("not enabled");
});

it("refreshes an open chat's model window without changing its route or credentials", () => {
	read.mockReturnValue({
		client: "openai-compatible",
		protocol: "openai-chat",
		baseUrl: "http://localhost:7777/v1",
	});
	registry.window = 131072;
	const original = {
		provider: "local-test",
		model: "other-model",
		providerConfig: {
			apiKey: "synthetic-private",
			baseUrl: "http://localhost:7777/v1",
		},
	};
	const before = refreshLocalSamplingConfig(original);
	registry.window = 256000;
	const after = refreshLocalSamplingConfig(before);
	expect((before.providerConfig as any).modelInfo.contextWindow).toBe(131072);
	expect((after.providerConfig as any).modelInfo.contextWindow).toBe(256000);
	expect(after.providerConfig).toMatchObject({
		apiKey: "synthetic-private",
		baseUrl: "http://localhost:7777/v1",
	});
	const historical = refreshLocalSamplingConfig({
		...original,
		baseUrl: "http://localhost:8888/v1",
	});
	expect((historical.providerConfig as any).modelInfo).toBeUndefined();
});
