/** Authenticate an owned local gateway before releasing its inference key. */
export const MANAGED_DSW_HEADER = "x-cline-managed-gateway";
export const MANAGED_DSW_VALUE = "dsw2api-v1";

async function boundedJson(
	response: Response,
): Promise<Record<string, unknown>> {
	if (!response.ok || !response.body) throw new Error("DSW2API is not ready");
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > 8192) throw new Error("Invalid DSW2API identity response");
			chunks.push(value);
		}
	} finally {
		await reader.cancel().catch(() => undefined);
	}
	const body = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>;
}

export function managedDswFetch(
	base: typeof fetch | undefined,
	headers: Record<string, string> | undefined,
	apiKey: string | undefined,
	baseUrl: string | undefined,
): typeof fetch | undefined {
	if (
		!Object.entries(headers ?? {}).some(
			([key, value]) =>
				key.toLowerCase() === MANAGED_DSW_HEADER && value === MANAGED_DSW_VALUE,
		)
	)
		return base;
	if (!apiKey || !baseUrl)
		throw new Error("DSW2API local configuration is incomplete");
	const endpoint = new URL(baseUrl);
	if (
		endpoint.protocol !== "http:" ||
		endpoint.hostname !== "127.0.0.1" ||
		endpoint.username ||
		endpoint.password ||
		endpoint.pathname !== "/v1"
	) {
		throw new Error("Managed DSW2API must use its owned loopback endpoint");
	}
	const transport = base ?? globalThis.fetch;
	return (async (input, init) => {
		const destination = new URL(
			input instanceof Request ? input.url : input.toString(),
		);
		if (
			destination.origin !== endpoint.origin ||
			!destination.pathname.startsWith("/v1/")
		)
			throw new Error("Unexpected managed DSW2API destination");
		const nonce = crypto.randomUUID().replaceAll("-", "");
		const signal =
			init?.signal ?? (input instanceof Request ? input.signal : undefined);
		const healthSignal = signal
			? AbortSignal.any([signal, AbortSignal.timeout(3000)])
			: AbortSignal.timeout(3000);
		const identity = await boundedJson(
			await transport(new URL(`/health?nonce=${nonce}`, endpoint), {
				headers: { accept: "application/json" },
				redirect: "error",
				signal: healthSignal,
			}),
		);
		if (
			!Number.isSafeInteger(identity.pid) ||
			typeof identity.build_id !== "string" ||
			typeof identity.instance_id !== "string" ||
			identity.fixture !== false ||
			typeof identity.client_nonce_mac !== "string"
		) {
			throw new Error("DSW2API identity could not be verified");
		}
		const message = [
			nonce,
			String(identity.pid),
			identity.build_id,
			identity.instance_id,
		].join("\n");
		const key = await crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode(apiKey),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["verify"],
		);
		const encoded = identity.client_nonce_mac;
		if (!/^[0-9a-f]{64}$/.test(encoded))
			throw new Error("DSW2API identity could not be verified");
		const signature = Uint8Array.from(encoded.match(/../g)!, (byte) =>
			Number.parseInt(byte, 16),
		);
		if (
			!(await crypto.subtle.verify(
				"HMAC",
				key,
				signature,
				new TextEncoder().encode(message),
			))
		)
			throw new Error("DSW2API identity could not be verified");
		if (signal?.aborted) throw signal.reason;
		return transport(input, { ...init, redirect: "error" });
	}) as typeof fetch;
}
