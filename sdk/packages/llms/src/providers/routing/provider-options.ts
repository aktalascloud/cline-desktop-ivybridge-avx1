import type {
	GatewayProviderContext,
	GatewayStreamRequest,
} from "@cline/shared";
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

/**
 * Providers that own their full provider-options shape and skip the generic
 * fanout (because another patch — anthropic base, codex override, gemini —
 * fills their bucket).
 */
const PROVIDERS_SKIPPING_GENERIC_FANOUT = new Set([
	"anthropic",
	"openai-codex",
	"google",
]);

/** Providers that participate in the Moonshot Kimi disable patch. */
const MOONSHOT_KIMI_DISABLE_PROVIDERS = new Set(["cline", "openrouter"]);

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

/**
 * Build a patch that targets the concrete provider id and, when distinct, its
 * camelCase alias (e.g. `vercel-ai-gateway` + `vercelAiGateway`). The alias
 * is omitted when it would collapse to the provider id or to "anthropic".
 */
function buildProviderAndAliasPatch(options: {
	providerId: string;
	providerOptionsKey: string;
	bucketOptions: Record<string, unknown>;
}): ProviderOptionsPatch {
	const { providerId, providerOptionsKey, bucketOptions } = options;
	const needsAlias =
		providerOptionsKey !== providerId && providerOptionsKey !== "anthropic";
	return {
		[providerId]: bucketOptions,
		...(needsAlias ? { [providerOptionsKey]: bucketOptions } : {}),
	};
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

/**
 * Many overlays emit the same `thinking: { type: ... }` shape across the
 * provider-id bucket, the camelCase alias, and the shared `openaiCompatible`
 * bucket. This is the shared shape.
 */
function buildThinkingPatch(options: {
	providerId: string;
	providerOptionsKey: string;
	thinkingType: "enabled" | "disabled";
}): ProviderOptionsPatch {
	const bucketOptions = { thinking: { type: options.thinkingType } };
	return {
		...buildProviderAndAliasPatch({
			providerId: options.providerId,
			providerOptionsKey: options.providerOptionsKey,
			bucketOptions,
		}),
		openaiCompatible: bucketOptions,
	};
}

function isMoonshotKimiModel(modelId: string): boolean {
	return modelId.toLowerCase().includes("moonshotai/kimi-");
}

function isKimiK26Family(context: GatewayProviderContext): boolean {
	return resolveModelFamily(context)?.trim().toLowerCase() === "kimi-k2.6";
}

function isDeepSeekFamily(context: GatewayProviderContext): boolean {
	return (
		resolveModelFamily(context)?.trim().toLowerCase().includes("deepseek") ===
		true
	);
}

/**
 * Family-gated thinking rules. Each rule decides which models match (by
 * family/provider id/model id) and what `thinking.type` to emit when
 * `reasoning.enabled` is unset. Explicit `enabled`/`disabled` always wins.
 */
type FamilyThinkingRule = {
	matches: (
		request: GatewayStreamRequest,
		context: GatewayProviderContext,
	) => boolean;
	defaultWhenUnset: "enabled" | "disabled" | undefined;
};

const FAMILY_THINKING_RULES: ReadonlyArray<FamilyThinkingRule> = [
	{
		matches: (_request, context) => isKimiK26Family(context),
		defaultWhenUnset: "enabled",
	},
	{
		matches: (request, context) =>
			isDeepSeekFamily(context) || request.providerId === "deepseek",
		defaultWhenUnset: undefined,
	},
];

function hasFamilyThinkingRule(
	request: GatewayStreamRequest,
	context: GatewayProviderContext,
): boolean {
	return FAMILY_THINKING_RULES.some((r) => r.matches(request, context));
}

function resolveFamilyThinkingType(
	request: GatewayStreamRequest,
	context: GatewayProviderContext,
): "enabled" | "disabled" | undefined {
	const rule = FAMILY_THINKING_RULES.find((r) => r.matches(request, context));
	if (!rule) {
		return undefined;
	}
	const enabled = request.reasoning?.enabled;
	if (enabled === true) {
		return "enabled";
	}
	if (enabled === false) {
		return "disabled";
	}
	return rule.defaultWhenUnset;
}

function buildCompatibleThinkingOptions(
	request: GatewayStreamRequest,
	context: GatewayProviderContext,
): Record<string, unknown> {
	if (
		shouldSuppressGenericCompatibleThinking(request, context) ||
		hasFamilyThinkingRule(request, context)
	) {
		return {};
	}
	if (request.reasoning?.enabled !== true) {
		return {};
	}
	const isAnthropicCompatible = isAnthropicCompatibleModel({
		modelId: request.modelId,
		family: resolveModelFamily(context),
	});
	const anthropicPolicy = isAnthropicCompatible
		? resolveAnthropicReasoningRequestPolicy(request, context)
		: undefined;
	if (anthropicPolicy && anthropicPolicy.kind !== "anthropic-adaptive") {
		return {};
	}
	return { thinking: { type: "adaptive" } };
}

function buildCompatibleEffortOptions(options: {
	reasoning: GatewayStreamRequest["reasoning"];
	isAnthropicCompatibleModelId: boolean;
	anthropicReasoningPolicyKind?: ReturnType<
		typeof resolveAnthropicReasoningRequestPolicy
	>["kind"];
}): Record<string, unknown> {
	const effort = options.reasoning?.effort;
	if (!effort) {
		return {};
	}
	const allowEffort =
		!options.isAnthropicCompatibleModelId ||
		options.anthropicReasoningPolicyKind === "anthropic-adaptive";
	if (!allowEffort) {
		return {};
	}
	return {
		effort,
		reasoningEffort: effort,
		...(options.isAnthropicCompatibleModelId
			? {}
			: { reasoningSummary: "auto" }),
	};
}

function buildOpenAINativeProviderOptions(
	request: GatewayStreamRequest,
): Record<string, unknown> {
	const isNativeOpenAIClient = [
		"openai-native",
		"openai",
		"openai-codex",
	].includes(request.providerId);
	return isNativeOpenAIClient ? { truncation: "auto" } : {};
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
	const reasoning = buildAnthropicCompatibleReasoningOptions(request, context);
	const promptCache = shouldUseAnthropicPromptCache(request, context)
		? createEphemeralCacheControl()
		: {};

	return {
		...(target === "openai-compatible" ? { strictJsonSchema: false } : {}),
		...buildCompatibleThinkingOptions(request, context),
		...buildCompatibleEffortOptions({
			reasoning: request.reasoning,
			isAnthropicCompatibleModelId,
			anthropicReasoningPolicyKind: anthropicReasoningPolicy?.kind,
		}),
		...(reasoning ? { reasoning } : {}),
		...promptCache,
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
	if (PROVIDERS_SKIPPING_GENERIC_FANOUT.has(request.providerId)) {
		return undefined;
	}

	const gatewayReasoning =
		request.providerId === "cline"
			? buildGatewayReasoningOptions(request, context)
			: undefined;

	return buildProviderAndAliasPatch({
		providerId: request.providerId,
		providerOptionsKey,
		bucketOptions: {
			...compatibleOptions,
			...(gatewayReasoning ? { reasoning: gatewayReasoning } : {}),
		},
	});
}

function buildGeminiProviderOptionsPatch(
	request: GatewayStreamRequest,
): ProviderOptionsPatch | undefined {
	const isGemini =
		request.providerId === "google" || request.providerId === "gemini";
	if (!isGemini || !request.reasoning?.effort) {
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
	context: GatewayProviderContext;
	providerOptionsKey: string;
}): ProviderOptionsPatch | undefined {
	const { request, context, providerOptionsKey } = options;
	if (request.reasoning?.enabled !== false) {
		return undefined;
	}
	if (!isMoonshotKimiModel(request.modelId)) {
		return undefined;
	}
	if (isKimiK26Family(context)) {
		return undefined;
	}
	if (!MOONSHOT_KIMI_DISABLE_PROVIDERS.has(request.providerId)) {
		return undefined;
	}

	return buildThinkingPatch({
		providerId: request.providerId,
		providerOptionsKey,
		thinkingType: "disabled",
	});
}

function buildFamilyThinkingPatch(options: {
	request: GatewayStreamRequest;
	context: GatewayProviderContext;
	providerOptionsKey: string;
}): ProviderOptionsPatch | undefined {
	const { request, context, providerOptionsKey } = options;
	const thinkingType = resolveFamilyThinkingType(request, context);
	if (!thinkingType) {
		return undefined;
	}

	return buildThinkingPatch({
		providerId: request.providerId,
		providerOptionsKey,
		thinkingType,
	});
}

/**
 * Compose AI SDK `providerOptions` from a small set of ordered patches.
 *
 * Precedence (low -> high):
 *  1. base/openai-compatible buckets
 *  2. OpenAI adapter bucket
 *  3. codex provider-specific override
 *  4. provider-id + alias fanout
 *  5. gemini-specific google bucket
 *  6. Moonshot Kimi disable patch
 *  7. Family-gated thinking patch (Kimi K2.6, DeepSeek)
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

	const patches: Array<ProviderOptionsPatch | undefined> = [
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
		buildMoonshotKimiDisablePatch({ request, context, providerOptionsKey }),
		buildFamilyThinkingPatch({ request, context, providerOptionsKey }),
		buildGlmThinkingProviderOptionsPatch(request, context, providerOptionsKey),
	];

	return mergeProviderOptionPatches(patches);
}
