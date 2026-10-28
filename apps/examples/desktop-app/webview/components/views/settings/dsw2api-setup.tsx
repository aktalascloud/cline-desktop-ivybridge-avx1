"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { desktopClient, openExternalUrl } from "@/lib/desktop-client";
import { useTranslation } from "@/lib/i18n";

/** Session material stays in this form until sent to the trusted local backend. */
export function Dsw2ApiSetup({
	onConnected,
}: {
	onConnected: () => Promise<void>;
}) {
	const t = useTranslation();
	const [token, setToken] = useState("");
	const [cookies, setCookies] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState(false);
	const [connected, setConnected] = useState(false);
	const connect = async (saved = false) => {
		if (busy) return;
		setBusy(true);
		setError(false);
		setConnected(false);
		try {
			await desktopClient.invoke(
				saved ? "dsw2api_connect" : "dsw2api_configure",
				saved ? {} : { token: token.trim(), cookies: cookies.trim() },
			);
			setToken("");
			setCookies("");
			setConnected(true);
			await onConnected();
		} catch {
			setError(true);
		} finally {
			setBusy(false);
		}
	};
	return (
		<section className="flex flex-col gap-3 rounded-lg border p-5">
			<h3 className="font-semibold">DSW2API · DeepSeek Web</h3>
			<p className="text-sm text-muted-foreground">
				{t(
					"Use your own DeepSeek web account. No ClinePass, local request quota or output cap. DeepSeek availability and service limits still apply.",
				)}
			</p>
			<Button
				variant="outline"
				onClick={() =>
					void openExternalUrl("https://chat.deepseek.com/sign_in")
				}
			>
				{t("Register / sign in to DeepSeek")}
			</Button>
			<p className="text-sm text-muted-foreground">
				{t(
					"After signing in, copy your userToken from DeepSeek browser storage into this local form. Never send it in chat. Passwords are not stored.",
				)}
			</p>
			<label className="text-sm">
				{t("Personal DeepSeek session token")}
				<input
					className="mt-1 w-full rounded border bg-background p-2"
					type="password"
					autoComplete="off"
					value={token}
					onChange={(event) => setToken(event.target.value)}
				/>
			</label>
			<label className="text-sm">
				{t("Cookies (optional)")}
				<input
					className="mt-1 w-full rounded border bg-background p-2"
					type="password"
					autoComplete="off"
					value={cookies}
					onChange={(event) => setCookies(event.target.value)}
				/>
			</label>
			<p className="text-xs text-muted-foreground">
				{t(
					"The session is verified before replacing saved credentials and encrypted locally. Reasoning supports Off / On; these are not separate web model budgets.",
				)}
			</p>
			<div className="flex flex-wrap gap-2">
				<Button disabled={busy || !token.trim()} onClick={() => void connect()}>
					{t(busy ? "Connecting..." : "Verify and connect")}
				</Button>
				<Button
					variant="outline"
					disabled={busy}
					onClick={() => void connect(true)}
				>
					{t("Use saved session")}
				</Button>
			</div>
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{t(
						"Could not connect. Check your session, network and bundled runtime. Existing credentials were preserved.",
					)}
				</p>
			)}
			{connected && (
				<p role="status" className="text-sm">
					{t("DeepSeek session connected.")}
				</p>
			)}
		</section>
	);
}
