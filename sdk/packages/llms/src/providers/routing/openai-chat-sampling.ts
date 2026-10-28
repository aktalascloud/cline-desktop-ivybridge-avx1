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
		max_tokens: z.number().int().nonnegative().max(2147483647).optional(),
		seed: z.number().int().min(0).max(2147483647).optional(),
		reasoning_budget_tokens: z.number().int().min(0).max(2147483647).optional(),
		search_enabled: z.boolean().optional(),
	})
	.strict();

export type OpenAIChatSampling = z.infer<typeof OpenAIChatSamplingSchema>;

/** Request controls win, except the provider output cap also bounds automatic budgets. */
export function withOpenAIChatSampling(
	body: Record<string, unknown>,
	defaults: unknown,
): Record<string, unknown> {
	if (defaults === undefined) return body;
	const sampling = OpenAIChatSamplingSchema.parse(defaults);
	const result: Record<string, unknown> = {
		...sampling,
		...Object.fromEntries(
			Object.entries(body).filter(([, v]) => v !== undefined),
		),
	};
	if (sampling.max_tokens === 0) {
		// Strata/local compatible endpoints use -1 for the remaining context, without a client cap.
		delete result.max_completion_tokens;
		result.max_tokens = -1;
	} else if (sampling.max_tokens !== undefined) {
		const key =
			typeof body.max_completion_tokens === "number"
				? "max_completion_tokens"
				: "max_tokens";
		const requested = body[key];
		result[key] =
			typeof requested === "number"
				? Math.min(requested, sampling.max_tokens)
				: sampling.max_tokens;
		if (key === "max_completion_tokens") delete result.max_tokens;
	}
	return result;
}
