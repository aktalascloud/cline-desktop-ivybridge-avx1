// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { it, expect, vi } from "vitest";
import { CompactionSettings } from "./compaction-settings";
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/desktop-client", () => ({
	desktopClient: { invoke: mocks.invoke },
}));
vi.mock("@/lib/i18n", () => ({ useTranslation: () => (s: string) => s }));
it("loads all three knobs and saves them through the backend", async () => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	const prefs = {
		enabled: true,
		triggerTokens: 90000,
		maxInputTokens: 120000,
		preserveRecentMessages: 40,
	};
	mocks.invoke.mockImplementation(async () => prefs);
	const div = document.createElement("div");
	document.body.append(div);
	const root = createRoot(div);
	try {
		await act(async () => root.render(<CompactionSettings />));
		expect(
			[...div.querySelectorAll('input[type="number"]')].map(
				(e) => (e as HTMLInputElement).value,
			),
		).toEqual(["90000", "120000", "40"]);
		await act(async () =>
			div
				.querySelector("form")!
				.dispatchEvent(
					new Event("submit", { bubbles: true, cancelable: true }),
				),
		);
		expect(mocks.invoke).toHaveBeenCalledWith("set_compaction_settings", {
			settings: prefs,
		});
		expect(div.textContent).toContain("Compaction settings saved");
	} finally {
		await act(() => root.unmount());
		div.remove();
	}
});
