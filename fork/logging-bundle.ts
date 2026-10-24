import { dirname, join } from "node:path";
import type { BunPlugin } from "bun";

export function loggingWorkers(resolveFrom: string) {
	const pino = Bun.resolveSync("pino", resolveFrom);
	const thread = Bun.resolveSync("thread-stream", pino);
	return {
		thread: join(dirname(thread), "lib", "worker.js"),
		pino: join(dirname(pino), "lib", "worker.js"),
		file: join(dirname(pino), "file.js"),
	};
}

export const loggingWorkerNames = {
	thread: "thread-stream-worker.js",
	pino: "pino-worker.js",
	file: "pino-file.js",
};

/** Keep logger workers relocatable instead of embedding build-machine __dirname. */
export function loggingBundlePlugin(): BunPlugin {
	return {
		name: "relocatable-logging-workers",
		setup(build) {
			build.onLoad(
				{
					filter:
						/[\\/]thread-stream[\\/]index\.js$|[\\/]pino[\\/]lib[\\/]transport\.js$/,
				},
				async ({ path }) => {
					let contents = await Bun.file(path).text();
					contents = contents
						.replace(
							/join\(__dirname,\s*['"]lib['"],\s*['"]worker\.js['"]\)/g,
							"__CLINE_LOG_THREAD__",
						)
						.replace(
							/join\(__dirname,\s*['"]worker\.js['"]\)/g,
							"__CLINE_LOG_PINO__",
						)
						.replace(
							/join\(__dirname,\s*['"]\.\.['"],\s*['"]file\.js['"]\)/g,
							"__CLINE_LOG_FILE__",
						);
					if (contents.includes("__dirname"))
						throw new Error("Unmapped logging asset path");
					return { contents, loader: "js" };
				},
			);
		},
	};
}
