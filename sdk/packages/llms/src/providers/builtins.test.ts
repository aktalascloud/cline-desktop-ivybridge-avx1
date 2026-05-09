import { CLINE_ENVIRONMENT_ENV, CLINE_ENVIRONMENTS } from "@cline/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BUILTIN_SPECS } from "./builtins";

function findClineSpec() {
	const spec = BUILTIN_SPECS.find((s) => s.id === "cline");
	if (!spec) {
		throw new Error("cline builtin spec not found");
	}
	return spec;
}

describe("cline builtin spec defaults.baseUrl", () => {
	const originalEnvironment = process.env[CLINE_ENVIRONMENT_ENV];

	beforeEach(() => {
		delete process.env[CLINE_ENVIRONMENT_ENV];
	});

	afterEach(() => {
		if (originalEnvironment === undefined) {
			delete process.env[CLINE_ENVIRONMENT_ENV];
		} else {
			process.env[CLINE_ENVIRONMENT_ENV] = originalEnvironment;
		}
	});

	it("re-resolves baseUrl when CLINE_ENVIRONMENT changes between reads", () => {
		const spec = findClineSpec();

		expect(spec.defaults?.baseUrl).toBe(
			`${CLINE_ENVIRONMENTS.production.apiBaseUrl}/api/v1`,
		);

		process.env[CLINE_ENVIRONMENT_ENV] = "staging";
		expect(spec.defaults?.baseUrl).toBe(
			`${CLINE_ENVIRONMENTS.staging.apiBaseUrl}/api/v1`,
		);

		process.env[CLINE_ENVIRONMENT_ENV] = "local";
		expect(spec.defaults?.baseUrl).toBe(
			`${CLINE_ENVIRONMENTS.local.apiBaseUrl}/api/v1`,
		);

		delete process.env[CLINE_ENVIRONMENT_ENV];
		expect(spec.defaults?.baseUrl).toBe(
			`${CLINE_ENVIRONMENTS.production.apiBaseUrl}/api/v1`,
		);
	});
});
