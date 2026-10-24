import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { distributionBootstrap } from "./distribution-bootstrap";

describe("fork bootstrap before imports", () => {
	const home = join("fixture", "home");
	const apply = (env: Record<string, string | undefined>) => {
		const code = distributionBootstrap("avx1");
		new Function("process", code!)({
			env,
			getBuiltinModule: (name: string) =>
				name === "node:path" ? { join } : { homedir: () => home },
		});
	};
	it("selects the fork profile when both storage overrides are absent", () => {
		const env = {};
		apply(env);
		expect(env).toEqual({ CLINE_DIR: join(home, ".cline-avx1") });
	});
	it("preserves either explicit storage override", () => {
		for (const env of [
			{ CLINE_DIR: "custom-config" },
			{ CLINE_DATA_DIR: "custom-data" },
		]) {
			const original = { ...env };
			apply(env);
			expect(env).toEqual(original);
		}
	});
	it("treats empty overrides as absent and leaves upstream builds unchanged", () => {
		const env = { CLINE_DIR: " ", CLINE_DATA_DIR: "" };
		apply(env);
		expect(env.CLINE_DIR).toBe(join(home, ".cline-avx1"));
		expect(distributionBootstrap()).toBeUndefined();
	});
});
