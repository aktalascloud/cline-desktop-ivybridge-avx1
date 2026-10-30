import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveClineDir, setClineDir } from "@cline/shared/storage";
import { expect, it, vi } from "vitest";
import { resolveBundledAgentPlugin } from "./bundled-agent-plugin";
vi.mock("node:crypto", () => ({ createHash: vi.fn() }));
it("overrides only approved official bytes, preserving custom plugins and on-disk profile", () => {
	const temp = mkdtempSync(join(tmpdir(), "plugin-override-")),
		previous = resolveClineDir();
	setClineDir(temp);
	const original = join(
			temp,
			"plugins/_installed/official/agents-squad-abcdef/package/index.ts",
		),
		root = join(temp, "defaults"),
		replacement = join(root, "agents-squad/index.js");
	mkdirSync(join(root, "agents-squad"), { recursive: true });
	mkdirSync(join(original, ".."), { recursive: true });
	writeFileSync(original, "known plugin");
	writeFileSync(replacement, "trusted bundled plugin");
	try {
		vi.mocked(createHash).mockReturnValue({
			update: () => ({
				digest: () =>
					"1fb3fc3d20f1a6a7f7d799068a01f155a519579cb864a53588cb6e106305f323",
			}),
		} as never);
		expect(resolveBundledAgentPlugin(original, root)).toBe(replacement);
		expect(
			resolveBundledAgentPlugin(join(temp, "custom/index.ts"), root),
		).toContain("custom");
		vi.mocked(createHash).mockReturnValue({
			update: () => ({ digest: () => "user-edited" }),
		} as never);
		expect(resolveBundledAgentPlugin(original, root)).toBe(original);
	} finally {
		setClineDir(previous);
		rmSync(temp, { recursive: true, force: true });
	}
});
