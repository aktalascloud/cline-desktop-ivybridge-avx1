import { expect, test } from "bun:test";
import { createRequire } from "node:module";

for (const location of [
	"../apps/examples/desktop-app/package.json",
	"../sdk/packages/shared/package.json",
]) {
	const { z } = createRequire(new URL(location, import.meta.url))("zod");
	test(`${location}: bounded collections reject before visiting elements`, () => {
		let visits = 0;
		const item = z.string().refine(() => {
			visits++;
			return true;
		});
		expect(z.array(item).max(2).safeParse(["a", "b", "c"]).success).toBe(false);
		expect(z.set(item).max(2).safeParse(new Set(["a", "b", "c"])).success).toBe(false);
		expect(visits).toBe(0);
		expect(z.array(item).max(2).parse(["a"])).toEqual(["a"]);
		expect(visits).toBe(1);
	});
}
