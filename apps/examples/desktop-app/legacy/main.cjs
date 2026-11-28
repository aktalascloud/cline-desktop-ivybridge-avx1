const {
	app,
	BrowserWindow,
	dialog,
	ipcMain,
	net,
	protocol,
	shell,
} = require("electron");
const { fork } = require("node:child_process");
const { existsSync, mkdirSync, writeFileSync } = require("node:fs");
const { createServer } = require("node:net");
const { dirname, join, resolve, sep } = require("node:path");
const { pathToFileURL } = require("node:url");

const startedAt = performance.now();
const timings = {};
const origin = "cline://desktop";
const webRoot = join(__dirname, "web");
const runtimeRoot = join(__dirname, "runtime");
const stateRoot = join(app.getPath("appData"), "Cline Desktop Legacy");
const smokeFlag = process.argv.find((arg) => arg.startsWith("--smoke-test="));
const smokeOutput = smokeFlag?.slice("--smoke-test=".length);
const serialSmoke = Boolean(
	smokeOutput && process.argv.includes("--serial-startup"),
);
const profileSwitch = Boolean(
	smokeOutput && process.argv.includes("--profile-switch"),
);
let backendEndpoint;
app.setPath(
	"userData",
	smokeOutput ? join(dirname(resolve(smokeOutput)), "profile") : stateRoot,
);
app.setAppUserModelId("bot.cline.app.legacy");
app.commandLine.appendSwitch("disk-cache-size", "33554432");
protocol.registerSchemesAsPrivileged([
	{
		scheme: "cline",
		privileges: {
			standard: true,
			secure: true,
			supportFetchAPI: true,
			corsEnabled: true,
			codeCache: true,
		},
	},
]);

let window;
let backend;
let quitting = false;

function isAppUrl(rawUrl) {
	try {
		const url = new URL(rawUrl);
		return (
			url.protocol === "cline:" &&
			url.host === "desktop" &&
			!url.username &&
			!url.password
		);
	} catch {
		return false;
	}
}

function openExternal(rawUrl) {
	const url = new URL(rawUrl);
	if (!["https:", "http:", "mailto:"].includes(url.protocol)) {
		throw new Error("Unsupported external URL");
	}
	return shell.openExternal(url.href);
}

function serveWeb(request) {
	if (!isAppUrl(request.url) || request.method !== "GET") {
		return new Response("Forbidden", { status: 403 });
	}
	try {
		const url = new URL(request.url);
		const path = decodeURIComponent(url.pathname);
		if (path.includes("\\") || path.includes("\0") || path.includes(":")) {
			return new Response("Forbidden", { status: 403 });
		}
		const candidate = resolve(webRoot, "." + path);
		if (candidate !== webRoot && !candidate.startsWith(webRoot + sep)) {
			return new Response("Forbidden", { status: 403 });
		}
		const candidates = path.endsWith("/")
			? [join(candidate, "index.html"), candidate + ".html"]
			: [candidate, candidate + ".html", join(candidate, "index.html")];
		return (async () => {
			for (const file of candidates) {
				if (!existsSync(file)) continue;
				try {
					return await net.fetch(pathToFileURL(file).href);
				} catch {
					// Try the exported .html entry when the matching path is a directory.
				}
			}
			return new Response("Not found", { status: 404 });
		})();
	} catch {
		return new Response("Invalid URL", { status: 400 });
	}
}

function freeLoopbackPort() {
	return new Promise((resolvePort, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const { port } = server.address();
			server.close((error) => (error ? reject(error) : resolvePort(port)));
		});
	});
}

