import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { managedDswFetch } from "./managed-dsw-fetch";

const headers = { "x-cline-managed-gateway": "dsw2api-v1" };
const key = "fixture";
const url = "http://127.0.0.1:18001/v1";
function transport(valid = true) {
	return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const destination = new URL(
			input instanceof Request ? input.url : String(input),
		);
		if (destination.pathname !== "/health") return new Response("completion");
		expect(new Headers(init?.headers).has("authorization")).toBe(false);
		const body = {
			pid: 123,
			build_id: "source",
			instance_id: "owned-instance",
			fixture: false,
		};
		const message = [
			destination.searchParams.get("nonce"),
			String(body.pid),
			body.build_id,
			body.instance_id,
		].join("\n");
		return Response.json({
			...body,
			client_nonce_mac: valid
				? createHmac("sha256", key).update(message).digest("hex")
				: "0".repeat(64),
		});
	});
}
describe("managed DSW2API identity boundary", () => {
	it("preserves every unmarked provider transport", () => {
		const base = transport();
		expect(
			managedDswFetch(base as typeof fetch, {}, undefined, undefined),
		).toBe(base);
	});
	it("releases the inference request only after authenticated readiness", async () => {
		const base = transport();
		const fetcher = managedDswFetch(base as typeof fetch, headers, key, url)!;
		expect(
			await (
				await fetcher(url + "/chat/completions", {
					headers: { authorization: `Bearer ${key}` },
				})
			).text(),
		).toBe("completion");
		expect(base).toHaveBeenCalledTimes(2);
	});
	it("rejects a recycled or malicious loopback port without releasing credentials", async () => {
		const base = transport(false);
		const fetcher = managedDswFetch(base as typeof fetch, headers, key, url)!;
		await expect(
			fetcher(url + "/chat/completions", {
				headers: { authorization: `Bearer ${key}` },
			}),
		).rejects.toThrow("identity");
		expect(base).toHaveBeenCalledTimes(1);
	});
	it("rejects remote endpoints and unexpected request destinations", async () => {
		expect(() =>
			managedDswFetch(undefined, headers, key, "https://example.invalid/v1"),
		).toThrow("loopback");
		const base = transport();
		const fetcher = managedDswFetch(base as typeof fetch, headers, key, url)!;
		await expect(
			fetcher("http://127.0.0.1:18002/v1/chat/completions"),
		).rejects.toThrow("destination");
		expect(base).not.toHaveBeenCalled();
	});
	it("bounds untrusted health bodies", async () => {
		const base = vi.fn(async () => new Response("x".repeat(8193)));
		await expect(
			managedDswFetch(base as typeof fetch, headers, key, url)!(
				url + "/models",
			),
		).rejects.toThrow("identity");
		expect(base).toHaveBeenCalledTimes(1);
	});
	it("does not start inference after cancellation during health verification", async () => {
		const controller = new AbortController();
		const delegate = transport();
		const base = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const response = await delegate(input, init);
			controller.abort();
			return response;
		});
		await expect(
			managedDswFetch(base as typeof fetch, headers, key, url)!(
				url + "/models",
				{ signal: controller.signal },
			),
		).rejects.toBeDefined();
		expect(base).toHaveBeenCalledTimes(1);
	});
});
