import type { SidecarContext } from "./types";

const IDLE_OR_FINISHED = new Set([
	"idle",
	"completed",
	"failed",
	"stopped",
	"cancelled",
	"canceled",
	"aborted",
	"interrupted",
	"expired",
]);
/** On-demand check of every connected Hub, including sessions started by CLI. */
export async function getUpdateSafety(
	ctx: SidecarContext,
): Promise<{ safe: boolean; activeSessionCount: number }> {
	if (!ctx.runtimeBindings?.size) return { safe: false, activeSessionCount: 0 };
	let activeSessionCount = 0;
	for (const session of ctx.liveSessions.values()) {
		if (
			session.busy ||
			session.promptsInQueue.length > 0 ||
			!IDLE_OR_FINISHED.has(session.status)
		)
			activeSessionCount++;
	}
	try {
		for (const binding of ctx.runtimeBindings.values()) {
			const rows = await binding.sessionManager.list(10_000, {
				hydrate: false,
			});
			if (rows.length >= 10_000) return { safe: false, activeSessionCount };
			for (const row of rows) {
				if (!IDLE_OR_FINISHED.has(row.status)) activeSessionCount++;
			}
		}
		return { safe: activeSessionCount === 0, activeSessionCount };
	} catch {
		return { safe: false, activeSessionCount };
	}
}
