/**
 * Explicit opt-in for compatible author templates. The mode is prompt syntax,
 * not a new API reasoning_effort value. Keep original messages and attachments.
 */
export function withAuthorReasoningMode(
	body: Record<string, unknown>,
	mode: unknown,
): Record<string, unknown> {
	if (mode === undefined) return body;
	if (mode !== "ultra") throw new Error("Unsupported author reasoning mode");
	if (body.reasoning_effort !== "xhigh") return body;
	if (!Array.isArray(body.messages)) return body;
	const index = body.messages.findIndex((message) => message?.role === "user");
	if (index < 0) return body;
	return {
		...body,
		messages: [
			...body.messages.slice(0, index),
			{ role: "user", content: "{REASON:ultra}" },
			...body.messages.slice(index),
		],
	};
}
