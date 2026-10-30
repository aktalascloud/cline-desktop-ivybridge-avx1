import { expect, it } from "vitest";
import { formatRequestMetrics } from "./request-metrics";

it("uses matching per-request counts and time without inventing missing counters", () => {
	const t = (text: string) => text;
	expect(
		formatRequestMetrics(
			{
				outputTokens: 120,
				requestDurationMs: 6000,
				inputTokens: 1000,
				cacheReadTokens: 750,
			},
			t,
		),
	).toBe("20.0 tok/s · cache 75%");
	expect(formatRequestMetrics(undefined, t)).toBe("");
	expect(
		formatRequestMetrics({ outputTokens: 120, cacheReadTokens: 0 }, t),
	).toBe("");
	expect(
		formatRequestMetrics(
			{
				inputTokens: 10,
				cacheReadTokens: 20,
				requestDurationMs: Number.NaN,
				outputTokens: 3,
			},
			t,
		),
	).toBe("");
});
