import { describe, expect, it } from "vitest";
import { z } from "zod";
describe("legacy schema size guard", () => {
	it("rejects an oversized constrained array before executing element refinements", () => {
		let calls = 0;
		const schema = z
			.array(
				z.string().refine(() => {
					calls++;
					return false;
				}),
			)
			.max(8);
		const result = schema.safeParse(Array(50_000).fill("fixture"));
		expect(result.success).toBe(false);
		expect(calls).toBe(0);
		if (!result.success) expect(result.error.issues[0]?.code).toBe("too_big");
	});
	it("applies exact-size upper bounds before asynchronous refinements", async () => {
		let calls = 0;
		const schema = z
			.array(
				z.string().refine(async () => {
					calls++;
					return true;
				}),
			)
			.length(2);
		expect(
			(await schema.safeParseAsync(Array(50_000).fill("fixture"))).success,
		).toBe(false);
		expect(calls).toBe(0);
	});
	it("retains normal validation, transformations and errors", () => {
		expect(
			z
				.array(z.string().transform((x) => x.toUpperCase()))
				.max(2)
				.parse(["a", "b"]),
		).toEqual(["A", "B"]);
		expect(z.array(z.string()).min(2).safeParse(["a"]).success).toBe(false);
		expect(z.array(z.number()).max(2).safeParse(["a"]).success).toBe(false);
	});
});
