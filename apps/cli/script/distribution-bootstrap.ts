/** Runs before bundled imports, including modules that cache storage paths. */
export function distributionBootstrap(
	distribution?: "avx1",
): string | undefined {
	if (distribution !== "avx1") return undefined;
	return "if (!process.env.CLINE_DIR?.trim() && !process.env.CLINE_DATA_DIR?.trim()) { process.env.CLINE_DIR = process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:os').homedir(), '.cline-avx1'); }";
}
