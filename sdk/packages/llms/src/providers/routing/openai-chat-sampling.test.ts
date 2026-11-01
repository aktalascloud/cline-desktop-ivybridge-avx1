import { describe, expect, it } from "vitest";
import {
	OpenAIChatSamplingSchema,
	withOpenAIChatSampling,
} from "./openai-chat-sampling";
describe("OpenAI Chat sampling defaults", () => {
	it.each([undefined, { max_tokens: "obsolete", seed: -1, presence_penalty: 1, repetition_penalty: 1.1, reasoning_budget_tokens: 512 }])("leaves output budgets, penalties and seed to the server even with stale settings", (defaults) => {
		expect(withOpenAIChatSampling({ max_tokens: 128, max_completion_tokens: 256, presence_penalty: 2, frequency_penalty: 1, repetition_penalty: 1.2, seed: 42, reasoning_budget_tokens: 4096, reasoning_effort: "xhigh", stream: true }, defaults)).toEqual({ reasoning_effort: "xhigh", stream: true });
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
			temperature: 0,
			reasoning_effort: "xhigh",
			tools: body.tools,
			stream: true,
			top_p: 0.95,
			top_k: 20,
			min_p: 0.05,
		});
	});
	it("undefined SDK values do not erase defaults; an absent settings object leaves requests intact", () => {
		expect(
			withOpenAIChatSampling({ temperature: undefined }, { temperature: 0 }),
		).toEqual({ temperature: 0 });
		const body = { model: "local" };
		expect(withOpenAIChatSampling(body, undefined)).toEqual(body);
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
