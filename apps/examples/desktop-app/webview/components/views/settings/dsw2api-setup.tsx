"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { desktopClient } from "@/lib/desktop-client";
import { useTranslation } from "@/lib/i18n";

type Status = { configured: boolean; available: boolean };
export function Dsw2ApiSetup({
	onConnected,
}: {
	onConnected: () => Promise<void>;
}) {
	const t = useTranslation();
	const [status, setStatus] = useState<Status | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState(false);
	useEffect(() => {
		let live = true;
		void desktopClient
			.invoke<Status>("dsw2api_status")
			.then((value) => {
				if (live) setStatus(value);
			})
			.catch(() => {});
		return () => {
			live = false;
		};
	}, []);
	const connect = async () => {
		if (busy) return;
		setBusy(true);
		setError(false);
		try {
			const { invoke } = await import("@tauri-apps/api/core");
			const session = await invoke<{ token: string; cookies: string }>(
				"dsw2api_browser_login",
			);
			await desktopClient.invoke("dsw2api_configure", session);
			await invoke("dsw2api_close_login");
			setStatus({ configured: true, available: true });
			await onConnected();
		} catch {
			setError(true);
		} finally {
			setBusy(false);
		}
	};
	const cancel = async () => {
		try {
			const { invoke } = await import("@tauri-apps/api/core");
			await invoke("dsw2api_close_login");
		} catch {}
	};
	return (
		<section className="flex flex-col gap-4 rounded-lg border p-5">
			<h3 className="font-semibold">DSW2API · DeepSeek</h3>
			<p className="text-sm text-muted-foreground">
				{t(
					"Sign in to your DeepSeek account in the browser. Cline connects the session automatically; no token or cookie copying is needed.",
				)}
			</p>
			<p className="text-xs text-muted-foreground">
				{t(
					"No ClinePass or local request/output quota. DeepSeek's own availability and limits still apply. Passwords and verification codes stay on DeepSeek's page.",
				)}
			</p>
			<div className="flex flex-wrap gap-2">
				<Button disabled={busy} onClick={() => void connect()}>
					{t(
						busy
							? "Finish signing in in the browser..."
							: status?.configured
								? "Switch DeepSeek account"
								: "Sign in through browser",
					)}
				</Button>
				{busy && (
					<Button variant="outline" onClick={() => void cancel()}>
						{t("Cancel")}
					</Button>
				)}
			</div>
			{status?.configured && (
				<p role="status" className="text-sm">
					{t("DeepSeek session connected.")}
				</p>
			)}
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{t(
						"Sign-in was not completed. Finish signing in in the browser and try again. Saved credentials were preserved.",
					)}
				</p>
			)}
		</section>
	);
}
