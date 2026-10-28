import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { NodeHubClient } from "../client";
import { createLocalHubScheduleRuntimeHandlers } from "../daemon/runtime-handlers";
import { createInMemoryHubOwnerContext } from "../discovery";
import { type HubWebSocketServer, startHubWebSocketServer } from "./index";

describe("fork Hub requires its token before commands or subscriptions", () => {
	let server: HubWebSocketServer | undefined;
	let root: string | undefined;
	afterEach(async () => {
		await server?.close();
		if (root) await rm(root, { recursive: true, force: true });
	});
	async function start() {
		root = await mkdtemp(join(tmpdir(), "cline-token-boundary-"));
		const listSessions = vi.fn().mockResolvedValue([]);
		server = await startHubWebSocketServer({
			owner: createInMemoryHubOwnerContext(root),
			host: "127.0.0.1",
			port: 0,
			workspaceRoot: root,
			runtimeHandlers: createLocalHubScheduleRuntimeHandlers(),
			sessionHost: {
				subscribe: () => () => undefined,
				dispose: async () => undefined,
				listSessions,
			} as never,
		});
		listSessions.mockClear();
		return { server, listSessions };
	}
	it.each([
		["http://localhost:3000", undefined],
		["http://127.0.0.1:3017", undefined],
		["http://[::1]:3000", undefined],
		["http://localhost:3000", "incorrect-token"],
		["https://example.invalid", undefined],
		[undefined, undefined],
	])("rejects origin %s with token %s at upgrade", async (origin, token) => {
		const { server, listSessions } = await start();
		const socket = new WebSocket(server.url, token ? `cline-hub-auth.${token}` : [], {
			headers: origin ? { Origin: origin } : {},
		});
		const opened = vi.fn();
		socket.on("open", opened);
		await new Promise<void>((resolve, reject) => {
			socket.once("unexpected-response", (_request, response) => {
				expect(response.statusCode).toBe(401);
				response.resume();
				socket.terminate();
				resolve();
			});
			socket.on("error", () => undefined);
			socket.once("open", () => reject(new Error("Unauthenticated upgrade accepted")));
		});
		expect(opened).not.toHaveBeenCalled();
		expect(listSessions).not.toHaveBeenCalled();
	});
	it("keeps authenticated Desktop/CLI clients working", async () => {
		const { server } = await start();
		const client = new NodeHubClient({
			url: server.url,
			authToken: server.authToken,
			clientId: "fixture-client",
			workspaceRoot: root,
		});
		try {
			await client.connect();
			expect((await client.command("session.list")).ok).toBe(true);
		} finally {
			await client.dispose();
		}
	});
});
