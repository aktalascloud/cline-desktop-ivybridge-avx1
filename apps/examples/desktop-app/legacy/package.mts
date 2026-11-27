import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { generateNotices } from "../../../../scripts/third-party-notices/index";
import {
	inputListPath,
	recordWebviewInputs,
} from "../scripts/third-party-notices";

const legacy = import.meta.dir;
const desktop = resolve(legacy, "..");
const root = resolve(desktop, "../../..");
const [electronDir, makensisExe, outputDir] = process.argv
	.slice(2)
	.map((arg) => resolve(arg));
if (!electronDir || !makensisExe || !outputDir) {
	throw new Error(
		"Usage: bun package.mts <Electron Legacy folder> <makensis.exe> <output folder>",
	);
}
const electronVersion = readFileSync(join(electronDir, "version"), "utf8")
	.trim()
	.replace(/^v/, "");
if (electronVersion !== "44.11.5")
	throw new Error("Expected Electron Legacy 44.11.5 x64");
for (const file of ["electron.exe", "winwrap.dll"]) {
	if (!existsSync(join(electronDir, file)))
		throw new Error(`Missing Electron Legacy file: ${file}`);
}
if (
	!readFileSync(join(electronDir, "electron.exe"))
		.subarray(0, 4096)
		.includes(Buffer.from([0x50, 0x45, 0, 0, 0x64, 0x86]))
) {
	throw new Error("Expected an x64 Electron executable");
}

const scratch = mkdtempSync(join(tmpdir(), "cline-legacy-"));
function run(args: string[]) {
	const result = Bun.spawnSync(args, {
		cwd: root,
		stdio: ["ignore", "inherit", "inherit"],
	});
	if (!result.success)
		throw new Error(`Failed: ${args[0]} (${result.exitCode})`);
}

function uninstallPlan(directory: string, stage: string): string[] {
	const relativePath = relative(stage, directory);
	const commands = readdirSync(directory, { withFileTypes: true }).flatMap(
		(item) => {
			const path = join(directory, item.name);
			if (item.isDirectory()) return uninstallPlan(path, stage);
			const escaped = relative(stage, path).replaceAll("$", "$$");
			return [`Delete "$INSTDIR\\${escaped}"`];
		},
	);
	if (relativePath)
		commands.push(`RMDir "$INSTDIR\\${relativePath.replaceAll("$", "$$")}"`);
	return commands;
}

try {
	const stage = join(scratch, "stage");
	cpSync(electronDir, stage, {
		recursive: true,
		filter: (source) => {
			const path = relative(electronDir, source).replaceAll("\\", "/");
			return (
				path !== "resources/app" &&
				(!path.startsWith("locales/") ||
					/^locales\/(en-US|ru)\.pak$/.test(path))
			);
		},
	});
	renameSync(join(stage, "electron.exe"), join(stage, "ClineLegacy.exe"));
	const app = join(stage, "resources", "app");
	const runtime = join(app, "runtime");
	const defaults = join(stage, "bin", "defaults");
	mkdirSync(app, { recursive: true });
	mkdirSync(defaults, { recursive: true });
	cpSync(join(root, "fork/defaults/freellm.json"), join(defaults, "freellm.json"));
	for (const name of ["main.cjs", "preload.cjs", "package.json"]) {
		cpSync(join(legacy, name), join(app, name));
	}
	cpSync(join(desktop, "src-tauri/icons/icon.ico"), join(app, "icon.ico"));
	cpSync(join(root, "LICENSE"), join(app, "LICENSE.Cline"));
	recordWebviewInputs();
	cpSync(join(desktop, "webview/out"), join(app, "web"), { recursive: true });
	const bundle = await Bun.build({
		entrypoints: [join(desktop, "sidecar/index.ts"), join(legacy, "hub.ts")],
		root: desktop,
		outdir: runtime,
		target: "node",
		format: "esm",
		minify: true,
		splitting: true,
		naming: { entry: "[dir]/[name].mjs", chunk: "chunks/[name]-[hash].mjs" },
		define: { "process.env.NODE_ENV": '"production"' },
		external: ["@anthropic-ai/vertex-sdk"],
		metafile: true,
	});
	if (!bundle.success)
		throw new AggregateError(bundle.logs, "Cline runtime build failed");
	const core = join(root, "sdk/packages/core/dist");
	cpSync(join(core, "plugin-runtime"), join(runtime, "plugin-runtime"), {
		recursive: true,
	});
	// License texts for Electron and Chromium stay beside ClineLegacy.exe.
	generateNotices({
		product: "Cline Desktop Legacy",
		baseDir: root,
		inputs: Object.keys(bundle.metafile?.inputs ?? {}),
		inputLists: {
			webview: inputListPath("webview"),
			"plugin runtime": join(core, "plugin-runtime-inputs.json"),
		},
		outFile: join(app, "THIRD_PARTY_NOTICES.txt"),
	});
	const uninstall = join(scratch, "uninstall.nsh");
	writeFileSync(uninstall, uninstallPlan(stage, stage).join("\r\n") + "\r\n");
	const { version } = JSON.parse(readFileSync(join(legacy, "package.json"), "utf8"));
	const target = join(scratch, `Cline_${version}_x64-setup.exe`);
	run([
		makensisExe,
		"/V2",
		`/DCLINE_STAGE=${stage}`,
		`/DCLINE_INSTALLER=${target}`,
		`/DCLINE_DISPLAY_VERSION=${version}`,
		`/DCLINE_UNINSTALL_FILES=${uninstall}`,
		join(legacy, "installer.nsi"),
	]);
	mkdirSync(outputDir, { recursive: true });
	cpSync(target, join(outputDir, basename(target)));
	console.log(join(outputDir, basename(target)));
} finally {
	rmSync(scratch, { recursive: true, force: true });
}
