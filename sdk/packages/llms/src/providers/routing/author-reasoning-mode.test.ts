import { describe, expect, it } from "vitest";
import { withAuthorReasoningMode } from "./author-reasoning-mode";
describe("author reasoning mode", () => {
	it("sends Adaptive only as backend-owned auto steering, without persona injection", () => {
		const body = {
			reasoning_effort: "xhigh",
			messages: [{ role: "user", content: "original task" }],
			stream: true,
		};
		expect(withAuthorReasoningMode(body, "adaptive")).toEqual({
			...body,
			reason_mode: "auto",
		});
		expect(body).not.toHaveProperty("reason_mode");
	});
	it("inserts a separate user control after the system without altering images, tools or history", () => {
		const messages = [
			{ role: "system", content: "user style" },
			{
				role: "user",
				content: [
					{ type: "text", text: "original user text" },
					{
						type: "image_url",
						image_url: { url: "https://fixture.invalid/image" },
					},
				],
			},
			{ role: "assistant", tool_calls: [{ id: "call1" }] },
			{ role: "tool", tool_call_id: "call1", content: "tool result" },
		];
		const body = {
			messages,
			reasoning_effort: "xhigh",
			stream: true,
			tools: [{ type: "function" }],
		};
		const result = withAuthorReasoningMode(body, "ultra");
		expect(result).toEqual({
			...body,
			messages: [
				messages[0],
				{ role: "user", content: "{REASON:ultra}" },
				...messages.slice(1),
			],
		});
		expect(body.messages).toBe(messages);
		expect(body.messages).toHaveLength(4);
		expect((result.messages as unknown[])[2]).toBe(messages[1]);
	});
	it.each([
		"none",
		"low",
		"medium",
		"high",
		undefined,
	])("does not override explicit %s thinking", (effort) => {
		const body = {
			messages: [{ role: "user", content: "fixture" }],
			reasoning_effort: effort,
		};
		expect(withAuthorReasoningMode(body, "ultra")).toBe(body);
	});
	it("keeps unconfigured endpoints unchanged and rejects unknown modes", () => {
		const body = {
			messages: [{ role: "user", content: "fixture" }],
			reasoning_effort: "xhigh",
		};
		expect(withAuthorReasoningMode(body, undefined)).toBe(body);
		expect(() => withAuthorReasoningMode(body, "invented-mode")).toThrow();
	});
});
