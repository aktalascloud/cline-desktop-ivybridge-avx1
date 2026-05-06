import type {
	GatewayProviderContext,
	GatewayStreamRequest,
} from "@clinebot/shared";
import {
	buildAnthropicCompatibleReasoningOptions,
	buildAnthropicProviderOptions,
	buildGatewayReasoningOptions,
	isAnthropicCompatibleModel,
	resolveAnthropicReasoningRequestPolicy,
	resolveModelFamily,
	shouldUseAnthropicPromptCache,
} from "./anthropic-compatible";
import {
	buildGlmThinkingProviderOptionsPatch,
	shouldSuppressGenericCompatibleThinking,
} from "./glm-thinking";
import {
	createEphemeralCacheControl,
	type ProviderOptionsPatch,
	toProviderOptionsKey,
} from "./utils";

export type { ProviderOptionsPatch } from "./utils";

export type AiSdkProviderOptionsTarget =
	| "openai"
	| "openai-compatible"
	| "anthropic"
	| "google"
	| "vertex"
	| "bedrock"
	| "mistral"
	| "claude-code"
	| "openai-codex"
	| "opencode"
	| "dify";

/** Merge patches in order. Later patches override earlier ones per bucket key. */
export function mergeProviderOptionPatches(
	patches: ReadonlyArray<ProviderOptionsPatch | undefined>,
): Record<string, unknown> {
	const result: Record<string, Record<string, unknown>> = {};
	for (const patch of patches) {
		if (!patch) {
			continue;
		}
		for (const [bucket, options] of Object.entries(patch)) {
			result[bucket] = { ...(result[bucket] ?? {}), ...options };
		}
	}
	return result;
}

function buildProviderAndAliasPatch(options: {
	providerId: string;
	providerOptionsKey: string;
	bucketOptions: Record<string, unknown>;
}): ProviderOptionsPatch {
	return {
		[options.providerId]: options.bucketOptions,
		...(options.providerOptionsKey !== options.providerId &&
		options.providerOptionsKey !== "anthropic"
			? { [options.providerOptionsKey]: options.bucketOptions }
			: {}),
	};
}

function isMoonshotKimiModel(modelId: string): boolean {
	const normalized = modelId.toLowerCase();
	return normalized.includes("moonshotai/kimi-");
}

function inferProviderOptionsTarget(
	providerId: string,
): AiSdkProviderOptionsTarget {
	switch (providerId) {
		case "openai-native":
			return "openai";
		case "anthropic":
			return "anthropic";
		case "google":
		case "gemini":
			return "google";
		case "vertex":
			return "vertex";
		case "bedrock":
			return "bedrock";
		case "mistral":
			return "mistral";
		case "claude-code":
			return "claude-code";
		case "openai-codex":
			return "openai-codex";
		case "opencode":
			return "opencode";
		case "dify":
			return "dify";
		default:
			return "openai-compatible";
	}
}

function buildDeepSeekThinkingPatch(options: {
	request: GatewayStreamRequest;
	providerOptionsKey: string;
}): ProviderOptionsPatch | undefined {
	const { request, providerOptionsKey } = options;
	if (request.providerId !== "deepseek") {
		return undefined;
	}
	if (request.reasoning?.enabled === undefined) {
		return undefined;
	}

	const bucketOptions = {
		thinking: {
			type: request.reasoning.enabled
				? ("enabled" as const)
				: ("disabled" as const),
		},
	};

	return {
		...buildProviderAndAliasPatch({
			providerId: request.providerId,
			providerOptionsKey,
			bucketOptions,
		}),
		openaiCompatible: bucketOptions,
	};
}

function buildCompatibleThinkingOptions(
	request: GatewayStreamRequest,
	context: GatewayProviderContext,
): Record<string, unknown> {
	const isAnthropicCompatible = isAnthropicCompatibleModel({
		modelId: request.modelId,
		family: resolveModelFamily(context),
	});
	const anthropicPolicy = isAnthropicCompatible
		? resolveAnthropicReasoningRequestPolicy(request, context)
		: undefined;
	return {
		...(!shouldSuppressGenericCompatibleThinking(request, context) &&
		request.reasoning?.enabled === true &&
		(!anthropicPolicy || anthropicPolicy.kind === "anthropic-adaptive")
			? { thinking: { type: "adaptive" } }
			: {}),
	};
}

