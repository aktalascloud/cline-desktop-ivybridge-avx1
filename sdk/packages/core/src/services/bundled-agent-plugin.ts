import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { resolveClineDir } from "@cline/shared/storage";

const REPAIRABLE = new Set([
	"33c08929a7aa0a721f7f3372e26020f41898c8454ef3017bbce713e4aa3f2869",
	"1fb3fc3d20f1a6a7f7d799068a01f155a519579cb864a53588cb6e106305f323",
	"8ed471d098cf1d92e7331887f13ed743333d1749efe1aae2102d2b9abbef194a",
]);

/** Replace only known official plugin bytes; user edits and permissions remain authoritative. */
export function resolveBundledAgentPlugin(
	pluginPath: string,
	resourceRoot?: string,
): string {
	const original = resolve(pluginPath);
	const official = join(resolveClineDir(), "plugins", "_installed", "official");
	const parts = relative(official, original).replaceAll("\\", "/").split("/");
	if (
		parts.length !== 3 ||
		!/^agents-squad-[a-f0-9]+$/.test(parts[0]) ||
		parts[1] !== "package" ||
		parts[2] !== "index.ts"
	)
		return pluginPath;
	const replacement = (
		resourceRoot
			? [resourceRoot]
			: [
					join(dirname(process.execPath), "bin", "defaults"),
					join(dirname(process.execPath), "defaults"),
				]
	)
		.map((root) => join(root, "agents-squad", "index.js"))
		.find((path) => existsSync(path));
	if (!replacement) return pluginPath;
	try {
		return REPAIRABLE.has(
			createHash("sha256").update(readFileSync(original)).digest("hex"),
		)
			? replacement
			: pluginPath;
	} catch {
		return pluginPath;
	}
}
