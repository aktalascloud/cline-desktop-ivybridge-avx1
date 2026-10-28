import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type ChildProcess, spawn } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// No desktop/SDK build or dependency install needed. Exercise the actual hook
// in an x86 NSIS installer against x64 executables, not a mocked process query.
const windows = process.platform === "win32" && process.arch === "x64";
const nsis =
	process.env.MAKENSIS_PATH ?? "C:/Program Files (x86)/NSIS/makensis.exe";
const hook = path.resolve(
	import.meta.dir,
	"../src-tauri/nsis/installer-hooks.nsh",
);
const lockfile = path.resolve(import.meta.dir, "../../../../bun.lock");

// The shipped installer is compiled by the NSIS that tauri-bundler pins
// (NSIS_URL / NSIS_SHA1 in crates/tauri-bundler/src/bundle/windows/nsis/mod.rs
// of the locked @tauri-apps/cli), and desktop-test.yml downloads that same
// archive by hand. Pin both ends here so a Tauri CLI bump, or an edit to the
// workflow's download, fails this suite until the pair is re-checked together.
const TAURI_CLI_VERSION = "2.12.3";
const NSIS_VERSION = "v3.13";
const children: ChildProcess[] = [];
let root: string;
let fixture: string;
let installer: string;
let legacyUninstaller: string | undefined;
let bridgeSerial = 0;

function nsisString(value: string): string {
	return value.replaceAll("$", "$$").replaceAll('"', '$\\"');
}

function machine(exe: string): number {
	const bytes = readFileSync(exe);
	return bytes.readUInt16LE(bytes.readUInt32LE(0x3c) + 4);
}

async function waitFor(check: () => boolean): Promise<void> {
	for (let i = 0; i < 100; i++) {
		if (check()) return;
		await Bun.sleep(50);
	}
	throw new Error("Timed out waiting for fixture process");
}

async function run(
	exe: string,
	args: string[],
	timeoutMs = 90_000,
): Promise<number> {
	const child = spawn(exe, args, {
		cwd: root,
		stdio: ["ignore", "ignore", "inherit"],
		windowsHide: true,
		// NSIS requires /D= and _?= to be LAST and unquoted, even for spaces.
		windowsVerbatimArguments: args.some(
			(arg) => arg.startsWith("/D=") || arg.startsWith("_?="),
		),
	});
	children.push(child);
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await new Promise<number>((resolve, reject) => {
			child.once("error", reject);
			child.once("exit", (code) => resolve(code ?? -1));
			// A missing exit event must not leave this promise pending forever.
			// Force only our child and fail explicitly; never report a timeout as success.
			timer = setTimeout(() => {
				try {
					child.kill("SIGKILL");
				} catch {
					// The test still fails if Windows refuses termination; afterAll retries cleanup.
				}
				reject(
					new Error(
						`Fixture process ${path.basename(exe)} timed out after ${timeoutMs} ms`,
					),
				);
			}, timeoutMs);
		});
	} finally {
		clearTimeout(timer);
	}
}

async function start(dir: string, name: string): Promise<ChildProcess> {
	mkdirSync(dir, { recursive: true });
	const exe = path.join(dir, name);
	if (!existsSync(exe)) copyFileSync(fixture, exe);
	const ready = path.join(root, `ready-${children.length}`);
	const child = spawn(exe, [ready], {
		detached: true,
		windowsHide: true,
		stdio: "ignore",
	});
	children.push(child);
	await waitFor(() => existsSync(ready));
	return child;
}

