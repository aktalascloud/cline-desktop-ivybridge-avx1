import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setClineDir, resolveClineDir } from "@cline/shared/storage";
import { expect, it } from "vitest";
import { createBundledDefaults } from "./bundled-defaults";
it("registers the installed rule and keyless MCP without overriding a user rule", () => {
	const temp = mkdtempSync(join(tmpdir(), "bundled-defaults-"));
	const root = join(temp, "defaults");
	mkdirSync(root);
	mkdirSync(join(root, "python"), { recursive: true });
	writeFileSync(join(root, "python/python.exe"), "");
	writeFileSync(
		join(root, "defaults.json"),
		JSON.stringify({ application: "Cline Desktop AVX1 RU" }),
	);
	writeFileSync(join(root, "ponytail.md"), "Default rule");
	writeFileSync(join(root, "free-web-search.py"), "");
	const previous = process.env.CLINE_DIR;
	const previousRoot = resolveClineDir();
	process.env.CLINE_DIR = join(temp, "profile");
	setClineDir(join(temp, "profile"));
	try {
		const defaults = createBundledDefaults(root)!;
		expect(defaults.mcpServers[0]?.registration.transport.type).toBe("stdio");
		expect(defaults.mcpServers[0]?.registration.metadata).toMatchObject({
			readOnly: true,
		});
		const rules: unknown[] = [];
		defaults.extension.setup?.(
			{ registerRule: (r: unknown) => rules.push(r) } as never,
			{} as never,
		);
		expect(rules).toHaveLength(1);
		mkdirSync(join(temp, "profile/rules"), { recursive: true });
		writeFileSync(join(temp, "profile/rules/ponytail.md"), "User choice");
		rules.length = 0;
		defaults.extension.setup?.(
			{ registerRule: (r: unknown) => rules.push(r) } as never,
			{} as never,
		);
		expect(rules).toHaveLength(0);
	} finally {
		process.env.CLINE_DIR = previous;
		setClineDir(previousRoot);
		rmSync(temp, { recursive: true, force: true });
	}
});
