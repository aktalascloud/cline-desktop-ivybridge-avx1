import { beforeEach, describe, expect, it, vi } from "vitest";
const read = vi.hoisted(() => vi.fn());
vi.mock("@cline/core", () => ({
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
				apiKey: "private-test-key",
				sampling: { temperature: 1 },
			},
		};
		expect(refreshLocalSamplingConfig(config)).toEqual({
			...config,
			providerConfig: {
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