async function buildLegacyBridge(oldDirectory: string): Promise<string> {
	if (!legacyUninstaller) {
		const oldHook = path.join(root, "original-1.0.7-hook.nsh");
		const original = Bun.spawnSync(
			[
				"git",
				"show",
				"a26a46d2ffa302980ff4cca12eb5af19113d6669:apps/examples/desktop-app/src-tauri/nsis/installer-hooks.nsh",
			],
			{ cwd: path.dirname(lockfile) },
		);
		expect(original.exitCode).toBe(0);
		writeFileSync(oldHook, original.stdout);
		legacyUninstaller = path.join(root, "old-uninstall.exe");
		const seed = path.join(root, "old-seed.exe");
		const script = path.join(root, "old-seed.nsi");
		writeFileSync(
			script,
			`
Unicode true
RequestExecutionLevel user
!include FileFunc.nsh
!define LANG_RUSSIAN 1049
!define AVX1_AUTOSTART_LINK "Cline AVX1 legacy fixture-${process.pid}.lnk"
!include "${nsisString(oldHook)}"
!define MAINBINARYNAME "cline-app"
Name "Old Cline hook fixture"
OutFile "${nsisString(seed)}"
Section
 WriteUninstaller "${nsisString(legacyUninstaller)}"
SectionEnd
Section "Uninstall"
 !insertmacro NSIS_HOOK_PREUNINSTALL
 FileOpen $0 "$INSTDIR\\legacy-uninstall-ran" w
 FileWrite $0 "completed"
 FileClose $0
SectionEnd
`,
		);
		expect(await run(nsis, ["/V2", script])).toBe(0);
		expect(await run(seed, ["/S"])).toBe(0);
	}
	const serial = ++bridgeSerial;
	const bridge = path.join(root, `bridge-${serial}.exe`);
	const script = path.join(root, `bridge-${serial}.nsi`);
	writeFileSync(
		script,
		`
Unicode true
RequestExecutionLevel user
!include FileFunc.nsh
!define LANG_RUSSIAN 1049
!include "${nsisString(hook)}"
!define MAINBINARYNAME "cline-app"
Name "Legacy uninstall transition"
OutFile "${nsisString(bridge)}"
Var UpdateMode
Section
 StrCpy $UpdateMode 0
 !insertmacro AVX1_DETECT_EXISTING_INSTALLATION
 StrCmp $UpdateMode 1 skip_legacy
 ExecWait '"${nsisString(legacyUninstaller)}" /S _?=$INSTDIR' $0
 StrCmp $0 0 skip_legacy
  SetErrorLevel $0
  Quit
 skip_legacy:
 !insertmacro NSIS_HOOK_PREINSTALL
 ClearErrors
 FileOpen $0 "$INSTDIR\\cline-cli.exe" w
 IfErrors 0 +3
  SetErrorLevel 44
  Quit
 FileWrite $0 "replaced"
 FileClose $0
SectionEnd
`,
	);
	expect(await run(nsis, ["/V2", script])).toBe(0);
	return bridge;
}

test("locked Tauri CLI is the version whose NSIS pin this suite mirrors", () => {
	const resolved = readFileSync(lockfile, "utf8").match(
		/"@tauri-apps\/cli": \["@tauri-apps\/cli@([^"]+)"/,
	)?.[1];
	expect(
		resolved,
		`@tauri-apps/cli moved from ${TAURI_CLI_VERSION}; re-read its bundler's NSIS_URL/NSIS_SHA1 and update TAURI_CLI_VERSION, NSIS_VERSION and the download in desktop-test.yml`,
	).toBe(TAURI_CLI_VERSION);
});

test("production template requests UAC without changing current-user installation", () => {
	const directory = path.resolve(import.meta.dir, "../src-tauri/nsis");
	const provenance = JSON.parse(
		readFileSync(path.join(directory, "template-provenance.json"), "utf8"),
	);
	const template = readFileSync(
		path.join(directory, "installer.nsi"),
		"utf8",
	).replaceAll("\r\n", "\n");
	const elevated =
		'!if "${INSTALLMODE}" == "currentUser"\n  RequestExecutionLevel admin';
	expect(template.includes(elevated)).toBe(true);
	expect(template).toContain(
		"  !insertmacro AVX1_DETECT_EXISTING_INSTALLATION\n\n  ; Abort downgrades",
	);
	expect(template).toContain(
		"  ; In update mode, always proceeds without uninstalling\n  ${If} $UpdateMode = 1\n    Goto reinst_done",
	);
	expect(template).toContain(
		"  ${If} $PassiveMode = 1\n  ${OrIf} $UpdateMode = 1\n    Call PageLeaveReinstall",
	);
	const original = template
		.replace(
			"  ${If} $PassiveMode = 1\n  ${OrIf} $UpdateMode = 1\n    Call PageLeaveReinstall",
			"  ${If} $PassiveMode = 1\n    Call PageLeaveReinstall",
		)
		.replace("  !insertmacro AVX1_DETECT_EXISTING_INSTALLATION\n\n", "")
		.replace(
			elevated,
			'!if "${INSTALLMODE}" == "currentUser"\n  RequestExecutionLevel user',
		);
	expect(createHash("sha256").update(original).digest("hex")).toBe(
		provenance.original_sha256,
	);
	expect(provenance.tauri_cli).toBe(TAURI_CLI_VERSION);
	const config = JSON.parse(
		readFileSync(path.join(directory, "../tauri.windows.conf.json"), "utf8"),
	);
	expect(config.bundle.windows.nsis.installMode).toBe("currentUser");
	expect(config.bundle.windows.nsis.template).toBe("nsis/installer.nsi");
});

