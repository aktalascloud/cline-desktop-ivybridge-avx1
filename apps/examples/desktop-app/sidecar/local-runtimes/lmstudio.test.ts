import path from "node:path";
import {
	mkdtemp,
	mkdir,
	readFile,
	realpath,
	rm,
	symlink,
	unlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { assertSafeModelDirectory, isNestedDir } from "./lmstudio";

it("refuses a model junction before deleting anything", async () => {
	const fixture = await realpath(
		await mkdtemp(path.join(tmpdir(), "cline-model-delete-")),
	);
	const models = path.join(fixture, "models");
	const outside = path.join(fixture, "outside");
	const target = path.join(models, "publisher", "model");
	try {
		await mkdir(path.dirname(target), { recursive: true });
		await mkdir(outside);
		await writeFile(path.join(outside, "keep.txt"), "fixture");
		await symlink(
			outside,
			target,
			process.platform === "win32" ? "junction" : "dir",
		);
		await expect(assertSafeModelDirectory(models, target)).rejects.toThrow(
			"symlink or junction",
		);
		expect(await readFile(path.join(outside, "keep.txt"), "utf8")).toBe(
			"fixture",
		);
		await unlink(target);
		await mkdir(target);
		await expect(
			assertSafeModelDirectory(models, target),
		).resolves.toBeUndefined();
		await expect(assertSafeModelDirectory(models, outside)).rejects.toThrow(
			"outside",
		);
	} finally {
		await rm(fixture, { recursive: true, force: true });
	}
});

describe("isNestedDir", () => {
	const models = path.join(path.sep, "home", "me", ".lmstudio", "models");

	it("accepts folders exactly at the given depth", () => {
		expect(
			isNestedDir(
				models,
				path.join(models, "lmstudio-community", "Qwen3-8B-GGUF"),
				2,
			),
		).toBe(true);
	});

	it("rejects the models folder itself, shallower, deeper, and escaping paths", () => {
		expect(isNestedDir(models, models, 2)).toBe(false);
		expect(isNestedDir(models, path.join(models, "qwen"), 2)).toBe(false);
		expect(isNestedDir(models, path.join(models, "a", "b", "c"), 2)).toBe(
			false,
		);
		expect(isNestedDir(models, path.join(models, "..", "..", "x"), 2)).toBe(
			false,
		);
		expect(isNestedDir(models, path.join(models, "qwen", ".."), 2)).toBe(false);
	});
});
