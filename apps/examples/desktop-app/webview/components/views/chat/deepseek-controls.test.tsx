// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
vi.mock("@/lib/i18n", () => ({ useTranslation: () => translate }));
const translate = (value: string) => value;
import { DeepSeekControls } from "./deepseek-controls";
let element: HTMLDivElement, root: Root;
beforeEach(() => {
	element = document.createElement("div");
	document.body.append(element);
	root = createRoot(element);
	mocks.catalog.mockResolvedValue({
		providers: [
			{ id: "dsw2api", configValues: { "sampling.search_enabled": true } },
		],
	});
	mocks.invoke.mockResolvedValue({});
});
afterEach(async () => {
	await act(async () => root.unmount());
	element.remove();
	vi.clearAllMocks();
});
it("loads persisted search and toggles it without changing thinking or credentials", async () => {
	const change = vi.fn();
	await act(async () =>
		root.render(
			<DeepSeekControls
				thinking={true}
				disabled={false}
				onThinkingChange={change}
			/>,
		),
	);
	let buttons = element.querySelectorAll("button");
	expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
	expect(buttons[1].getAttribute("aria-pressed")).toBe("true");
	await act(async () => buttons[1].click());
	expect(mocks.invoke).toHaveBeenCalledWith("save_provider_settings", {
		provider: "dsw2api",
		settings: { sampling: { search_enabled: false } },
	});
	expect(change).not.toHaveBeenCalled();
	await act(async () => buttons[0].click());
	expect(change).toHaveBeenCalledWith(false);
});
it("save failure preserves previous state and shows error", async () => {
	mocks.invoke.mockRejectedValueOnce(Error("synthetic"));
	await act(async () =>
		root.render(
			<DeepSeekControls
				thinking={false}
				disabled={false}
				onThinkingChange={() => {}}
			/>,
		),
	);
	await act(async () => element.querySelectorAll("button")[1].click());
	expect(
		element.querySelectorAll("button")[1].getAttribute("aria-pressed"),
	).toBe("true");
	expect(element.querySelector("[role=alert]")).not.toBeNull();
});
it("locks both controls during an active run", async () => {
	await act(async () =>
		root.render(
			<DeepSeekControls
				thinking={false}
				disabled={true}
				onThinkingChange={() => {}}
			/>,
		),
	);
	expect(
		[...element.querySelectorAll("button")].every((button) => button.disabled),
	).toBe(true);
});
