import type { ChatMessage } from "@/lib/chat-schema";

export function formatRequestMetrics(
	metrics: ChatMessage["meta"],
	t: (text: string) => string,
): string {
	const finite = (value: unknown): value is number =>
		typeof value === "number" && Number.isFinite(value) && value > 0;
	const parts: string[] = [];
	if (finite(metrics?.outputTokens) && finite(metrics?.requestDurationMs))
		parts.push(
			`${((metrics.outputTokens * 1000) / metrics.requestDurationMs).toFixed(1)} ${t("tok/s")}`,
		);
	// Older provider adapters normalize missing cache counters to zero; zero cannot prove cache reporting.
	if (
		finite(metrics?.inputTokens) &&
		finite(metrics?.cacheReadTokens) &&
		metrics.cacheReadTokens <= metrics.inputTokens
	)
		parts.push(
			`${t("cache")} ${Math.round((metrics.cacheReadTokens * 100) / metrics.inputTokens)}%`,
		);
	return parts.join(" · ");
}
