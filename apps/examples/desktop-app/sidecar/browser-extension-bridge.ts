import {
	mkdir,
	readdir,
	readFile,
	writeFile,
	rename,
	unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { getManagedDsw2Api, ProviderSettingsManager } from "@cline/core";

export function browserBridgeDirectory() {
	return join(
		process.env.LOCALAPPDATA || join(homedir(), "AppData/Local"),
		"cloud.aktalas.cline.desktop.avx1.ru",
		"browser-bridge",
	);
}
function unprotect(data: Buffer): Promise<Buffer> {
	const script =
		"$ProgressPreference='SilentlyContinue';Add-Type -AssemblyName System.Security;$m=New-Object IO.MemoryStream;[Console]::OpenStandardInput().CopyTo($m);$b=[Security.Cryptography.ProtectedData]::Unprotect($m.ToArray(),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::OpenStandardOutput().Write($b,0,$b.Length)";
	return new Promise((resolve, reject) => {
		const child = spawn(
			join(
				process.env.SystemRoot || "C:/Windows",
				"System32/WindowsPowerShell/v1.0/powershell.exe",
			),
			[
				"-NoProfile",
				"-NonInteractive",
				"-EncodedCommand",
				Buffer.from(script, "utf16le").toString("base64"),
			],
			{ windowsHide: true, stdio: ["pipe", "pipe", "ignore"] },
		);
		let size = 0;
		const chunks: Buffer[] = [];
		child.stdout.on("data", (chunk) => {
			size += chunk.length;
			if (size > 131072) child.kill();
			else chunks.push(chunk);
		});
		child.on("error", () => reject(Error("Session protection failed")));
		child.on("close", (code) =>
			code === 0
				? resolve(Buffer.concat(chunks))
				: reject(Error("Session protection failed")),
		);
		child.stdin.end(data);
	});
}
let started = false;
export async function startBrowserExtensionBridge() {
	if (started || process.platform !== "win32") return;
	started = true;
	let busy = false;
	const command =
		"[int]([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)";
	try {
		const value = await promisify(execFile)(
			join(
				process.env.SystemRoot || "C:/Windows",
				"System32/WindowsPowerShell/v1.0/powershell.exe",
			),
			[
				"-NoProfile",
				"-NonInteractive",
				"-EncodedCommand",
				Buffer.from(command, "utf16le").toString("base64"),
			],
			{ windowsHide: true },
		);
		if (value.stdout.trim() !== "1") return;
	} catch {
		return;
	}
	const directory = join(browserBridgeDirectory(), "inbox");
	const timer = setInterval(async () => {
		if (busy) return;
		busy = true;
		try {
			await mkdir(directory, { recursive: true });
			for (const name of await readdir(directory)) {
				if (!/^[0-9a-f-]{36}\.enc$/.test(name)) continue;
				const source = join(directory, name),
					claim = source + ".processing";
				try {
					await rename(source, claim);
				} catch {
					continue;
				}
				let result: { ok: boolean; code?: string } = {
					ok: false,
					code: "SESSION_VERIFICATION_FAILED",
				};
				try {
					const encrypted = await readFile(claim);
					if (encrypted.length > 262144) throw Error("Invalid session");
					const raw = await unprotect(encrypted);
					const value = JSON.parse(raw.toString("utf8"));
					raw.fill(0);
					if (value.action === "status") {
						const status = await getManagedDsw2Api().status();
						result = { ok: status.configured && status.running };
					} else {
						if (
							value.action !== "connect" ||
							value.origin !== "https://chat.deepseek.com" ||
							typeof value.token !== "string" ||
							!value.token.trim() ||
							/[\r\n]/.test(value.token) ||
							value.token.length > 16384 ||
							typeof value.cookies !== "string" ||
							value.cookies.length > 65536 ||
							/[\r\n]/.test(value.cookies)
						)
							throw Error("Invalid session");
						const status = await getManagedDsw2Api().configure(
							new ProviderSettingsManager(),
							value.token,
							value.cookies,
						);
						value.token = "";
						value.cookies = "";
						result = { ok: status.configured && status.running };
					}
				} catch {
				} finally {
					await unlink(claim).catch(() => {});
				}
				const target = join(directory, name.replace(/\.enc$/, ".result"));
				await writeFile(target + ".tmp", JSON.stringify(result), {
					flag: "wx",
				});
				await rename(target + ".tmp", target);
			}
		} catch {
		} finally {
			busy = false;
		}
	}, 1000);
	timer.unref();
}

export async function prepareBrowserExtension() {
	const { dirname } = await import("node:path");
	const root = dirname(process.env.CLINE_DESKTOP_CLI_PATH || process.execPath);
	const directory = join(root, "bin/browser-bridge"),
		host = join(directory, "native-host.exe");
	await mkdir(browserBridgeDirectory(), { recursive: true });
	const manifest = join(browserBridgeDirectory(), "native-host.json");
	await writeFile(
		manifest,
		JSON.stringify({
			name: "cloud.aktalas.cline_dsw",
			description: "Cline DeepSeek session bridge",
			path: host,
			type: "stdio",
			allowed_origins: ["chrome-extension://jaljomgoclehkemckjhifflhmlllfopc/"],
		}),
	);
	for (const browser of [
		"BraveSoftware\\Brave-Browser",
		"Google\\Chrome",
		"Microsoft\\Edge",
	])
		await promisify(execFile)(
			join(process.env.SystemRoot || "C:/Windows", "System32/reg.exe"),
			[
				"add",
				"HKCU\\Software\\" +
					browser +
					"\\NativeMessagingHosts\\cloud.aktalas.cline_dsw",
				"/ve",
				"/t",
				"REG_SZ",
				"/d",
				manifest,
				"/f",
			],
			{ windowsHide: true },
		);
	return {
		extensionId: "jaljomgoclehkemckjhifflhmlllfopc",
		extensionFolder: join(directory, "extension"),
		connectUrl:
			"chrome-extension://jaljomgoclehkemckjhifflhmlllfopc/connect.html",
	};
}

export async function openBrowserExtension() {
	const setup = await prepareBrowserExtension();
	const code =
		"$prog=(Get-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice').ProgId;(Get-Item -LiteralPath ('Registry::HKEY_CLASSES_ROOT\\'+$prog+'\\shell\\open\\command')).GetValue('')";
	const value = await promisify(execFile)(
		join(
			process.env.SystemRoot || "C:/Windows",
			"System32/WindowsPowerShell/v1.0/powershell.exe",
		),
		[
			"-NoProfile",
			"-NonInteractive",
			"-EncodedCommand",
			Buffer.from(code, "utf16le").toString("base64"),
		],
		{ windowsHide: true },
	);
	const executable = /^"([^"]+\.exe)"/i.exec(value.stdout.trim())?.[1];
	if (!executable) throw Error("Default browser is unavailable");
	const child = spawn(executable, [setup.connectUrl], {
		windowsHide: false,
		stdio: "ignore",
		detached: true,
	});
	child.unref();
	return setup;
}
