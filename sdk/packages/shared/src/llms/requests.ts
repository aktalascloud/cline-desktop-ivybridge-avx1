export const DEFAULT_CLINE_API_BASE_URL = "https://api.cline.bot";

export const DEFAULT_REQUEST_HEADERS: Record<string, string> = {
	"HTTP-Referer": "https://cline.bot",
	"X-Title": "Cline",
	"X-IS-MULTIROOT": "false",
	"X-CLIENT-TYPE": "cline-sdk",
};

export function serializeAbortReason(reason: unknown): unknown {
	return reason instanceof Error
		? { name: reason.name, message: reason.message }
		: reason;
}
