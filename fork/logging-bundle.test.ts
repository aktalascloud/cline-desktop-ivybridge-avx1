import { describe, expect, it } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import {
	loggingBundlePlugin,
	loggingWorkers,
	loggingWorkerNames,
	backendLoggingOptions,
	discordWorkerPath,
} from "./logging-bundle";

describe("relocatable logging workers", () => {
	it("writes a real file through bundled and compiled pino transports", async () => {
		const root = dirname(import.meta.dir),
			cache = join(root, ".build-cache");
		mkdirSync(cache, { recursive: true });
		const stage = mkdtempSync(join(cache, "logger-test-"));
		const workers = loggingWorkers(join(root, "apps/cli"));
		expect(await Bun.file(discordWorkerPath(join(root, "apps/cli"))).exists()).toBe(true);
		const logging = backendLoggingOptions();
		const entry = join(stage, "probe.ts");
		await Bun.write(
			entry,
			`import pino from ${JSON.stringify(Bun.resolveSync("pino", join(root, "apps/cli")))};
const transport=pino.transport({target:'pino/file',options:{destination:process.argv.at(-1)}});
await new Promise((resolve,reject)=>{transport.once('ready',resolve);transport.once('error',reject)});
const logger=pino({},transport);logger.info('logging-worker-fixture');
await new Promise((resolve,reject)=>logger.flush((error)=>error?reject(error):resolve()));
transport.end();await new Promise(resolve=>transport.once('close',resolve));`,
		);
		try {
			for (const key of Object.keys(workers) as Array<keyof typeof workers>) {
				const result = await Bun.build({
					...logging,
					entrypoints: [workers[key]],
					target: "bun",
					minify: true,
				});
				expect(result.success).toBe(true);
				await Bun.write(
					join(stage, loggingWorkerNames[key]),
					result.outputs[0],
				);
				expect(
					(await result.outputs[0].text()).includes(
						root.replaceAll("\\", "\\\\"),
					),
				).toBe(false);
			}
			for (const compiled of [false, true]) {
				const output = join(stage, compiled ? "probe.exe" : "probe.js");
				const virtual =
					process.platform === "win32" ? "B:/~BUN/root/" : "/$bunfs/root/";
				const path = (key: keyof typeof workers) =>
					compiled
						? JSON.stringify(
								virtual + relative(root, workers[key]).replaceAll("\\", "/"),
							)
						: `globalThis.__clineLoggingPaths.${key}`;
				const build = await Bun.build({
					entrypoints: [entry, ...(compiled ? Object.values(workers) : [])],
					root,
					target: "bun",
					minify: true,
					splitting: compiled,
					...(compiled
						? {
								compile: {
									target:
										process.platform === "win32"
											? "bun-windows-x64-baseline"
											: "bun-linux-x64-baseline",
									outfile: output,
								},
							}
						: {}),
					plugins: [loggingBundlePlugin()],
					banner: compiled
						? undefined
						: `globalThis.__clineLoggingPaths=Object.fromEntries(Object.entries(${JSON.stringify(loggingWorkerNames)}).map(([key,name])=>[key,process.getBuiltinModule('node:url').fileURLToPath(new URL(name,import.meta.url))]));`,
					define: {
						__CLINE_LOG_THREAD__: path("thread"),
						__CLINE_LOG_PINO__: path("pino"),
						__CLINE_LOG_FILE__: path("file"),
					},
				});
				expect(build.success).toBe(true);
				if (!compiled) await Bun.write(output, build.outputs[0]);
				const log = join(stage, compiled ? "compiled.log" : "bundle.log");
				const child = Bun.spawn(
					compiled ? [output, log] : [process.execPath, output, log],
					{ cwd: stage, stdout: "pipe", stderr: "pipe" },
				);
				const code = await child.exited;
				if (code) throw new Error(await new Response(child.stderr).text());
				expect(readFileSync(log, "utf8")).toContain("logging-worker-fixture");
				expect(
					(await Bun.file(output).text()).includes(
						root.replaceAll("\\", "\\\\"),
					),
				).toBe(false);
			}
		} finally {
			if (!realpathSync(stage).startsWith(realpathSync(cache) + sep))
				throw new Error("Test cleanup path escape");
			rmSync(stage, { recursive: true, force: true });
		}
	}, 120_000);
});
