import { ProviderSettingsManager, toProviderConfig } from "@cline/core";
import type { JsonRecord } from "./types";

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
		},
	};
}
