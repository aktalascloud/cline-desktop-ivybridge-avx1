import {
	ProviderSettingsManager,
	toProviderConfig,
	readModelsFileSync,
	resolveModelsRegistryPath,
} from "@cline/core";
import type { JsonRecord } from "./types";
import { isQwen38NextAuthorModel } from "@cline/shared";

/** Refresh local defaults and limits; preserve credentials and historical routes. */
export function refreshLocalSamplingConfig(config: JsonRecord): JsonRecord {
	const id = String(config.provider ?? config.providerId ?? "").trim();
	if (!id) return config;
	const settings = new ProviderSettingsManager().getProviderSettings(id);
	if (
		settings?.client !== "openai-compatible" ||
		settings.protocol !== "openai-chat"
	)
		return config;
	const modelId = String(
		config.model ?? config.modelId ?? settings.model ?? "",
	);
	const models =
		readModelsFileSync(resolveModelsRegistryPath(new ProviderSettingsManager()))
			.providers[id]?.models ?? {};
	const model = Object.entries(models).find(
		([key, value]) => (value.id?.trim() || key.trim()) === modelId,
	)?.[1];
	if (
		config.thinking !== false &&
		["ultra", "adaptive"].includes(String(config.reasoningEffort))
	) {
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
	const historicalUrl = String(
		config.baseUrl ?? existing.baseUrl ?? "",
	).replace(/\/$/, "");
	const sameEndpoint =
		!historicalUrl ||
		!settings.baseUrl ||
		historicalUrl === settings.baseUrl.replace(/\/$/, "");
	const modelInfo =
		sameEndpoint &&
		model &&
		((model.contextWindow ?? 0) > 0 || (model.maxInputTokens ?? 0) > 0)
			? { ...model, id: modelId }
			: undefined;
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
			...(modelInfo ? { modelInfo } : {}),
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
