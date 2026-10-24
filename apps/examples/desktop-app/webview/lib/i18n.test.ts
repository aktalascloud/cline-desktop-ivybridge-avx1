// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import ru from "./locales/ru.json";
import { plural, setLanguage, readLanguage, translate } from "./i18n";

describe("fork localization", () => {
	it("preserves placeholders and handles whitespace and source entities", () => {
		for (const [en, translated] of Object.entries(ru)) {
			expect(translated.match(/\{\w+\}/g) ?? []).toEqual(
				en.match(/\{\w+\}/g) ?? [],
			);
		}
		expect(translate(" Cancel ", "ru")).toBe(" Отмена ");
		expect(translate("You&apos;re all set", "en")).toBe("You're all set");
		expect(translate("Unknown {id}", "en", { id: "x" })).toBe("Unknown x");
	});
	it("keeps English and command examples, persists language", () => {
		expect(translate("Settings", "en")).toBe("Settings");
		expect(translate("cline config mcp", "ru")).toBe("cline config mcp");
		setLanguage("ru");
		expect(readLanguage()).toBe("ru");
		setLanguage("en");
		expect(readLanguage()).toBe("en");
	});
	it("uses Russian plural rules", () => {
		const forms = {
			one: "сеанс",
			few: "сеанса",
			many: "сеансов",
			other: "сеанса",
		};
		expect([1, 2, 5, 11, 21].map((n) => plural(n, forms, "ru"))).toEqual([
			"сеанс",
			"сеанса",
			"сеансов",
			"сеансов",
			"сеанс",
		]);
	});
});
