import { describe, expect, it } from "vitest";
import type { SidecarContext } from "./types";
import { getUpdateSafety } from "./update-safety";
const context = (list: () => Promise<unknown[]>) =>
	({
		liveSessions: new Map(),
		runtimeBindings: new Map([["local", { sessionManager: { list } }]]),
	}) as unknown as SidecarContext;
describe("fork update safety", () => {
	it("allows idle Hubs", async () =>
		expect(
			await getUpdateSafety(
				context(async () => [{ status: "completed" }, { status: "idle" }]),
			),
		).toEqual({ safe: true, activeSessionCount: 0 }));
	it("blocks work started in another CLI", async () =>
		expect(
			(await getUpdateSafety(context(async () => [{ status: "running" }])))
				.safe,
		).toBe(false));
	it("blocks queued prompts", async () => {
		const ctx = context(async () => []);
		ctx.liveSessions.set("x", {
			status: "idle",
			busy: false,
			promptsInQueue: [{}],
		} as never);
		expect((await getUpdateSafety(ctx)).safe).toBe(false);
	});
	it("blocks disconnected or unknown Hub state", async () => {
		expect(
			(
				await getUpdateSafety(
					context(async () => {
						throw new Error("offline");
					}),
				)
			).safe,
		).toBe(false);
		expect(
			(
				await getUpdateSafety(
					context(async () => [{ status: "new-unknown-state" }]),
				)
			).safe,
		).toBe(false);
	});
	it("blocks an uninitialized backend", async () =>
		expect(
			(
				await getUpdateSafety({
					runtimeBindings: new Map(),
					liveSessions: new Map(),
				} as never)
			).safe,
		).toBe(false));
});