function buildCompatibleEffortOptions(options: {
	reasoning: GatewayStreamRequest["reasoning"];
	isAnthropicCompatibleModelId: boolean;
	anthropicReasoningPolicyKind?: ReturnType<
		typeof resolveAnthropicReasoningRequestPolicy
	>["kind"];
}): Record<string, unknown> {
	const effort = options.reasoning?.effort;
	const shouldEmitEffort =
		Boolean(effort) &&
		(!options.isAnthropicCompatibleModelId ||
			options.anthropicReasoningPolicyKind === "anthropic-adaptive");
	return {
		...(shouldEmitEffort ? { effort } : {}),
		...(shouldEmitEffort ? { reasoningEffort: effort } : {}),
		...(shouldEmitEffort && !options.isAnthropicCompatibleModelId
			? { reasoningSummary: "auto" }
			: {}),
	};
}

function buildAnthropicCompatibleProviderOptions(
	request: GatewayStreamRequest,
	context: GatewayProviderContext,
): Record<string, unknown> {
	const reasoning = buildAnthropicCompatibleReasoningOptions(request, context);
	return reasoning ? { reasoning } : {};
}

function buildPromptCacheProviderOptions(
	request: GatewayStreamRequest,
	context: GatewayProviderContext,
): Record<string, unknown> {
	return shouldUseAnthropicPromptCache(request, context)
		? createEphemeralCacheControl()
		: {};
}

function buildOpenAINativeProviderOptions(
	request: GatewayStreamRequest,
): Record<string, unknown> {
	return request.providerId === "openai-native" ? { truncation: "auto" } : {};
}

function buildCompatibleProviderOptions(options: {
	request: GatewayStreamRequest;
	context: GatewayProviderContext;
	isAnthropicCompatibleModelId: boolean;
	target: AiSdkProviderOptionsTarget;
}): Record<string, unknown> {
	const { request, context, isAnthropicCompatibleModelId, target } = options;
	const anthropicReasoningPolicy = isAnthropicCompatibleModelId
		? resolveAnthropicReasoningRequestPolicy(request, context)
		: undefined;

	return {
		...(target === "openai-compatible" ? { strictJsonSchema: false } : {}),
		...buildCompatibleThinkingOptions(request, context),
		...buildCompatibleEffortOptions({
			reasoning: request.reasoning,
			isAnthropicCompatibleModelId,
			anthropicReasoningPolicyKind: anthropicReasoningPolicy?.kind,
		}),
		...buildAnthropicCompatibleProviderOptions(request, context),
		...buildPromptCacheProviderOptions(request, context),
		...buildOpenAINativeProviderOptions(request),
	};
}

function buildOpenAIProviderOptionsPatch(
	request: GatewayStreamRequest,
	target: AiSdkProviderOptionsTarget,
): ProviderOptionsPatch | undefined {
	if (target !== "openai") {
		return undefined;
	}

	return {
		openai: {
			strictJsonSchema: false,
			...buildOpenAINativeProviderOptions(request),
		},
	};
}

function buildBaseProviderOptionsPatch(
	compatibleOptions: Record<string, unknown>,
	anthropicOptions: Record<string, unknown>,
): ProviderOptionsPatch {
	return {
		anthropic: anthropicOptions,
		openaiCompatible: compatibleOptions,
	};
}

function buildOpenAICodexProviderOptionsPatch(
	request: GatewayStreamRequest,
	providerOptionsKey: string,
	compatibleOptions: Record<string, unknown>,
): ProviderOptionsPatch | undefined {
	if (request.providerId !== "openai-codex") {
		return undefined;
	}

	const codexOptions = {
		...compatibleOptions,
		instructions: request.systemPrompt,
		store: false,
		strictJsonSchema: false,
		systemMessageMode: "remove" as const,
	};

	return {
		openai: codexOptions,
		...buildProviderAndAliasPatch({
			providerId: request.providerId,
			providerOptionsKey,
			bucketOptions: codexOptions,
		}),
	};
}

