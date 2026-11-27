"use client";
import { readLanguage } from "@/lib/i18n";
import { t, useTranslation } from "@/lib/i18n";

import type { AgendaTaskRecord } from "@cline/shared";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

export function AgendaTaskReviewDialog({
	task,
	open,
	pending,
	confirmLabel = "Approve",
	rejectLabel = "Reject",
	onOpenChange,
	onConfirm,
	onReject,
}: {
	task: AgendaTaskRecord | null;
	open: boolean;
	pending: boolean;
	confirmLabel?: string;
	rejectLabel?: string;
	onOpenChange: (open: boolean) => void;
	onConfirm: (task: AgendaTaskRecord) => void | Promise<void>;
	onReject?: (task: AgendaTaskRecord) => void | Promise<void>;
}) {
	const t = useTranslation();
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="h-[min(720px,calc(100dvh-2rem))] w-[min(640px,calc(100vw-2rem))] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
				{task ? (
					<>
						<DialogHeader>
							<DialogTitle>{task.title}</DialogTitle>
							<DialogDescription>
								{t(
									"Review the exact revision before it can start a new agent session.",
								)}
							</DialogDescription>
						</DialogHeader>
						<div className="min-h-0 space-y-4 overflow-y-auto pr-1">
							<div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-muted/20 p-3 text-xs">
								<ReviewField
									label={t("Revision")}
									value={String(task.revision)}
								/>
								<ReviewField
									label={t("Priority")}
									value={`P${task.priority}`}
								/>
								<ReviewField label={t("Type")} value={task.type} />
								<ReviewField label={t("Mode")} value={task.mode ?? "act"} />
								<ReviewField
									label={t("Scope")}
									value={
										task.scope === "workspace"
											? (task.workspaceRoot ?? "workspace")
											: "General / chat workspace"
									}
								/>
								<ReviewField
									label={t("Expires")}
									value={new Date(task.expiresAt).toLocaleString(
										readLanguage(),
									)}
								/>
								<ReviewField
									label={t("Available")}
									value={new Date(task.availableAt).toLocaleString(
										readLanguage(),
									)}
								/>
								<ReviewField
									label={t("Assignee")}
									value={task.assignee ?? "Default agent"}
								/>
								<ReviewField
									label={t("Model")}
									value={
										task.modelSelection
											? `${task.modelSelection.providerId}/${task.modelSelection.modelId ?? "default"}`
											: "Cline default"
									}
								/>
								{task.cwd ? (
									<ReviewField
										label={t("Working directory")}
										value={task.cwd}
									/>
								) : null}
								<ReviewField
									label={t("Run limits")}
									value={
										[
											task.maxIterations
												? `${task.maxIterations} iterations`
												: undefined,
											task.timeoutSeconds
												? `${task.timeoutSeconds}s timeout`
												: undefined,
										]
											.filter(Boolean)
											.join(" · ") || "Hub defaults"
									}
								/>
							</div>
							{task.description ? (
								<ReviewText label={t("Description")} value={task.description} />
							) : null}
							<ReviewText label={t("Instructions")} value={task.instructions} />
							{task.systemPrompt ? (
								<ReviewText
									label={t("System prompt override")}
									value={task.systemPrompt}
								/>
							) : null}
							{task.resourcePaths.length > 0 ? (
								<div className="space-y-1.5">
									<h4 className="text-xs font-medium">{t("Files")}</h4>
									<ul className="space-y-1 rounded-md border bg-muted/20 p-3 font-mono text-[11px]">
										{task.resourcePaths.map((path) => (
											<li className="break-all" key={path}>
												{path}
											</li>
										))}
									</ul>
								</div>
							) : null}
						</div>
						<DialogFooter>
							<Button
								disabled={pending}
								onClick={() => {
									if (onReject) void onReject(task);
									else onOpenChange(false);
								}}
								type="button"
								variant={onReject ? "destructive" : "outline"}
							>
								{onReject ? rejectLabel : t("Not now")}
							</Button>
							<Button
								disabled={pending}
								onClick={() => void onConfirm(task)}
								type="button"
							>
								{pending ? <Loader2 className="size-4 animate-spin" /> : null}
								{confirmLabel}
							</Button>
						</DialogFooter>
					</>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

function ReviewField({ label, value }: { label: string; value: string }) {
	const t = useTranslation();
	return (
		<div className="min-w-0">
			<div className="text-muted-foreground">{label}</div>
			<div className="truncate font-medium capitalize" title={value}>
				{value}
			</div>
		</div>
	);
}

function ReviewText({ label, value }: { label: string; value: string }) {
	const t = useTranslation();
	return (
		<div className="space-y-1.5">
			<h4 className="text-xs font-medium">{label}</h4>
			<div className="whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-xs leading-relaxed">
				{value}
			</div>
		</div>
	);
}
