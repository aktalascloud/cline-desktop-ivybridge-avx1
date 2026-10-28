/** Extra author controls require this model family AND explicit model opt-in. */
export function isQwen38NextAuthorModel(modelId: unknown): boolean {
	return (
		typeof modelId === "string" &&
		/(?:^|[\/\s_-])qwen[-_ ]?3[._]8[-_ ]*(?:flash[-_ ]*)?next(?:$|[\/\s_-])/i.test(
			modelId,
		)
	);
}
