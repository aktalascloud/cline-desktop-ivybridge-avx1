import type {
	CoreCompactionConfig,
	CoreCompactionContext,
	CoreCompactionResult,
	CoreCompactionStrategy,
	CoreSessionConfig,
} from "../../types/config";
import type { ProviderConfig } from "../../types/provider-settings";
import { runAgenticCompaction } from "./agentic-compaction";
import { runBasicCompaction } from "./basic-compaction";
import {
	createTokenEstimator,
	DEFAULT_CONTEXT_WINDOW_TOKENS,
	DEFAULT_PRESERVE_RECENT_TOKENS,
	DEFAULT_THRESHOLD_RATIO,
} from "./compaction-shared";

export interface ContextPipelinePrepareTurnInput {
	agentId: string;
	conversationId: string;
	parentAgentId: string | null;
	iteration: number;
	messages: CoreCompactionContext["messages"];
	apiMessages: CoreCompactionContext["messages"];
	abortSignal: AbortSignal;
	systemPrompt: string;
	tools: unknown[];
	model: CoreCompactionContext["model"];
	emitStatusNotice?: (
		message: string,
		metadata?: Record<string, unknown>,
	) => void;
}

export interface ContextPipelinePrepareTurnResult {
	messages: CoreCompactionContext["messages"];
	systemPrompt?: string;
}

type EstimateMessageTokens = ReturnType<typeof createTokenEstimator>;

type BuiltinCompactionStrategyOptions = {
	context: CoreCompactionContext;
	providerConfig: ProviderConfig;
	compaction: CoreCompactionConfig | undefined;
	mode: ContextCompactionMode;
	estimateMessageTokens: EstimateMessageTokens;
	logger: Pick<CoreSessionConfig, "logger">["logger"];
};

type BuiltinCompactionStrategyRunner = (
	options: BuiltinCompactionStrategyOptions,
) =>
	| Promise<CoreCompactionResult | undefined>
	| CoreCompactionResult
	| undefined;

export type ContextCompactionMode = "auto" | "manual";

export interface ContextCompactionPrepareTurnOptions {
	mode?: ContextCompactionMode;
	manualTargetRatio?: number;
}

const BUILTIN_COMPACTION_STRATEGIES = {
	basic: ({ context, estimateMessageTokens, logger }) =>
		runBasicCompaction({
			context,
			estimateMessageTokens,
			logger,
		}),
	agentic: ({
		context,
		providerConfig,
		compaction,
		mode,
		estimateMessageTokens,
		logger,
	}) =>
		runAgenticCompaction({
			context,
			providerConfig,
			summarizer: compaction?.summarizer,
			preserveRecentTokens:
				mode === "manual"
					? Math.min(
							compaction?.preserveRecentTokens ??
								DEFAULT_PRESERVE_RECENT_TOKENS,
							context.triggerTokens,
						)
					: (compaction?.preserveRecentTokens ??
						DEFAULT_PRESERVE_RECENT_TOKENS),
			estimateMessageTokens,
			logger,
		}),
} satisfies Record<CoreCompactionStrategy, BuiltinCompactionStrategyRunner>;

function resolveTriggerState(input: {
	inputTokens: number;
	contextWindowTokens: number;
	config: CoreCompactionConfig;
}): { shouldCompact: boolean; triggerTokens: number; thresholdRatio: number } {
	if (typeof input.config.reserveTokens === "number") {
		const reserveTokens = Math.max(0, input.config.reserveTokens);
		const triggerTokens = Math.max(
			0,
			input.contextWindowTokens - reserveTokens,
		);
		return {
			shouldCompact: input.inputTokens > triggerTokens,
			triggerTokens,
			thresholdRatio:
				input.contextWindowTokens > 0
					? triggerTokens / input.contextWindowTokens
					: 0,
		};
	}

	const thresholdRatio = input.config.thresholdRatio ?? DEFAULT_THRESHOLD_RATIO;
	const triggerTokens = input.contextWindowTokens * thresholdRatio;
	return {
		shouldCompact: input.inputTokens > triggerTokens,
		triggerTokens,
		thresholdRatio,
	};
}

function resolveManualTargetState(input: {
	inputTokens: number;
	contextWindowTokens: number;
	autoTriggerTokens: number;
	manualTargetRatio: number | undefined;
}): { triggerTokens: number; thresholdRatio: number } {
	const ratio =
		typeof input.manualTargetRatio === "number" &&
		Number.isFinite(input.manualTargetRatio)
			? input.manualTargetRatio
			: 0.5;
	const targetRatio = Math.min(0.95, Math.max(0.05, ratio));
	// Keep manual compaction at least as aggressive as the configured auto
	// threshold; very low thresholdRatio values intentionally dominate here.
	const targetTokens = Math.max(
		1,
		Math.floor(
			Math.min(input.autoTriggerTokens, input.inputTokens * targetRatio),
		),
	);
	return {
		triggerTokens: targetTokens,
		thresholdRatio:
			input.contextWindowTokens > 0
				? targetTokens / input.contextWindowTokens
				: 0,
	};
}

