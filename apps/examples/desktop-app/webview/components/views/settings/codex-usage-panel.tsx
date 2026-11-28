"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { desktopClient } from "@/lib/desktop-client";
import { useTranslation } from "@/lib/i18n";
import type { CodexUsage } from "../../../../sidecar/codex-usage";

export function CodexUsagePanel() {
	const t = useTranslation();
	const [revision, setRevision] = useState(0);
	const [result, setResult] = useState<CodexUsage | null>(null);
	const [status, setStatus] = useState<"loading" | "ready" | "error">(
		"loading",
	);

	useEffect(() => {
		let active = true;
		void desktopClient
			.invoke<CodexUsage | null>("get_codex_usage")
			.then((usage) => {
				if (!active) return;
				setResult(usage);
				setStatus("ready");
			})
			.catch(() => {
				if (!active) return;
				setResult(null);
				setStatus("error");
			});
		return () => {
			active = false;
		};
	}, [revision]);

	return (
		<div className="mt-3 space-y-2 rounded-lg border px-4 py-3 text-sm">
			<div className="flex items-center justify-between gap-2">
				<span className="font-medium">{t("Codex subscription limits")}</span>
				<Button
					size="sm"
					variant="ghost"
					disabled={status === "loading"}
					onClick={() => {
						setStatus("loading");
						setRevision((value) => value + 1);
					}}
				>
					{t("Refresh")}
				</Button>
			</div>
			{status === "loading" && (
				<p role="status">{t("Loading subscription limits...")}</p>
			)}
			{status === "error" && (
				<p role="status">{t("Could not load Codex subscription limits.")}</p>
			)}
			{status === "ready" && !result?.limits.length && (
				<p role="status">{t("No Codex limits reported for this account.")}</p>
			)}
			{status === "ready" &&
				result?.limits.map((limit, group) => (
					<div key={group} className="space-y-2">
						{limit.label && <p className="font-medium">{limit.label}</p>}
						{limit.windows.map((window, index) => {
							const hours = (window.windowSeconds ?? 0) / 3600;
							const duration =
								hours > 0
									? t("{hours} h window").replace(
											"{hours}",
											String(Number(hours.toFixed(2))),
										)
									: t(index === 0 ? "Primary window" : "Secondary window");
							const remaining = 100 - window.usedPercent;
							return (
								<div key={index}>
									<p>
										{duration} ·{" "}
										{t("{percent}% remaining").replace(
											"{percent}",
											String(Number(remaining.toFixed(1))),
										)}
									</p>
									<progress
										className="w-full"
										aria-label={duration}
										value={remaining}
										max={100}
									/>
									{window.resetsAt && (
										<p className="text-xs text-muted-foreground">
											{t("Resets {time}").replace(
												"{time}",
												new Date(window.resetsAt * 1000).toLocaleString(),
											)}
										</p>
									)}
								</div>
							);
						})}
					</div>
				))}
		</div>
	);
}
