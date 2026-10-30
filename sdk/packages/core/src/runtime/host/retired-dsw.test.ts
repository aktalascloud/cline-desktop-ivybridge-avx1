import { expect, it, vi } from "vitest";
import { LocalRuntimeHost } from "./local-runtime-host";

it("rejects a retired DSW chat before reconnecting or sending a request", async () => {
	const resolveProviderApiKey = vi.fn();
	const updateConnection = vi.fn();
	const host = Object.assign(Object.create(LocalRuntimeHost.prototype), {
		oauthTokenManager: { resolveProviderApiKey },
	});
	await expect(
		(host as any).syncOAuthCredentials({
			config: { providerId: "dsw2api" },
			agent: { updateConnection },
		}),
	).rejects.toThrow("DSW2API has been removed");
	expect(resolveProviderApiKey).not.toHaveBeenCalled();
	expect(updateConnection).not.toHaveBeenCalled();
});
