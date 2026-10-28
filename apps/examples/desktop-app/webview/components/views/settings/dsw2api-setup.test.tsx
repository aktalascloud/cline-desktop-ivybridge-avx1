// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Dsw2ApiSetup } from "./dsw2api-setup";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), openExternalUrl: vi.fn() }));
vi.mock("@/lib/desktop-client", () => ({
	desktopClient: { invoke: mocks.invoke },
	openExternalUrl: mocks.openExternalUrl,
}));
vi.mock("@/lib/i18n", () => ({ useTranslation: () => (text: string) => text }));
let element: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	element = document.createElement("div");
	document.body.append(element);
	root = createRoot(element);
	vi.clearAllMocks();
});
afterEach(async () => {
	await act(() => root.unmount());
	element.remove();
});
async function mount() {
	const onConnected = vi.fn(async () => {});
	await act(() => root.render(<Dsw2ApiSetup onConnected={onConnected} />));
	return onConnected;
}
function button(text: string) {
	return [...element.querySelectorAll("button")].find(
		(item) => item.textContent === text,
	)!;
}
it("opens only the official personal sign-in page", async () => {
	await mount();
	await act(() => button("Register / sign in to DeepSeek").click());
	expect(mocks.openExternalUrl).toHaveBeenCalledWith(
		"https://chat.deepseek.com/sign_in",
	);
	expect(mocks.invoke).not.toHaveBeenCalled();
});
it("reuses saved credentials without exposing or requesting their value", async () => {
	mocks.invoke.mockResolvedValue({ configured: true });
	const connected = await mount();
	await act(() => button("Use saved session").click());
	expect(mocks.invoke).toHaveBeenCalledWith("dsw2api_connect", {});
	expect(connected).toHaveBeenCalledOnce();
	expect(element.textContent).toContain("DeepSeek session connected.");
	expect(
		[...element.querySelectorAll("input")].every(
			(input) => input.type === "password" && input.value === "",
		),
	).toBe(true);
});
it("does not reflect backend errors or claim a failed connection succeeded", async () => {
	mocks.invoke.mockRejectedValue(new Error("synthetic-private-material"));
	const connected = await mount();
	await act(() => button("Use saved session").click());
	expect(connected).not.toHaveBeenCalled();
	expect(element.textContent).not.toContain("synthetic-private-material");
	expect(element.querySelector('[role="alert"]')).not.toBeNull();
});
