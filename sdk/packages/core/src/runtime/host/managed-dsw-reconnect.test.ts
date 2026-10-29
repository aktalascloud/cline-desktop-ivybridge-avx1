import { afterEach, expect, it, vi } from "vitest";
import { getManagedDsw2Api } from "../../services/providers/managed-dsw2api";
import { LocalRuntimeHost } from "./local-runtime-host";

afterEach(() => vi.restoreAllMocks());

it("refreshes an existing chat connection before its next turn without replaying it", async () => {
	const headers = { "x-cline-managed-gateway": "dsw2api-v1" };
	let settings = {
		headers,
		apiKey: "fixture-old-key",
		baseUrl: "http://127.0.0.1:19001/v1",
	};
	const synchronize = vi
		.spyOn(getManagedDsw2Api(), "synchronize")
		.mockImplementation(async () => {
			settings = {
				...settings,
				apiKey: "fixture-new-key",
				baseUrl: "http://127.0.0.1:19002/v1",
			};
		});
	const updateConnection = vi.fn();
	const delegate = vi.fn();
	const teammate = vi.fn();
	const session = {
		sessionId: "existing-chat",
		config: { providerId: "dsw2api", ...settings },
		agent: { updateConnection },
		runtime: {
			delegatedAgentConfigProvider: { updateConnectionDefaults: delegate },
			teamRuntime: { updateTeammateConnections: teammate },
		},
	};
	const host = Object.assign(Object.create(LocalRuntimeHost.prototype), {
		sessions: new Map([[session.sessionId, session]]),
		providerSettingsManager: { getProviderSettings: () => settings },
		oauthTokenManager: { resolveProviderApiKey: async () => null },
	});
	const refresh = Reflect.get(host, "syncOAuthCredentials");
	await Reflect.apply(refresh, host, [session]);
	expect(synchronize).toHaveBeenCalledOnce();
	expect(updateConnection).toHaveBeenCalledExactlyOnceWith({
		apiKey: "fixture-new-key",
		baseUrl: "http://127.0.0.1:19002/v1",
	});
	expect(delegate).toHaveBeenCalledWith(
		expect.objectContaining({ baseUrl: settings.baseUrl }),
	);
	expect(teammate).toHaveBeenCalledWith(
		expect.objectContaining({ baseUrl: settings.baseUrl }),
	);
	expect(session.config.baseUrl).toBe(settings.baseUrl);
	await Reflect.apply(refresh, host, [session]);
	expect(updateConnection).toHaveBeenCalledOnce();
	// A user-managed provider with the same ID must never be taken over.
	settings = { ...settings, headers: {} as typeof headers };
	await Reflect.apply(refresh, host, [session]);
	expect(synchronize).toHaveBeenCalledTimes(2);
});
