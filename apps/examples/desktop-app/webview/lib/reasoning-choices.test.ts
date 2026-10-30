import { expect, it } from "vitest";
import { modelReasoningChoices } from "./reasoning-choices";
it("retains unknown local choices and respects a server toggle or always-on effort list", () => {
	expect(modelReasoningChoices(undefined)).toBeUndefined();
	expect(modelReasoningChoices([{ type: "toggle" }])).toEqual(["none", "high"]);
	expect(
		modelReasoningChoices([
			{ type: "effort", values: ["low", "medium", "high", "xhigh"] },
		]),
	).toEqual(["low", "medium", "high", "xhigh"]);
});
