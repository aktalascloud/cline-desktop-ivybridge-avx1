// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { Dsw2ApiSetup } from "./dsw2api-setup";
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/desktop-client", () => ({
	desktopClient: { invoke: mocks.invoke },
}));
vi.mock("@/lib/i18n", () => ({ useTranslation: () => (text: string) => text }));
let element: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	vi.resetAllMocks();
	element = document.createElement("div");
	document.body.append(element);
	root = createRoot(element);
	mocks.invoke.mockImplementation(async (command: string) =>
		command === "dsw2api_status"
			? { configured: false, available: true }
			: {
					extensionId: "fixture",
					extensionFolder: "fixture-folder",
					connectUrl: "chrome-extension://fixture/connect.html",
				},
	);
});
afterEach(async () => {
	await act(() => root.unmount());
	element.remove();
});
async function mount() {
	const callback = vi.fn(async () => {});
	await act(async () => root.render(<Dsw2ApiSetup onConnected={callback} />));
	return callback;
}
function button(name: string) {
	return [...element.querySelectorAll("button")].find(
		(button) => button.textContent === name,
	)!;
}
it("opens the normal-profile extension rather than a native managed-browser login", async () => {
	await mount();
	await act(async () => button("Connect current browser session").click());
	expect(mocks.invoke).toHaveBeenCalledWith("dsw2api_open_extension");
	expect(element.querySelectorAll("input")).toHaveLength(0);
	expect(element.textContent).toContain("fixture-folder");
});
it("prepares a permission-reviewable bridge without extracting credentials", async () => {
	await mount();
	await act(async () => button("Set up browser bridge").click());
	expect(mocks.invoke).toHaveBeenCalledWith("dsw2api_prepare_extension");
	expect(element.textContent).toContain("Load unpacked");
});
it("does not expose raw errors or falsely claim connection", async () => {
	const callback = await mount();
	mocks.invoke.mockRejectedValue(Error("private-fixture-detail"));
	await act(async () => button("Connect current browser session").click());
	expect(element.textContent).not.toContain("private-fixture-detail");
	expect(element.querySelector('[role="alert"]')).not.toBeNull();
	expect(callback).not.toHaveBeenCalled();
});
