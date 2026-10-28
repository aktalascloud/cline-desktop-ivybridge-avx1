import {
	ProviderSettingsManager,
	toProviderConfig,
	readModelsFileSync,
	resolveModelsRegistryPath,
} from "@cline/core";
import type { JsonRecord } from "./types";
import { isQwen38NextAuthorModel } from "@cline/shared";

/** Refresh only local sampling defaults; never replace credentials or historical routes. */
export function refreshLocalSamplingConfig(config: JsonRecord): JsonRecord {
	const id = String(config.provider ?? config.providerId ?? "").trim();
	if (!id) return config;
	const settings = new ProviderSettingsManager().getProviderSettings(id);
	if (
		settings?.client !== "openai-compatible" ||
		settings.protocol !== "openai-chat"
	)
		return config;
	if (
		config.thinking !== false &&
		["ultra", "adaptive"].includes(String(config.reasoningEffort))
	) {
		const models =
			readModelsFileSync(
				resolveModelsRegistryPath(new ProviderSettingsManager()),
			).providers[id]?.models ?? {};
		const modelId = String(
			config.model ?? config.modelId ?? settings.model ?? "",
		);
		const model = Object.entries(models).find(
			([key, value]) => (value.id?.trim() || key.trim()) === modelId,
		)?.[1];
		if (
			model?.supportsAuthorModes !== true ||
			!isQwen38NextAuthorModel(modelId)
		)
			throw new Error("Author reasoning modes are not enabled for this model.");
	}
	const existing =
		config.providerConfig && typeof config.providerConfig === "object"
			? (config.providerConfig as JsonRecord)
			: {};
	return {
		...config,
		providerConfig: {
			...toProviderConfig(
				{
					...settings,
					model: String(config.model ?? config.modelId ?? settings.model ?? ""),
				},
				{ includeKnownModels: false },
			),
			...existing,
			providerId: id,
			sampling: settings.sampling ?? {},
			authorReasoningMode:
				config.thinking !== false &&
				(config.reasoningEffort === "ultra" ||
					config.reasoningEffort === "adaptive")
					? config.reasoningEffort
					: undefined,
		},
	};
}
