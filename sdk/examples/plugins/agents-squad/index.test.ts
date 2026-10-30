import { beforeEach, describe, expect, it, vi } from "vitest";
const { manager } = vi.hoisted(() => ({
	manager: {
		get: vi.fn(),
		start: vi.fn(),
		send: vi.fn(),
		readMessages: vi.fn(),
	},
}));
vi.mock("@cline/core", () => ({
	ClineCore: { create: async () => manager },
	createTool: (tool: unknown) => tool,
	stripUtf8Bom: (s: string) => s,
}));
import plugin from "./index";
const tools = new Map<string, any>();
plugin.setup!(
	{ registerTool: (tool: any) => tools.set(tool.name, tool) } as never,
	{} as never,
);
const ctx = {
	agentId: "parent",
	iteration: 0,
	sessionId: "parent-session",
	cwd: process.cwd(),
};
beforeEach(() => {
	vi.clearAllMocks();
	manager.get.mockResolvedValue({
		provider: "local-fixture",
		model: "fixture-model",
		cwd: process.cwd(),
	});
	manager.start.mockResolvedValue({ sessionId: "child" });
	manager.send.mockResolvedValue({
		finishReason: "error",
		text: "synthetic failure",
	});
	manager.readMessages.mockResolvedValue([]);
});
describe("portable subagent contract", () => {
	it("returns available presets instead of crashing on an invented preset", async () => {
		for (let i = 0; i < 4; i++)
			expect(
				await tools
					.get("start_subagent")
					.execute(
						{ preset: "playwright", label: "browser", task: "Check UI" },
						ctx,
					),
			).toMatchObject({
				status: "invalid_preset",
				availablePresets: expect.arrayContaining([
					"phantom",
					"oracle",
					"anvil",
					"inquisitor",
				]),
			});
		expect(manager.start).not.toHaveBeenCalled();
	});
	it("inherits the parent's local model and retains normal tool approvals", async () => {
		const result = await tools
			.get("start_subagent")
			.execute(
				{
					preset: "phantom",
					label: "inspect",
					task: "Inspect",
					notifyParent: false,
				},
				ctx,
			);
		expect(result.status).toBe("started");
		expect(manager.start.mock.calls[0][0].config).toMatchObject({
			providerId: "local-fixture",
			modelId: "fixture-model",
			enableSpawnAgent: false,
			enableAgentTeams: false,
		});
		expect(
			manager.start.mock.calls[0][0].config.autoApproveTools,
		).toBeUndefined();
		await new Promise((resolve) => setTimeout(resolve, 0));
		const status = await tools
			.get("get_subagent")
			.execute({ sessionId: "child" }, ctx);
		expect(status.status).toBe("failed");
	});
	it("allows explicit instructions for a custom preset and explicit provider override", async () => {
		expect(
			await tools
				.get("start_subagent")
				.execute(
					{
						preset: "custom",
						instructions: "Custom task instructions",
						providerId: "explicit-provider",
						modelId: "explicit-model",
						label: "custom",
						task: "Inspect",
						notifyParent: false,
					},
					ctx,
				),
		).toMatchObject({ status: "started" });
		expect(manager.start.mock.calls[0][0].config).toMatchObject({
			providerId: "explicit-provider",
			modelId: "explicit-model",
		});
	});
});
