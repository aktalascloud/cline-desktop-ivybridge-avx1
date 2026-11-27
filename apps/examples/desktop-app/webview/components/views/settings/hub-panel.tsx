"use client";
import { readLanguage } from "@/lib/i18n";
import { t, useTranslation } from "@/lib/i18n";

import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { desktopClient } from "@/lib/desktop-client";
import type { HubStatus } from "@/lib/hub-status";

export function HubPanel() {
	const t = useTranslation();
	const [status, setStatus] = useState<HubStatus | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [restarting, setRestarting] = useState(false);
	const restartingRef = useRef(false);
	const generation = useRef(0);

	useEffect(() => {
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout>;
		async function refresh() {
			const requestGeneration = generation.current;
			try {
				if (!restartingRef.current) {
					const next = await desktopClient.invoke<HubStatus>("get_hub_status");
					if (!cancelled && requestGeneration === generation.current) {
						setStatus(next);
						setError(null);
					}
				}
			} catch (cause) {
				if (!cancelled && requestGeneration === generation.current) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			} finally {
				if (!cancelled) timer = setTimeout(refresh, 2000);
			}
		}
		void refresh();
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, []);

	async function restart() {
		if (restartingRef.current) return;
		restartingRef.current = true;
		generation.current += 1;
		setRestarting(true);
		setError(null);
		try {
			setStatus(await desktopClient.invoke<HubStatus>("restart_hub"));
			setConfirmOpen(false);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
			setConfirmOpen(false);
		} finally {
			restartingRef.current = false;
			setRestarting(false);
		}
	}

	return (
		<section className="border-b py-6" aria-labelledby="hub-heading">
			<div className="flex items-center justify-between gap-4">
				<div className="min-w-0">
					<h2 id="hub-heading" className="text-lg font-semibold">
						{t("Cline Hub")}
					</h2>
					{status ? (
						<p className="mt-1 break-all font-mono text-xs text-muted-foreground">
							{status.url}
						</p>
					) : null}
					<p className="mt-1 text-sm text-muted-foreground">
						{t(
							"Restart the local hub to stop active sessions and reconnect clients.",
						)}
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					disabled={!status || restarting}
					onClick={() => setConfirmOpen(true)}
				>
					<RefreshCw
						className={restarting ? "size-3 animate-spin" : "size-3"}
					/>
					{restarting ? t("Restarting…") : t("Restart Hub")}
				</Button>
			</div>
			{error ? (
				<p className="mt-3 text-sm text-destructive" role="alert">
					{error}
				</p>
			) : null}
			{!status && !error ? (
				<p className="mt-4 text-sm text-muted-foreground">
					{t("Loading hub…")}
				</p>
			) : null}
			{status ? (
				<div className="mt-4 grid gap-4 lg:grid-cols-2">
					<div className="min-w-0 rounded-lg border">
						<h3 className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
							{t("Connected clients")}
							<Badge variant="secondary">{status.clients.length}</Badge>
						</h3>
						<ul className="max-h-72 overflow-auto divide-y">
							{status.clients.map((client) => (
								<li className="px-4 py-3" key={client.clientId}>
									<p className="break-words text-sm font-medium">
										{client.displayName || client.clientType}
									</p>
									<p className="break-all text-xs text-muted-foreground">
										{client.clientType} · {client.clientId}
									</p>
									<p className="mt-1 text-xs text-muted-foreground">
										{t("Connected ")}
										{new Date(client.connectedAt).toLocaleString(
											readLanguage(),
										)}
									</p>
								</li>
							))}
						</ul>
						{status.clients.length === 0 ? (
							<p className="p-4 text-sm text-muted-foreground">
								{t("No connected clients.")}
							</p>
						) : null}
					</div>
					<div className="min-w-0 rounded-lg border">
						<h3 className="border-b px-4 py-3 text-sm font-semibold">
							{t("Recent events")}
						</h3>
						<ol className="max-h-72 overflow-auto divide-y">
							{status.events.map((event) => (
								<li className="px-4 py-3" key={event.id}>
									<div className="flex justify-between gap-3 text-sm">
										<span>{event.title}</span>
										<time
											className="shrink-0 text-xs text-muted-foreground"
											dateTime={new Date(event.timestamp).toISOString()}
										>
											{new Date(event.timestamp).toLocaleTimeString(
												readLanguage(),
											)}
										</time>
									</div>
									<p className="break-words text-xs text-muted-foreground">
										{event.detail}
									</p>
								</li>
							))}
						</ol>
						{status.events.length === 0 ? (
							<p className="p-4 text-sm text-muted-foreground">
								{t(
									"No recent events. Activity is recorded while the desktop app is running.",
								)}
							</p>
						) : null}
					</div>
				</div>
			) : null}
			<AlertDialog
				open={confirmOpen}
				onOpenChange={(open) => {
					if (!restarting) setConfirmOpen(open);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("Restart Cline Hub?")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t(
								"This stops the local hub and its active sessions, then starts a fresh hub. Connected desktop, CLI, and VS Code clients will disconnect and reconnect.",
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={restarting}>
							{t("Cancel")}
						</AlertDialogCancel>
						<Button
							variant="destructive"
							disabled={restarting}
							onClick={() => void restart()}
						>
							{restarting ? t("Restarting…") : t("Restart Hub")}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	);
}
