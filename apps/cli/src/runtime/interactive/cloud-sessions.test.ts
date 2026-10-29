import { describe, expect, it } from "vitest";
import { isCloudSessionsEnabled } from "./cloud-sessions";
describe("experimental CLI Cloud opt-in", () => {
	it.each([
		undefined,
		"",
		"0",
		"false",
		"yes",
	])("stays disabled for %s", (value) => {
		expect(
			isCloudSessionsEnabled(
				value === undefined ? {} : { CLINE_CLOUD_SESSIONS: value },
			),
		).toBe(false);
	});
	it.each([
		"1",
		"true",
		" TRUE ",
	])("requires an explicit opt-in %s", (value) => {
		expect(isCloudSessionsEnabled({ CLINE_CLOUD_SESSIONS: value })).toBe(true);
	});
});
