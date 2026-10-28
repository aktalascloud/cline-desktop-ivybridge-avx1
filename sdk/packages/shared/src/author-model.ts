/** DavidAU Qwen3.8 Next only, plus explicit model opt-in. Swift is excluded. */
export function isQwen38NextAuthorModel(modelId: unknown): boolean {
	return (
		typeof modelId === "string" &&
		/(?:^|[\/\s_-])david[-_ ]?au(?:$|[\/\s_-])/i.test(modelId) &&
		!/swift/i.test(modelId) &&
		/(?:^|[\/\s_-])qwen[-_ ]?3[._]8[-_ ]*(?:flash[-_ ]*)?next(?:$|[\/\s_-])/i.test(
			modelId,
		)
	);
}
