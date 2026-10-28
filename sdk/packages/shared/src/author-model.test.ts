import { describe, expect, it } from "vitest";
import { isQwen38NextAuthorModel } from "./author-model";
describe("Qwen3.8 Next author compatibility", () => {
	it.each([
		"DavidAU/Qwen3.8-Flash-Next",
		"DavidAU/Qwen3.8-Next-Q4",
		"davidau-qwen3.8-flash-next-fixture",
	])("recognizes %s", (model) =>
		expect(isQwen38NextAuthorModel(model)).toBe(true));
	it.each([
		undefined,
		"Qwen3.8-Flash-Next",
		"ukisai/Swift-Qwen3.8-Flash-Next",
		"DavidAU/Swift-Qwen3.8-Flash-Next",
		"deepseek-web",
		"Qwen3-Next",
		"Qwen3.8-Coder",
		"Qwen3.8-27B",
		"Qwen3.8-Flash",
		"Qwen3.8-Nextish",
		"other/Qwen3.8-Coder-next",
	])("does not enable extensions for %s", (model) =>
		expect(isQwen38NextAuthorModel(model)).toBe(false));
});
