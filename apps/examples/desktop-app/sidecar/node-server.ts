import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import type { Duplex } from "node:stream";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { WebSocket, WebSocketServer } from "ws";
import type { SidecarWebSocketClient } from "./types";

type UpgradeOptions = { data?: SidecarWebSocketClient["data"] };
type UpgradeServer = {
	upgrade(request: Request, options?: UpgradeOptions): boolean;
};
type FetchHandler = (
	request: Request,
	server: UpgradeServer,
) => Promise<Response | undefined>;
type WebSocketHandler = {
	maxPayloadLength: number;
	open(client: SidecarWebSocketClient): void;
	message(client: SidecarWebSocketClient, message: string): Promise<void>;
	close(client: SidecarWebSocketClient): void;
};

function toRequest(req: IncomingMessage, port: number): Request {
	const method = req.method ?? "GET";
	const headers = new Headers();
	for (let index = 0; index < req.rawHeaders.length; index += 2) {
		headers.append(req.rawHeaders[index], req.rawHeaders[index + 1]);
	}
	const init: RequestInit & { duplex?: "half" } = { method, headers };
	if (method !== "GET" && method !== "HEAD") {
		init.body = Readable.toWeb(req) as unknown as ReadableStream;
		init.duplex = "half";
	}
	const path = req.url?.startsWith("/") ? req.url : "/";
	return new Request(`http://127.0.0.1:${port}${path}`, init);
}

async function reply(res: ServerResponse, response: Response): Promise<void> {
	res.writeHead(response.status, Object.fromEntries(response.headers));
	if (response.body) {
		await pipeline(
			Readable.fromWeb(
				response.body as unknown as Parameters<typeof Readable.fromWeb>[0],
			),
			res,
		);
	} else {
		res.end();
	}
}

export async function startNodeServer(
	hostname: string,
	requestedPort: number,
	fetch: FetchHandler,
	websocket: WebSocketHandler,
): Promise<{ port: number }> {
	const sockets = new WebSocketServer({
		noServer: true,
		maxPayload: websocket.maxPayloadLength,
		perMessageDeflate: false,
	});
	const server = createServer((req, res) => {
		void Promise.resolve()
			.then(async () => {
				const response = await fetch(toRequest(req, port), {
					upgrade: () => false,
				});
				await reply(
					res,
					response ?? new Response("Not found", { status: 404 }),
				);
			})
			.catch(() => {
				if (!res.headersSent) res.writeHead(500).end();
				else res.destroy();
			});
	});
	let port: number;
	server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
		const onError = () => socket.destroy();
		socket.on("error", onError);
		void Promise.resolve()
			.then(async () => {
				const request = toRequest(req, port);
				let upgraded = false;
				await fetch(request, {
					upgrade(candidate, options) {
						if (candidate !== request || upgraded || socket.destroyed)
							return false;
						upgraded = true;
						socket.off("error", onError);
						sockets.handleUpgrade(req, socket, head, (ws) => {
							const client = {
								data: options?.data,
								send(message: string) {
									if (ws.readyState === WebSocket.OPEN) ws.send(message);
								},
								close: () => ws.close(),
							};
							ws.on("error", () => ws.terminate());
							ws.on("close", () => websocket.close(client));
							ws.on("message", (message, binary) => {
								if (binary) return ws.close(1003);
								void websocket
									.message(client, message.toString())
									.catch(() => ws.close(1011));
							});
							websocket.open(client);
						});
						return true;
					},
				});
				if (!upgraded)
					socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
			})
			.catch(onError);
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(requestedPort, hostname, () => {
			server.off("error", reject);
			resolve();
		});
	});
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("Missing TCP address");
	port = address.port;
	return { port };
}