async function startBackend() {
	const profile = app.getPath("userData");
	const documents = app.getPath("documents");
	const workspace =
		smokeOutput || !existsSync(documents)
			? join(profile, "workspace")
			: documents;
	mkdirSync(workspace, { recursive: true });
	const hubPort = smokeOutput
		? await freeLoopbackPort()
		: process.env.CLINE_LEGACY_HUB_PORT || "25473";
	const sidecar = fork(join(runtimeRoot, "sidecar", "index.mjs"), [], {
		execPath: process.execPath,
		cwd: runtimeRoot,
		execArgv: [],
		windowsHide: true,
		stdio: ["ignore", "ignore", "pipe", "ipc"],
		env: {
			...process.env,
			ELECTRON_RUN_AS_NODE: "1",
			CLINE_DIR: join(profile, "cline"),
			CLINE_DATA_DIR: join(profile, "cline", "data"),
			CLINE_HUB_DISCOVERY_PATH: join(profile, "hub-discovery.json"),
			CLINE_HUB_HOST: "127.0.0.1",
			CLINE_HUB_PORT: "",
			CLINE_LEGACY_HUB_PORT: String(hubPort),
			CLINE_HUB_PATHNAME: "/hub",
			CLINE_SIDECAR_HOST: "127.0.0.1",
			CLINE_LEGACY_APP_ORIGIN: origin,
			CLINE_LEGACY_APP_VERSION: app.getVersion(),
			CLINE_LEGACY_RUNTIME_ROOT: join(runtimeRoot, "legacy"),
			CLINE_PLUGIN_RUNTIME_DIR: join(runtimeRoot, "plugin-runtime"),
			CLINE_SIDECAR_TRUSTED_ORIGINS: origin,
			CLINE_DESKTOP_WORKSPACE_ROOT: workspace,
			CLINE_NO_AUTO_UPDATE: "1",
			UV_THREADPOOL_SIZE: "2",
		},
	});
	backend = sidecar;
	let stderr = "";
	sidecar.stderr.on("data", (data) => {
		stderr = (stderr + data).slice(-4096);
	});
	return new Promise((resolveReady, reject) => {
		const timer = setTimeout(() => {
			sidecar.kill();
			reject(new Error("The Cline backend did not start in 90 seconds."));
		}, 90_000);
		sidecar.once("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
		sidecar.once("exit", (code) => {
			clearTimeout(timer);
			const error = new Error(
				`Cline backend exited (${code}). ${stderr.trim()}`,
			);
			reject(error);
			if (window && !quitting && !smokeOutput) {
				dialog.showErrorBox("Cline Desktop Legacy", error.message);
				app.quit();
			}
		});
		sidecar.on("message", (message) => {
			if (message?.type !== "ready" || typeof message.wsEndpoint !== "string")
				return;
			clearTimeout(timer);
			resolveReady(message.wsEndpoint);
		});
	});
}

ipcMain.handle("cline:native", async (event, command, args) => {
	if (
		event.sender !== window?.webContents ||
		!event.senderFrame ||
		event.senderFrame.parent ||
		!isAppUrl(event.senderFrame.url)
	) {
		throw new Error("Invalid Cline window");
	}
	switch (command) {
		case "get_desktop_backend_endpoint":
			return backendEndpoint;
		case "pick_workspace_directory": {
			const { filePaths } = await dialog.showOpenDialog(window, {
				defaultPath:
					typeof args?.initialPath === "string" ? args.initialPath : undefined,
				properties: ["openDirectory"],
			});
			return filePaths[0] ?? null;
		}
		case "open_third_party_notices":
			return shell.openPath(join(__dirname, "THIRD_PARTY_NOTICES.txt"));
		case "open_external_url":
			return openExternal(args?.url);
		case "relaunch_app":
			app.relaunch();
			app.quit();
			return;
		case "quit_app":
			app.quit();
			return;
		default:
			throw new Error("Unsupported native command");
	}
});

async function runSmokeTest() {
	return window.webContents.executeJavaScript(`window.clineLegacy.invoke("get_desktop_backend_endpoint").then(endpoint => new Promise((resolve, reject) => {
		const socket = new WebSocket(endpoint);
		const timer = setTimeout(() => { socket.close(); reject(Error("Hub smoke test timed out")); }, 60000);
		const replies = new Map();
		const request = (id, command, args) => socket.send(JSON.stringify({ type: "command", id, command, args }));
		let started = false;
		socket.onerror = () => { clearTimeout(timer); reject(Error("Could not connect to backend")); };
		socket.onmessage = ({data}) => {
			const message = JSON.parse(data);
			if (message.event?.name === "hub_status") {
				if (message.event.payload.state === "failed") {
					clearTimeout(timer);
					socket.close();
					reject(Error(message.event.payload.error ?? "Hub startup failed"));
				}
				if (message.event.payload.state === "ready" && !started) {
					started = true;
					request("codexUsage", "get_codex_usage");
					request("version", "get_process_context");
					request("compaction", "get_compaction_settings");
					request("models", "list_provider_models", { provider: "freellm" });
				}
			}
			if (message.type !== "response") return;
			if (!message.ok) {
				clearTimeout(timer);
				socket.close();
				reject(Error(message.error));
				return;
			}
			replies.set(message.id, message.result);
			if (replies.size === 4) {
				clearTimeout(timer);
				socket.close();
				resolve({
					title: document.title,
					language: document.documentElement.lang,
					sidecar: true,
					hub: true,
					renderer: Boolean(document.querySelector("main,button")),
					version: replies.get("version")?.appVersion,
					compaction: replies.get("compaction"),
					codexSignedOut: replies.get("codexUsage") === null,
					models: replies.get("models")?.models?.map(model => model.id),
				});
			}
		};
	}))`);
}

async function measureSettingsSwitch(webContents) {
	await webContents.executeJavaScript(`localStorage.setItem(
		"cline.code.onboarding.v1", JSON.stringify({ completedAt: new Date().toISOString() })
	)`);
	await window.loadURL(origin + "/");
	const withIntent = process.argv.includes("--settings-intent");
	return webContents.executeJavaScript(`(async () => {
		const selector = '[data-legacy-settings-button]';
		const deadline = performance.now() + 5000;
		let button;
		while (!(button = document.querySelector(selector)) && performance.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
		if (!button) return null;
		if (${withIntent}) {
			button.focus();
			await new Promise((resolve) => setTimeout(resolve, 300));
		}
		const started = performance.now();
		const frames = [];
		let previous = started;
		let mountedAt;
		const observer = new MutationObserver(() => {
			if (document.querySelector('.cline-settings-content')) {
				mountedAt = performance.now() - started;
				observer.disconnect();
			}
		});
		observer.observe(document.body, { childList: true, subtree: true });
		let frameId;
		function recordFrame() {
			const now = performance.now();
			frames.push(now - previous);
			previous = now;
			frameId = requestAnimationFrame(recordFrame);
		}
		frameId = requestAnimationFrame(recordFrame);
		button.click();
		await new Promise((resolve) => setTimeout(resolve, 1500));
		cancelAnimationFrame(frameId);
		observer.disconnect();
		return {
			withIntent: ${withIntent},
			mountedMs: mountedAt ?? null,
			frameCount: frames.length,
			over34ms: frames.filter((ms) => ms > 34).length,
			maxFrameMs: frames.length ? Math.max(...frames) : null,
		};
	})()`);
}

async function start() {
	protocol.handle("cline", serveWeb);
	timings.electronReady = performance.now() - startedAt;
	backendEndpoint = startBackend().then((endpoint) => {
		timings.sidecarReady = performance.now() - startedAt;
		return endpoint;
	});
	// Observe early startup failures even when the renderer fails independently.
	void backendEndpoint.catch(() => {});
	if (serialSmoke) await backendEndpoint;
	window = new BrowserWindow({
		width: 1080,
		height: 700,
		minWidth: 640,
		minHeight: 440,
		show: !smokeOutput,
		title: "Cline Desktop Legacy",
		autoHideMenuBar: true,
		icon: join(__dirname, "icon.ico"),
		webPreferences: {
			preload: join(__dirname, "preload.cjs"),
			sandbox: true,
			contextIsolation: true,
			nodeIntegration: false,
			backgroundThrottling: !profileSwitch,
			offscreen: profileSwitch,
		},
	});
	window.webContents.on("will-navigate", (event, url) => {
		if (!isAppUrl(url)) event.preventDefault();
	});
	window.webContents.on("will-attach-webview", (event) =>
		event.preventDefault(),
	);
	window.webContents.setWindowOpenHandler(({ url }) => {
		if (!isAppUrl(url)) void openExternal(url).catch(() => {});
		return { action: "deny" };
	});
	const pageLoaded = window.loadURL(origin + "/").then(() => {
		timings.pageLoaded = performance.now() - startedAt;
	});
	await Promise.all([pageLoaded, backendEndpoint]);
	if (smokeOutput) {
		const result = await runSmokeTest();
		timings.hubChecked = performance.now() - startedAt;
		const switchTiming = profileSwitch
			? await measureSettingsSwitch(window.webContents)
			: undefined;
		writeFileSync(
			smokeOutput,
			JSON.stringify(
				{ ...result, timings, switchTiming, versions: process.versions },
				null,
				2,
			),
		);
		app.quit();
	}
}

if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	mkdirSync(app.getPath("userData"), { recursive: true });
	app.on("second-instance", () => {
		if (!window) return;
		if (window.isMinimized()) window.restore();
		window.focus();
	});
	app.on("before-quit", (event) => {
		if (quitting || !backend?.connected) return;
		event.preventDefault();
		quitting = true;
		const grace = setTimeout(() => {
			backend.kill();
			app.quit();
		}, 6_000);
		backend.once("exit", () => {
			clearTimeout(grace);
			app.quit();
		});
		backend.disconnect();
	});
	app.on("window-all-closed", () => app.quit());
	app
		.whenReady()
		.then(start)
		.catch((error) => {
			if (smokeOutput) {
				writeFileSync(
					smokeOutput,
					JSON.stringify({ error: error.message }, null, 2),
				);
			} else {
				dialog.showErrorBox("Cline Desktop Legacy", error.message);
			}
			app.quit();
		});
}