describe.skipIf(!windows)("Windows installer process cleanup", () => {
	beforeAll(async () => {
		if (!existsSync(nsis))
			throw new Error(`Set MAKENSIS_PATH: not found: ${nsis}`);
		expect(
			Bun.spawnSync([nsis, "/VERSION"]).stdout.toString().trim(),
			`makensis is not the ${NSIS_VERSION} that the locked Tauri CLI bundles installers with`,
		).toBe(NSIS_VERSION);
		root = mkdtempSync(path.join(tmpdir(), "cline-installer-test-"));
		fixture = path.join(root, "fixture.exe");
		const source = path.join(root, "fixture.ts");
		writeFileSync(
			source,
			'import { writeFileSync } from "node:fs"; writeFileSync(process.argv[2], "ready"); setInterval(() => {}, 1000);',
		);
		expect(
			await run(process.execPath, [
				"build",
				"--compile",
				"--target=bun-windows-x64",
				source,
				"--outfile",
				fixture,
			]),
		).toBe(0);
		expect(machine(fixture)).toBe(0x8664);

		installer = path.join(root, "setup.exe");
		const script = path.join(root, "installer.nsi");
		// Match Tauri's ordering: hooks are included BEFORE MAINBINARYNAME is
		// defined. Both hooks must compile and preserve caller registers.
		writeFileSync(
			script,
			`
Unicode true
RequestExecutionLevel user
!include FileFunc.nsh
!define LANG_RUSSIAN 1049
!define AVX1_AUTOSTART_LINK "Cline AVX1 isolated installer test-${process.pid}.lnk"
!include "${nsisString(hook)}"
!define MAINBINARYNAME "cline-app"
Name "Cline cleanup test"
OutFile "${nsisString(installer)}"
Page instfiles
AutoCloseWindow true
Function .onInstFailed
  StrCmp $0 "preserved" +3
    SetErrorLevel 6
    Return
  Pop $0
  StrCmp $0 "sentinel" +2
    SetErrorLevel 7
FunctionEnd
Section
  Push "sentinel"
  StrCpy $0 "preserved"
  !insertmacro NSIS_HOOK_PREINSTALL
  StrCmp $0 "preserved" +3
    SetErrorLevel 3
    Quit
  CreateDirectory "$INSTDIR"
  ClearErrors
  FileOpen $0 "$INSTDIR\\cline-cli.exe" w
  IfErrors 0 +3
    SetErrorLevel 4
    Quit
  FileWrite $0 "replaced"
  FileClose $0
  WriteUninstaller "$INSTDIR\\uninstall.exe"
  Pop $0
SectionEnd
Section "Uninstall"
  !insertmacro NSIS_HOOK_PREUNINSTALL
  ClearErrors
  Delete "$INSTDIR\\cline-cli.exe"
  Delete "$INSTDIR\\cline-app.exe"
  IfErrors 0 +2
    SetErrorLevel 5
SectionEnd
`,
		);
		expect(await run(nsis, ["/V2", script])).toBe(0);
		expect(machine(installer)).toBe(0x14c);
	}, 120_000);

	afterAll(async () => {
		for (const child of children) {
			if (child.exitCode === null && child.signalCode === null)
				child.kill("SIGKILL");
		}
		await waitFor(() =>
			children.every((p) => p.exitCode !== null || p.signalCode !== null),
		);
		if (root)
			rmSync(root, {
				recursive: true,
				force: true,
				maxRetries: 10,
				retryDelay: 100,
			});
	});

	test("fails a stalled owned child instead of waiting forever for its exit event", async () => {
		await expect(
			run(fixture, [path.join(root, "timeout-ready")], 1_000),
		).rejects.toThrow("timed out after 1000 ms");
	}, 10_000);

	test("first install and repeated cleanup succeed with no running processes", async () => {
		const dir = path.join(root, "fresh install");
		expect(await run(installer, ["/S", `/D=${dir}`])).toBe(0);
		expect(await run(installer, ["/S", `/D=${dir}`])).toBe(0);
		expect(readFileSync(path.join(dir, "cline-cli.exe"), "utf8")).toBe(
			"replaced",
		);
	}, 120_000);

	test("automatically closes the exact install processes and preserves another install", async () => {
		const dir = path.join(root, "Cline 'quoted' $ space (测试)");
		const beta = await start(`${dir} Beta`, "cline-cli.exe");
		const targets = [
			await start(dir, "cline-app.exe"),
			await start(dir, "cline-cli.exe"),
			await start(dir, "cline-cli.exe"),
		];
		// Windows must actually have the executable locked before the test.
		expect(() =>
			writeFileSync(path.join(dir, "cline-cli.exe"), "locked"),
		).toThrow();
		expect(await run(installer, ["/S", `/D=${dir}`])).toBe(0);
		await waitFor(() =>
			targets.every((p) => p.exitCode !== null || p.signalCode !== null),
		);
		expect(await run(installer, ["/S", `/D=${dir}`])).toBe(0);
		expect(readFileSync(path.join(dir, "cline-cli.exe"), "utf8")).toBe(
			"replaced",
		);
		expect(beta.exitCode).toBeNull();
		expect(beta.signalCode).toBeNull();
	}, 120_000);

	test("uninstaller closes its busy runtime before deleting files", async () => {
		const dir = path.join(root, "uninstall");
		expect(await run(installer, ["/S", `/D=${dir}`])).toBe(0);
		copyFileSync(fixture, path.join(dir, "cline-cli.exe"));
		const target = await start(dir, "cline-cli.exe");
		// _?= disables NSIS's temp-copy trampoline so we wait for the real exit.
		expect(
			await run(path.join(dir, "uninstall.exe"), ["/S", `_?=${dir}`]),
		).toBe(0);
		await waitFor(() => target.exitCode !== null || target.signalCode !== null);
		expect(
			await run(path.join(dir, "uninstall.exe"), ["/S", `_?=${dir}`]),
		).toBe(0);
		expect(existsSync(path.join(dir, "cline-cli.exe"))).toBe(false);
	}, 120_000);

	test("installs with only a hidden Hub running and preserves unrelated files", async () => {
		const dir = path.join(root, "hidden Hub only");
		const hub = await start(dir, "cline-cli.exe");
		writeFileSync(path.join(dir, "user-state.json"), "preserved");
		expect(await run(installer, ["/S", `/D=${dir}`])).toBe(0);
		await waitFor(() => hub.exitCode !== null || hub.signalCode !== null);
		expect(readFileSync(path.join(dir, "user-state.json"), "utf8")).toBe(
			"preserved",
		);
	}, 120_000);

	test("closes only this installation's hidden DSW2API runtime", async () => {
		const dir = path.join(root, "DSW runtime");
		const runtime = path.join(dir, "bin", "dsw2api", "runtime");
		const worker = await start(runtime, "pythonw.exe");
		const other = await start(
			path.join(root, "other DSW runtime"),
			"pythonw.exe",
		);
		expect(await run(installer, ["/S", `/D=${dir}`])).toBe(0);
		await waitFor(() => worker.exitCode !== null || worker.signalCode !== null);
		expect(other.exitCode).toBeNull();
	}, 120_000);

	test("closes the exact native browser bridge while preserving another installation", async () => {
		const dir = path.join(root, "browser bridge");
		const worker = await start(
			path.join(dir, "bin", "browser-bridge"),
			"native-host.exe",
		);
		const other = await start(
			path.join(root, "other browser bridge"),
			"native-host.exe",
		);
		expect(await run(installer, ["/S", `/D=${dir}`])).toBe(0);
		await waitFor(() => worker.exitCode !== null || worker.signalCode !== null);
		expect(other.exitCode).toBeNull();
	}, 120_000);

	test("upgrade automatically closes the earlier backend before removing it", async () => {
		const dir = path.join(root, "upgrade");
		const legacy = await start(dir, "code-sidecar.exe");
		expect(await run(installer, ["/S", `/D=${dir}`])).toBe(0);
		await waitFor(() => legacy.exitCode !== null || legacy.signalCode !== null);
		expect(await run(installer, ["/S", `/D=${dir}`])).toBe(0);
		expect(existsSync(path.join(dir, "code-sidecar.exe"))).toBe(false);
		expect(readFileSync(path.join(dir, "cline-cli.exe"), "utf8")).toBe(
			"replaced",
		);
	}, 120_000);

	test("updates over the real 1.0.7 hidden-Hub guard without invoking its uninstaller", async () => {
		const old = path.join(root, "legacy 'quoted' $ space (测试)");
		const owner = await start(old, "cline-cli.exe");
		copyFileSync(fixture, path.join(old, "cline-app.exe"));
		const beta = await start(`${old} Beta`, "cline-cli.exe");
		writeFileSync(path.join(old, "user-state.json"), "kept");
		const bridge = await buildLegacyBridge(old);
		expect(await run(legacyUninstaller!, ["/S", `_?=${old}`])).toBe(2);
		expect(owner.exitCode).toBeNull();
		expect(await run(bridge, ["/S", `/D=${old}`])).toBe(0);
		await waitFor(() => owner.exitCode !== null || owner.signalCode !== null);
		expect(existsSync(path.join(old, "legacy-uninstall-ran"))).toBe(false);
		expect(readFileSync(path.join(old, "user-state.json"), "utf8")).toBe(
			"kept",
		);
		expect(readFileSync(path.join(old, "cline-cli.exe"), "utf8")).toBe(
			"replaced",
		);
		expect(beta.exitCode).toBeNull();
	}, 120_000);

	test("keeps fresh installs separate from in-place update detection", async () => {
		const probe = path.join(root, "mode-probe.exe");
		const script = path.join(root, "mode-probe.nsi");
		writeFileSync(
			script,
			`
Unicode true
RequestExecutionLevel user
!include FileFunc.nsh
!define LANG_RUSSIAN 1049
!include "${nsisString(hook)}"
!define MAINBINARYNAME "cline-app"
Var UpdateMode
Name "Update mode probe"
OutFile "${nsisString(probe)}"
Section
 StrCpy $UpdateMode 0
 !insertmacro AVX1_DETECT_EXISTING_INSTALLATION
 CreateDirectory "$INSTDIR"
 FileOpen $0 "$INSTDIR\\mode" w
 FileWrite $0 "$UpdateMode"
 FileClose $0
SectionEnd
`,
		);
		expect(await run(nsis, ["/V2", script])).toBe(0);
		const dir = path.join(root, "mode probe");
		expect(await run(probe, ["/S", `/D=${dir}`])).toBe(0);
		expect(readFileSync(path.join(dir, "mode"), "utf8")).toBe("0");
		copyFileSync(fixture, path.join(dir, "cline-app.exe"));
		expect(await run(probe, ["/S", `/D=${dir}`])).toBe(0);
		expect(readFileSync(path.join(dir, "mode"), "utf8")).toBe("1");
	}, 120_000);

	// Only silent mode is automatable: passive (/P, what the Tauri updater
	// uses) and interactive installs show a Retry/Cancel dialog here instead.
	test("silent install fails closed without a write on Restart Manager error", async () => {
		const dir = path.join(root, "failure");
		// RmRegisterResources rejects directories with ERROR_ACCESS_DENIED.
		// This exercises a real native error, not an injected API mock.
		mkdirSync(path.join(dir, "cline-app.exe"), { recursive: true });
		writeFileSync(path.join(dir, "cline-cli.exe"), "untouched");
		expect(await run(installer, ["/S", `/D=${dir}`])).toBe(2);
		expect(readFileSync(path.join(dir, "cline-cli.exe"), "utf8")).toBe(
			"untouched",
		);
		expect(existsSync(path.join(dir, "uninstall.exe"))).toBe(false);
	}, 120_000);
});
