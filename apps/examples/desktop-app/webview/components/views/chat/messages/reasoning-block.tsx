"use client";

import { ThinkingBlock } from "@cline/ui/components/agent-chat";
import type { ChatMessage } from "@/lib/chat-schema";
import { useTranslation } from "@/lib/i18n";
import { formatRequestMetrics } from "./request-metrics";
import { MemoizedMarkdown } from "../../../ui/markdown";

/** The shared ThinkingBlock with the app's Markdown pipeline as its body. */
export function ReasoningBlock({
	content,
	durationMilliseconds,
	redacted,
	streaming = false,
	metrics,
}: {
	content: string;
	durationMilliseconds?: number;
	redacted: boolean;
	streaming?: boolean;
	metrics?: ChatMessage["meta"];
}) {
	const t = useTranslation();
	const seconds =
		durationMilliseconds === undefined
			? undefined
			: durationMilliseconds === 0
				? 0
				: Math.max(1, Math.round(durationMilliseconds / 1000));
	const label =
		streaming || seconds === undefined
			? t("Thinking")
			: t("Thought for {seconds}s", { seconds });
	const stats = streaming ? "" : formatRequestMetrics(metrics, t);
	const displayContent = content || (redacted ? "[redacted]" : "");
	if (!displayContent) {
		return null;
	}

	return (
		<ThinkingBlock
			className="my-0"
			durationMilliseconds={durationMilliseconds}
			isStreaming={streaming}
			label={stats ? `${label} · ${stats}` : label}
			title={
				stats
					? t(
							"Average output tokens per second over the model request, including prefill and waiting; cache is the cached share of input tokens.",
						)
					: undefined
			}
			redacted={redacted}
		>
			<MemoizedMarkdown
				classNames="text-sm"
				content={displayContent}
				streaming={streaming}
			/>
		</ThinkingBlock>
	);
}