function buildProviderFanoutPatch(
	request: GatewayStreamRequest,
	context: GatewayProviderContext,
	providerOptionsKey: string,
	compatibleOptions: Record<string, unknown>,
	target: AiSdkProviderOptionsTarget,
): ProviderOptionsPatch | undefined {
	if (target === "openai") {
		return undefined;
	}
	if (
		request.providerId === "anthropic" ||
		request.providerId === "openai-codex" ||
		request.providerId === "google"
	) {
		return undefined;
	}

	const gatewayReasoning = buildGatewayReasoningOptions(request, context);
	const providerOptions = {
		...compatibleOptions,
		...(request.providerId === "cline" && gatewayReasoning
			? { reasoning: gatewayReasoning }
			: {}),
	};

	return buildProviderAndAliasPatch({
		providerId: request.providerId,
		providerOptionsKey,
		bucketOptions: providerOptions,
	});
}

function buildGeminiProviderOptionsPatch(
	request: GatewayStreamRequest,
): ProviderOptionsPatch | undefined {
	if (request.providerId !== "google" && request.providerId !== "gemini") {
		return undefined;
	}
	if (!request.reasoning?.effort) {
		return undefined;
	}

	return {
		google: {
			thinkingConfig: {
				thinkingLevel: request.reasoning.effort,
				includeThoughts: true,
			},
		},
	};
}

function buildMoonshotKimiDisablePatch(options: {
	request: GatewayStreamRequest;
	providerOptionsKey: string;
}): ProviderOptionsPatch | undefined {
	const { request, providerOptionsKey } = options;
	if (request.reasoning?.enabled !== false) {
		return undefined;
	}
	if (!isMoonshotKimiModel(request.modelId)) {
		return undefined;
	}
	if (request.providerId !== "cline" && request.providerId !== "openrouter") {
		return undefined;
	}

	const bucketOptions = {
		thinking: { type: "disabled" as const },
	};

	return {
		...buildProviderAndAliasPatch({
			providerId: request.providerId,
			providerOptionsKey,
			bucketOptions,
		}),
		openaiCompatible: bucketOptions,
	};
}

/**
 * Compose AI SDK `providerOptions` from a small set of ordered patches.
 *
 * Precedence (low -> high):
 *  1. base shared buckets
 *  2. OpenAI adapter bucket
 *  3. codex provider-specific override
 *  4. provider-id + alias fanout
 *  5. gemini-specific google bucket
 *  6. DeepSeek thinking type patch
 *  7. Moonshot Kimi disable patch
 *  8. GLM/Z.AI overlay
 */
export function composeAiSdkProviderOptions(
	request: GatewayStreamRequest,
	context: GatewayProviderContext,
	target: AiSdkProviderOptionsTarget = inferProviderOptionsTarget(
		request.providerId,
	),
): Record<string, unknown> {
	const providerOptionsKey = toProviderOptionsKey(request.providerId);
	const isAnthropicCompatibleModelId = isAnthropicCompatibleModel({
		modelId: request.modelId,
		family: resolveModelFamily(context),
	});
	const compatibleOptions = buildCompatibleProviderOptions({
		request,
		context,
		isAnthropicCompatibleModelId,
		target,
	});
	const anthropicOptions = buildAnthropicProviderOptions(request, context);

	return mergeProviderOptionPatches([
		buildBaseProviderOptionsPatch(compatibleOptions, anthropicOptions),
		buildOpenAIProviderOptionsPatch(request, target),
		buildOpenAICodexProviderOptionsPatch(
			request,
			providerOptionsKey,
			compatibleOptions,
		),
		buildProviderFanoutPatch(
			request,
			context,
			providerOptionsKey,
			compatibleOptions,
			target,
		),
		buildGeminiProviderOptionsPatch(request),
		buildDeepSeekThinkingPatch({ request, providerOptionsKey }),
		buildMoonshotKimiDisablePatch({ request, providerOptionsKey }),
		buildGlmThinkingProviderOptionsPatch(request, context, providerOptionsKey),
	]);
}
