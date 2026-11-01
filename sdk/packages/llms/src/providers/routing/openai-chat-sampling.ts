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

/** These controls belong to the endpoint; ignore stale saved/session values. */
export const SERVER_MANAGED_SAMPLING_KEYS = [
	"max_tokens", "max_completion_tokens", "max_output_tokens",
	"presence_penalty", "frequency_penalty", "repetition_penalty",
	"seed", "reasoning_budget_tokens",
] as const;

export function withOpenAIChatSampling(
	body: Record<string, unknown>,
	defaults: unknown,
): Record<string, unknown> {
	const inherited = defaults && typeof defaults === "object" && !Array.isArray(defaults)
		? Object.fromEntries(Object.entries(defaults).filter(([key]) => !SERVER_MANAGED_SAMPLING_KEYS.some((field) => field === key)))
		: defaults;
	const sampling = inherited === undefined ? {} : OpenAIChatSamplingSchema.parse(inherited);
	const result: Record<string, unknown> = {
		...sampling,
		...Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined)),
	};
	for (const key of SERVER_MANAGED_SAMPLING_KEYS) delete result[key];
	return result;
}
