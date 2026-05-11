import { createContextCompactionPrepareTurn } from "@cline/core";
import type { Message } from "@cline/shared";
import type { Config } from "../../utils/types";

const FALLBACK_MANUAL_COMPACTION_MAX_INPUT_TOKENS = 64_000;

export async function compactInteractiveMessages(input: {
	config: Config;
	sessionId: string;
	messages: Message[];
}): Promise<{ compacted: boolean; messages: Message[] }> {
	const modelInfo = input.config.knownModels?.[input.config.modelId];
	const maxInputTokens =
		input.config.compaction?.maxInputTokens ??
		modelInfo?.maxInputTokens ??
		modelInfo?.contextWindow ??
		FALLBACK_MANUAL_COMPACTION_MAX_INPUT_TOKENS;
	const compact = createContextCompactionPrepareTurn(
		{
			providerConfig: input.config.providerConfig,
			providerId: input.config.providerId,
			modelId: input.config.modelId,
			compaction: {
				...input.config.compaction,
				enabled: true,
			},
			logger: input.config.logger,
		},
		{ mode: "manual" },
	)!;
	const result = await compact({
		agentId: "cli",
		conversationId: input.sessionId,
		parentAgentId: null,
		iteration: 0,
		messages: input.messages,
		apiMessages: input.messages,
		abortSignal: new AbortController().signal,
		systemPrompt: "",
		tools: [],
		model: {
			id: input.config.modelId,
			provider: input.config.providerId,
			info: {
				...(modelInfo ?? {}),
				id: modelInfo?.id ?? input.config.modelId,
				maxInputTokens: maxInputTokens,
			},
		},
	});
	if (!result) {
		return { compacted: false, messages: input.messages };
	}
	return { compacted: true, messages: result.messages };
}
