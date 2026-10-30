import {
	ensureCustomProvidersLoaded,
	refreshProviderModelsFromSource,
	type ProviderSettingsManager,
} from "@cline/core";
const pending = new Map<string, { at: number; task: Promise<unknown> }>();
/** Local engines can change their allocated window without changing a model id. */
export async function refreshLocalModelMetadata(
	manager: ProviderSettingsManager,
	providerId: string,
): Promise<void> {
	const baseUrl = manager.getProviderSettings(providerId)?.baseUrl;
	if (!baseUrl) return;
	try {
		if (
			!["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseUrl).hostname)
		)
			return;
	} catch {
		return;
	}
	const key = providerId + "\0" + baseUrl,
		previous = pending.get(key);
	if (previous && Date.now() - previous.at < 60_000) {
		await previous.task;
		return;
	}
	const task = (async () => {
		await ensureCustomProvidersLoaded(manager);
		await refreshProviderModelsFromSource(manager, providerId);
	})().catch(() => undefined);
	pending.set(key, { at: Date.now(), task });
	await task;
}
