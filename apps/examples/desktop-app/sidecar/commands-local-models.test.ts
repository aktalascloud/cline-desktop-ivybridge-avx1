import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleCommand } from "./commands";
import type { SidecarContext } from "./types";
const { backend } = vi.hoisted(() => ({
	backend: vi.fn(async () => ({ fixture: true })),
}));
const commands = [
	"get_local_models_status",
	"pull_local_model",
	"cancel_local_model_pull",
	"load_local_model",
	"unload_local_model",
	"delete_local_model",
	"show_local_model",
	"start_local_runtime",
];
vi.mock("./local-models", () => ({
	LOCAL_MODELS_COMMANDS: new Set([
		"get_local_models_status",
		"pull_local_model",
		"cancel_local_model_pull",
		"load_local_model",
		"unload_local_model",
		"delete_local_model",
		"show_local_model",
		"start_local_runtime",
	]),
	handleLocalModelsCommand: backend,
}));
beforeEach(() => backend.mockClear());
describe("local model command trust boundary", () => {
	it.each(
		commands,
	)("rejects %s before any runtime operation", async (command) => {
		const context = {} as SidecarContext;
		const args = { runtime: "ollama", model: "fixture" };
		await expect(handleCommand(context, command, args)).rejects.toThrow(
			"trusted desktop connection",
		);
		await expect(
			handleCommand(context, command, args, {
				connection: { send: vi.fn(), data: { canApproveTools: false } },
			}),
		).rejects.toThrow("trusted desktop connection");
		expect(backend).not.toHaveBeenCalled();
	});
	it.each(commands)("forwards trusted %s to its backend", async (command) => {
		const context = {} as SidecarContext;
		const args = { runtime: "ollama", model: "fixture" };
		await expect(
			handleCommand(context, command, args, {
				connection: { send: vi.fn(), data: { canApproveTools: true } },
			}),
		).resolves.toEqual({ fixture: true });
		expect(backend).toHaveBeenCalledWith(context, command, args);
	});
});
