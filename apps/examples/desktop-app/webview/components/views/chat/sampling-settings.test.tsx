// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	invoke: vi.fn(),
	catalog: vi.fn(),
	invalidate: vi.fn(),
}));
vi.mock("@/lib/desktop-client", () => ({
	desktopClient: { invoke: mocks.invoke },
}));
vi.mock("@/lib/provider-model-catalog", () => ({
	fetchProviderCatalog: mocks.catalog,
	invalidateProviderCatalogCache: mocks.invalidate,
}));
import { SamplingSettings, samplingPatch } from "./sampling-settings";
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});
afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	vi.resetAllMocks();
});
const button = (name: string) =>
	Array.from(document.querySelectorAll("button")).find(
		(b) => b.getAttribute("aria-label") === name || b.textContent === name,
	)!;

describe("sampling controls", () => {
	it("preserves zero, clears overrides and excludes unchanged fields", () => {
		expect(
			samplingPatch(
				{ temperature: "0", seed: "0", top_p: "", top_k: "20" },
				{ temperature: "1", top_p: "0.95", top_k: "20" },
			),
		).toEqual({ temperature: 0, seed: 0, top_p: null });
	});
	it.each([
		["temperature", "-1"],
		["temperature", "3"],
		["top_p", "1.1"],
		["top_k", "1.5"],
		["top_k", "65"],
		["min_p", "-0.1"],
		["max_tokens", "0"],
		["seed", "NaN"],
		["reasoning_budget_tokens", "-1"],
	])("rejects invalid %s=%s", (key, value) => {
		expect(() => samplingPatch({ [key]: value }, {})).toThrow();
	});
	it("loads only on open and saves a provider-local patch without credentials", async () => {
		mocks.catalog.mockResolvedValue({
			providers: [
				{
					id: "local-test",
					configFields: [{ path: "sampling.temperature" }],
					configValues: { "sampling.temperature": 1 },
				},
			],
		});
		mocks.invoke.mockResolvedValue({});
		await act(async () =>
			root.render(<SamplingSettings provider="local-test" />),
		);
		expect(mocks.catalog).not.toHaveBeenCalled();
		await act(async () => button("Sampling settings").click());
		const input = document.querySelector(
			'input[aria-label="Temperature"]',
		) as HTMLInputElement;
		expect(input).not.toBeNull();
		await act(async () => {
			Object.getOwnPropertyDescriptor(
				HTMLInputElement.prototype,
				"value",
			)!.set!.call(input, "0.7");
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});
		await act(async () => button("Save").click());
		expect(mocks.invoke).toHaveBeenCalledWith("save_provider_settings", {
			provider: "local-test",
			settings: { sampling: { temperature: 0.7 } },
		});
		expect(mocks.invalidate).toHaveBeenCalledOnce();
	});
	it("does not offer unsupported provider controls", async () => {
		mocks.catalog.mockResolvedValue({
			providers: [{ id: "speech", configFields: [] }],
		});
		await act(async () => root.render(<SamplingSettings provider="speech" />));
		await act(async () => button("Sampling settings").click());
		expect(document.body.textContent).toContain(
			"Sampling requires an OpenAI-compatible Chat provider",
		);
		expect(document.querySelector("input[type=number]")).toBeNull();
		expect(mocks.invoke).not.toHaveBeenCalled();
	});
});
