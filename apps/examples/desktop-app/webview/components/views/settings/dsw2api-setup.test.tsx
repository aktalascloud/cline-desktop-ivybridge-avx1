// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Dsw2ApiSetup } from "./dsw2api-setup";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), native: vi.fn() }));
vi.mock("@/lib/desktop-client", () => ({
	desktopClient: { invoke: mocks.invoke },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.native }));
vi.mock("@/lib/i18n", () => ({ useTranslation: () => (text: string) => text }));
let element: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	element = document.createElement("div");
	document.body.append(element);
	root = createRoot(element);
	vi.resetAllMocks();
	mocks.invoke.mockImplementation(async (command: string) =>
		command === "dsw2api_status"
			? { configured: false, available: true }
			: { configured: true },
	);
});
afterEach(async () => {
	await act(() => root.unmount());
	element.remove();
});
async function mount() {
	const connected = vi.fn(async () => {});
	await act(async () => root.render(<Dsw2ApiSetup onConnected={connected} />));
	return connected;
}
function button(text: string) {
	return [...element.querySelectorAll("button")].find(
		(value) => value.textContent === text,
	)!;
}
it("connects a browser session without manual token/cookie inputs", async () => {
	const session = { token: "fixture", cookies: "fixture=1" };
	mocks.native.mockResolvedValue(session);
	const connected = await mount();
	await act(async () => button("Sign in through browser").click());
	expect(mocks.native).toHaveBeenCalledWith("dsw2api_browser_login");
	expect(mocks.invoke).toHaveBeenCalledWith("dsw2api_configure", session);
	expect(mocks.native).toHaveBeenCalledWith("dsw2api_close_login");
	expect(connected).toHaveBeenCalledOnce();
	expect(element.querySelectorAll("input")).toHaveLength(0);
	expect(element.textContent).toContain("DeepSeek session connected.");
});
it("does not offer an empty saved-session action or reflect browser errors", async () => {
	mocks.native.mockRejectedValue(new Error("synthetic-private-material"));
	const connected = await mount();
	await act(async () => button("Sign in through browser").click());
	expect(connected).not.toHaveBeenCalled();
	expect(element.textContent).not.toContain("synthetic-private-material");
	expect(element.textContent).not.toContain("Use saved session");
	expect(element.querySelector('[role="alert"]')).not.toBeNull();
});
it("keeps the browser open when gateway verification fails", async () => {
	mocks.native.mockResolvedValue({ token: "fixture", cookies: "fixture=1" });
	mocks.invoke.mockImplementation(async (command: string) => {
		if (command === "dsw2api_configure") throw Error("verification failed");
		return { configured: false, available: true };
	});
	await mount();
	await act(async () => button("Sign in through browser").click());
	expect(mocks.native).not.toHaveBeenCalledWith("dsw2api_close_login");
	expect(element.querySelector('[role="alert"]')).not.toBeNull();
});
