import type { ProviderModel } from "./provider-schema";

export function modelReasoningChoices(
	options: ProviderModel["reasoningOptions"],
): string[] | undefined {
	if (!options?.length) return undefined;
	const choices = options.flatMap((option) =>
		option.type === "toggle"
			? ["none", "high"]
			: option.type === "effort"
				? option.values.filter(
						(value): value is Exclude<typeof value, null> =>
							typeof value === "string" && value !== "default",
					)
				: [],
	);
	return choices.length ? [...new Set(choices)] : undefined;
}
