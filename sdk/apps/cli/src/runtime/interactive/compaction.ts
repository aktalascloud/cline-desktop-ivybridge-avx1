import { createContextCompactionPrepareTurn } from "@clinebot/core";
import type { Message } from "@clinebot/shared";
import type { Config } from "../../utils/types";

const FALLBACK_MANUAL_COMPACTION_CONTEXT_WINDOW_TOKENS = 64_000;

export async function compactInteractiveMessages(input: {
	config: Config;
	sessionId: string;
	messages: Message[];
}): Promise<{ compacted: boolean; messages: Message[] }> {
	const modelInfo = input.config.knownModels?.[input.config.modelId];
	const contextWindowTokens =
		input.config.compaction?.contextWindowTokens ??
		modelInfo?.contextWindow ??
		FALLBACK_MANUAL_COMPACTION_CONTEXT_WINDOW_TOKENS;
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
				contextWindow: contextWindowTokens,
			},
		},
	});
	if (!result) {
		return { compacted: false, messages: input.messages };
	}
	return { compacted: true, messages: result.messages };
}
