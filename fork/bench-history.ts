/** Synthetic history discovery benchmark. No provider, network or agent turn. */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { dlopen, FFIType, ptr } from "bun:ffi";

const directory = process.env.AVX1_BENCH_DIR;
if (!directory || process.platform !== "win32")
	throw new Error("A private AVX1_BENCH_DIR on Windows is required");
mkdirSync(directory, { recursive: true });
process.env.CLINE_DIR = directory;
process.env.CLINE_DATA_DIR = join(directory, "data");
process.env.CLINE_NO_AUTO_UPDATE = "1";
const { SqliteSessionStore } = await import(
	Bun.resolveSync(
		"@cline/core",
		join(import.meta.dir, "../apps/examples/desktop-app/sidecar/session-data"),
	)
);
const { discoverChatSessions } = await import(
	"../apps/examples/desktop-app/sidecar/session-data/discovery"
);
const kernel = dlopen("kernel32.dll", {
	GetCurrentProcessId: { args: [], returns: FFIType.u32 },
	OpenProcess: {
		args: [FFIType.u32, FFIType.bool, FFIType.u32],
		returns: FFIType.ptr,
	},
	GetProcessHandleCount: {
		args: [FFIType.ptr, FFIType.ptr],
		returns: FFIType.bool,
	},
	CloseHandle: { args: [FFIType.ptr], returns: FFIType.bool },
});
const handle = kernel.symbols.OpenProcess(
	0x1000,
	false,
	kernel.symbols.GetCurrentProcessId(),
);
if (!handle) throw new Error("Cannot query benchmark process handles");
const handleCount = () => {
	const value = new Uint32Array(1);
	if (!kernel.symbols.GetProcessHandleCount(handle, ptr(value)))
		throw new Error("Handle query failed");
	return value[0];
};
const sessions = 250,
	iterations = 100;
const liveSessions = new Map();
const store = new SqliteSessionStore();
store.run("BEGIN");
for (let i = 0; i < sessions; i++) {
	const id = `fixture-${i}`;
	store.create({
		sessionId: id,
		source: "desktop",
		pid: 0,
		startedAt: "2026-01-01T00:00:00.000Z",
		status: "completed",
		interactive: true,
		provider: "fixture",
		model: "fixture",
		cwd: directory,
		workspaceRoot: directory,
		enableTools: true,
		enableSpawn: false,
		enableTeams: false,
		isSubagent: false,
		prompt: `Synthetic task ${i}`,
	} as never);
	liveSessions.set(id, {
		busy: false,
		prompt: `Synthetic task ${i}`,
		messages: [],
		status: "completed",
		config: { provider: "fixture", model: "fixture", cwd: directory },
		startedAt: 1,
	});
}
store.run("COMMIT");
store.close();
const mode = process.argv.includes("--baseline")
	? "upstream-close-omission"
	: "closed-stores";
const original = SqliteSessionStore.prototype.close;
// Controlled counterfactual: every other source line and input stays identical.
let skippedClosures = 0;
if (mode === "upstream-close-omission")
	SqliteSessionStore.prototype.close = () => {
		skippedClosures++;
	};
try {
	for (let i = 0; i < 3; i++) discoverChatSessions({ liveSessions });
	let peakHandles = handleCount(),
		peakRss = process.memoryUsage().rss;
	const beforeHandles = peakHandles,
		beforeRss = peakRss,
		cpu = process.cpuUsage(),
		start = performance.now();
	for (let i = 0; i < iterations; i++) {
		if (discoverChatSessions({ liveSessions }).length !== sessions)
			throw new Error("Incorrect history result");
		peakHandles = Math.max(peakHandles, handleCount());
		peakRss = Math.max(peakRss, process.memoryUsage().rss);
	}
	const duration = performance.now() - start,
		used = process.cpuUsage(cpu);
	if (mode === "upstream-close-omission" && skippedClosures !== iterations + 3)
		throw new Error("Counterfactual did not intercept every owned connection");
	console.log(
		JSON.stringify({
			mode,
			sessions,
			iterations,
			warmup: 3,
			wall_ms: duration,
			cpu_user_ms: used.user / 1000,
			cpu_system_ms: used.system / 1000,
			handles_before: beforeHandles,
			handles_after: handleCount(),
			handles_peak: peakHandles,
			rss_before: beforeRss,
			rss_peak: peakRss,
			bun: Bun.version,
		}),
	);
} finally {
	SqliteSessionStore.prototype.close = original;
	kernel.symbols.CloseHandle(handle);
	kernel.close();
}
