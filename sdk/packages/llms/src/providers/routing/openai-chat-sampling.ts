import { z } from "zod";

/** Explicit local-provider defaults. Empty fields inherit the endpoint settings. */
export const OpenAIChatSamplingSchema = z
	.object({
		temperature: z.number().finite().min(0).max(2).optional(),
		presence_penalty: z.number().finite().min(0).max(2).optional(),
		repetition_penalty: z.number().finite().positive().max(2).optional(),
		top_p: z.number().finite().min(0).max(1).optional(),
		top_k: z.number().int().min(1).max(64).optional(),
		min_p: z.number().finite().min(0).max(1).optional(),
		max_tokens: z.number().int().positive().max(2147483647).optional(),
		seed: z.number().int().min(0).max(2147483647).optional(),
		reasoning_budget_tokens: z.number().int().min(0).max(2147483647).optional(),
	})
	.strict();

export type OpenAIChatSampling = z.infer<typeof OpenAIChatSamplingSchema>;

/** Request-owned parameters win over persisted defaults, including numeric zero. */
export function withOpenAIChatSampling(
	body: Record<string, unknown>,
	defaults: unknown,
): Record<string, unknown> {
	if (defaults === undefined) return body;
	const sampling = OpenAIChatSamplingSchema.parse(defaults);
	return {
		...sampling,
		...Object.fromEntries(
			Object.entries(body).filter(([, v]) => v !== undefined),
		),
	};
}
