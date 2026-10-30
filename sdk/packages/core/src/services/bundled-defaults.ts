import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AgentExtension } from "@cline/shared";
import { resolveClineDir } from "@cline/shared/storage";
import type { AgentPluginPackageMcpServer } from "../extensions/agent-plugin";
import { isAgentPluginDisabledGlobally } from "./global-settings";

/** Optional installed resources; SDK consumers without the fork package are unchanged. */
export function createBundledDefaults(resourceRoot?: string) {
	const root =
		resourceRoot ??
		[
			join(dirname(process.execPath), "bin", "defaults"),
			join(dirname(process.execPath), "defaults"),
		].find((p) => existsSync(join(p, "defaults.json")));
	if (!root || isAgentPluginDisabledGlobally("avx1-defaults")) return undefined;
	if (
		JSON.parse(readFileSync(join(root, "defaults.json"), "utf8"))
			.application !== "Cline Desktop AVX1 RU"
	)
		return undefined;
	const python = join(root, "python", "python.exe");
	const mcpServers: AgentPluginPackageMcpServer[] = [];
	if (existsSync(python) && existsSync(join(root, "free-web-search.py")))
		mcpServers.push({
			pluginName: "avx1-defaults",
			pluginRoot: root,
			serverName: "web-search",
			registration: {
				name: "avx1-free-web-search",
				transport: {
					type: "stdio",
					command: process.platform === "win32" ? `"${python}"` : python,
					args: ["-I", "-B", "-X", "utf8", join(root, "free-web-search.py")],
					cwd: root,
				},
				metadata: {
					source: "agent-plugin",
					plugin: "avx1-defaults",
					readOnly: true,
				},
			},
		});
	const extension: AgentExtension = {
		name: "avx1-ponytail",
		manifest: { capabilities: ["rules"] },
		setup(api) {
			// A user-managed rule, including a disabled one, remains authoritative.
			if (!existsSync(join(resolveClineDir(), "rules", "ponytail.md")))
				api.registerRule({
					id: "avx1-ponytail",
					source: "bundled-ponytail",
					content: () => readFileSync(join(root, "ponytail.md"), "utf8"),
				});
		},
	};
	return { extension, mcpServers };
}
