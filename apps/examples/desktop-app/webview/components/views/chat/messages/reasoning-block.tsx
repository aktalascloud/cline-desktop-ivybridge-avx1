"use client";

import { ThinkingBlock } from "@cline/ui/components/agent-chat";
import { useTranslation } from "@/lib/i18n";
import { MemoizedMarkdown } from "../../../ui/markdown";

/** The shared ThinkingBlock with the app's Markdown pipeline as its body. */
export function ReasoningBlock({
	content,
	durationMilliseconds,
	redacted,
	streaming = false,
}: {
	content: string;
	durationMilliseconds?: number;
	redacted: boolean;
	streaming?: boolean;
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
	const displayContent = content || (redacted ? "[redacted]" : "");
	if (!displayContent) {
		return null;
	}

	return (
		<ThinkingBlock
			className="my-0"
			durationMilliseconds={durationMilliseconds}
			isStreaming={streaming}
			label={label}
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
