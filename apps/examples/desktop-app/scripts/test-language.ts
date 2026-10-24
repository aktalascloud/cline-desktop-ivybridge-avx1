import { beforeEach } from "vitest";
import { setLanguage } from "../webview/lib/i18n";
process.env.TZ = "UTC";

// Existing behavioral tests use the English source labels. Locale-specific
// tests select Russian explicitly; the installed fork still defaults to RU.
beforeEach(() => {
	if (typeof window === "undefined" || !window.localStorage?.setItem) return;
	setLanguage("en");
});
