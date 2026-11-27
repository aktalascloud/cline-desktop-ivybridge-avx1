import { beforeEach } from "vitest";
import { setLanguage } from "../webview/lib/i18n";
process.env.TZ = "UTC";

// JSDOM does not implement this browser API. Keep a baseline when individual
// layout tests restore their callback-aware stub while popovers finish cleanup.
if (typeof globalThis.ResizeObserver === "undefined") {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

// Existing behavioral tests use the English source labels. Locale-specific
// tests select Russian explicitly; the installed fork still defaults to RU.
beforeEach(() => {
	if (typeof window === "undefined" || !window.localStorage?.setItem) return;
	setLanguage("en");
});