export function createContextCompactionPrepareTurn(
	config: Pick<
		CoreSessionConfig,
		"providerConfig" | "providerId" | "modelId" | "compaction" | "logger"
	>,
	options: ContextCompactionPrepareTurnOptions = {},
):
	| ((
			context: ContextPipelinePrepareTurnInput,
	  ) => Promise<ContextPipelinePrepareTurnResult | undefined>)
	| undefined {
	const userCompaction = config.compaction;
	if (userCompaction?.enabled !== true) {
		return undefined;
	}

	const providerConfig =
		config.providerConfig ??
		({
			providerId: config.providerId,
			modelId: config.modelId,
		} as ProviderConfig);
	const estimateMessageTokens = createTokenEstimator();
	const strategy = userCompaction?.strategy ?? "basic";
	const runBuiltinStrategy = BUILTIN_COMPACTION_STRATEGIES[strategy];
	const mode = options.mode ?? "auto";

	return async (context) => {
		const inputTokens = context.apiMessages.reduce(
			(total: number, message) => total + estimateMessageTokens(message),
			0,
		);
		const contextWindowTokens =
			userCompaction?.contextWindowTokens ??
			context.model.info?.contextWindow ??
			DEFAULT_CONTEXT_WINDOW_TOKENS;
		if (
			typeof contextWindowTokens !== "number" ||
			!Number.isFinite(contextWindowTokens) ||
			contextWindowTokens <= 0
		) {
			return undefined;
		}

		const triggerState = resolveTriggerState({
			inputTokens,
			contextWindowTokens,
			config: {
				reserveTokens: userCompaction?.reserveTokens,
				thresholdRatio: userCompaction?.thresholdRatio,
			},
		});
		if (mode === "auto" && !triggerState.shouldCompact) {
			return undefined;
		}
		const targetState =
			mode === "manual"
				? resolveManualTargetState({
						inputTokens,
						contextWindowTokens,
						autoTriggerTokens: triggerState.triggerTokens,
						manualTargetRatio: options.manualTargetRatio,
					})
				: triggerState;

		const compactionContext = {
			agentId: context.agentId,
			conversationId: context.conversationId,
			parentAgentId: context.parentAgentId,
			iteration: context.iteration,
			messages: context.messages,
			model: context.model,
			contextWindowTokens,
			triggerTokens: targetState.triggerTokens,
			thresholdRatio: targetState.thresholdRatio,
			utilizationRatio:
				contextWindowTokens > 0 ? inputTokens / contextWindowTokens : 0,
		};

		const statusReason =
			mode === "manual" ? "manual_compaction" : "auto_compaction";
		context.emitStatusNotice?.(
			mode === "manual" ? "compacting" : "auto-compacting",
			{
				kind: statusReason,
				reason: statusReason,
				iteration: context.iteration,
				triggerTokens: targetState.triggerTokens,
				contextWindowTokens,
			},
		);

		const beforeMessageCount = context.messages.length;

		const result = userCompaction?.compact
			? await userCompaction.compact(compactionContext)
			: await runBuiltinStrategy({
					context: compactionContext,
					providerConfig: {
						...providerConfig,
						abortSignal: context.abortSignal,
					},
					compaction: userCompaction,
					mode,
					estimateMessageTokens,
					logger: config.logger,
				});

		if (result?.messages) {
			const afterTokens = result.messages.reduce(
				(total: number, message) => total + estimateMessageTokens(message),
				0,
			);
			config.logger?.log("Context compaction completed", {
				severity: "info",
				strategy: strategy,
				contextWindowTokens,
				inputTokens,
				afterTokens,
				tokensSaved: inputTokens - afterTokens,
				utilizationBefore: `${((inputTokens / contextWindowTokens) * 100).toFixed(1)}%`,
				utilizationAfter: `${((afterTokens / contextWindowTokens) * 100).toFixed(1)}%`,
				thresholdTrigger: `${(targetState.thresholdRatio * 100).toFixed(1)}%`,
				messagesBefore: beforeMessageCount,
				messagesAfter: result.messages.length,
				messagesRemoved: beforeMessageCount - result.messages.length,
			} as Record<string, unknown>);
		}

		return result;
	};
}
