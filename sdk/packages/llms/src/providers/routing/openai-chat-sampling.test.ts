import { describe, expect, it } from "vitest";
import {
	OpenAIChatSamplingSchema,
	withOpenAIChatSampling,
} from "./openai-chat-sampling";
describe("OpenAI Chat sampling defaults", () => {
	it("unlimited mode replaces automatic client budgets with the local endpoint sentinel", () => {
		expect(
			withOpenAIChatSampling(
				{ max_tokens: 23871, reasoning_effort: "xhigh", stream: true },
				{ max_tokens: 0 },
			),
		).toEqual({ max_tokens: -1, reasoning_effort: "xhigh", stream: true });
	});
	it("caps automatic output budgets without exceeding tighter request limits", () => {
		expect(
			withOpenAIChatSampling({ max_tokens: 23871 }, { max_tokens: 2048 }),
		).toEqual({ max_tokens: 2048 });
		expect(
			withOpenAIChatSampling({ max_tokens: 128 }, { max_tokens: 2048 }),
		).toEqual({ max_tokens: 128 });
		expect(
			withOpenAIChatSampling(
				{ max_completion_tokens: 4096 },
				{ max_tokens: 2048 },
			),
		).toEqual({ max_completion_tokens: 2048 });
	});
	it("retains explicit request controls, tools, stream and reasoning", () => {
		const body = {
			temperature: 0,
			max_tokens: 128,
			reasoning_effort: "xhigh",
			tools: [{ type: "function" }],
			stream: true,
		};
		expect(
			withOpenAIChatSampling(body, {
				temperature: 1,
				max_tokens: 2048,
				top_p: 0.95,
				top_k: 20,
				min_p: 0.05,
				seed: 0,
				reasoning_budget_tokens: 512,
			}),
		).toEqual({
			...body,
			top_p: 0.95,
			top_k: 20,
			min_p: 0.05,
			seed: 0,
			reasoning_budget_tokens: 512,
		});
	});
	it("undefined SDK values do not erase defaults; an absent settings object leaves requests intact", () => {
		expect(
			withOpenAIChatSampling({ temperature: undefined }, { temperature: 0 }),
		).toEqual({ temperature: 0 });
		const body = { model: "local" };
		expect(withOpenAIChatSampling(body, undefined)).toBe(body);
	});
	it.each([
		{ temperature: NaN },
		{ temperature: -1 },
		{ top_p: 2 },
		{ top_k: 65 },
		{ top_k: 1.5 },
		{ min_p: -1 },
		{ seed: -1 },
		{ max_tokens: -1 },
		{ reasoning_budget_tokens: -1 },
		{ unknown: 1 },
	])("rejects invalid persisted defaults %o", (value) => {
		expect(OpenAIChatSamplingSchema.safeParse(value).success).toBe(false);
	});
});
