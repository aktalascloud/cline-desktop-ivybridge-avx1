import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
	ensure: vi.fn(async () => {}),
	refresh: vi.fn(async () => ({ refreshed: true })),
}));
vi.mock("@cline/core", () => ({
	ensureCustomProvidersLoaded: mocks.ensure,
	refreshProviderModelsFromSource: mocks.refresh,
}));
import { refreshLocalModelMetadata } from "./live-model-metadata";
beforeEach(() => vi.clearAllMocks());
it("deduplicates local metadata requests and never probes remote endpoints", async () => {
	const manager = {
		getProviderSettings: () => ({ baseUrl: "http://127.0.0.1:12345/v1" }),
	} as never;
	await Promise.all([
		refreshLocalModelMetadata(manager, "local-fixture"),
		refreshLocalModelMetadata(manager, "local-fixture"),
	]);
	expect(mocks.refresh).toHaveBeenCalledTimes(1);
	await refreshLocalModelMetadata(
		{
			getProviderSettings: () => ({ baseUrl: "https://remote.example/v1" }),
		} as never,
		"remote",
	);
	expect(mocks.refresh).toHaveBeenCalledTimes(1);
});
it("keeps cached models usable when the local engine is unavailable", async () => {
	mocks.refresh.mockRejectedValueOnce(new Error("offline"));
	await expect(
		refreshLocalModelMetadata(
			{
				getProviderSettings: () => ({ baseUrl: "http://localhost:12346/v1" }),
			} as never,
			"offline",
		),
	).resolves.toBeUndefined();
});
