"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { desktopClient } from "@/lib/desktop-client";
import { useTranslation } from "@/lib/i18n";
type Status = { configured: boolean; available: boolean };
type Setup = {
	extensionId: string;
	extensionFolder: string;
	connectUrl: string;
};
export function Dsw2ApiSetup({
	onConnected,
}: {
	onConnected: () => Promise<void>;
}) {
	const t = useTranslation(),
		previous = useRef<boolean | undefined>(undefined);
	const [status, setStatus] = useState<Status | null>(null),
		[setup, setSetup] = useState<Setup | null>(null),
		[error, setError] = useState(false),
		[busy, setBusy] = useState(false);
	useEffect(() => {
		let live = true;
		const refresh = async () => {
			try {
				const next = await desktopClient.invoke<Status>("dsw2api_status");
				if (!live) return;
				setStatus(next);
				if (previous.current === false && next.configured) await onConnected();
				previous.current = next.configured;
			} catch {}
		};
		void refresh();
		const timer = setInterval(() => void refresh(), 3000);
		return () => {
			live = false;
			clearInterval(timer);
		};
	}, [onConnected]);
	const connect = async () => {
		if (busy) return;
		setBusy(true);
		setError(false);
		try {
			setSetup(await desktopClient.invoke<Setup>("dsw2api_open_extension"));
		} catch {
			setError(true);
		} finally {
			setBusy(false);
		}
	};
	const prepare = async () => {
		setError(false);
		try {
			setSetup(await desktopClient.invoke<Setup>("dsw2api_prepare_extension"));
		} catch {
			setError(true);
		}
	};
	return (
		<section className="flex flex-col gap-4 rounded-lg border p-5">
			<h3 className="font-semibold">DSW2API · DeepSeek</h3>
			<p className="text-sm text-muted-foreground">
				{t(
					"Connect the DeepSeek session already open in your regular browser. No separate browser profile or repeated sign-in.",
				)}
			</p>
			<p className="text-xs text-muted-foreground">
				{t(
					"A one-time browser bridge permission is required. It can access DeepSeek only; passwords and other websites are not read.",
				)}
			</p>
			<div className="flex flex-wrap gap-2">
				<Button disabled={busy} onClick={() => void connect()}>
					{t("Connect current browser session")}
				</Button>
				<Button variant="outline" onClick={() => void prepare()}>
					{t("Set up browser bridge")}
				</Button>
			</div>
			{setup && (
				<div className="rounded border p-3 text-sm">
					<p>
						{t(
							"One-time Brave setup: open brave://extensions, enable developer mode, choose Load unpacked and select this folder:",
						)}
					</p>
					<p className="mt-2 break-all select-all font-mono text-xs">
						{setup.extensionFolder}
					</p>
					<p className="mt-2">
						{t(
							"Then open DeepSeek in your regular browser and click the Cline DeepSeek Session Bridge icon to connect.",
						)}
					</p>
				</div>
			)}
			{status?.configured && (
				<p role="status">{t("DeepSeek session connected.")}</p>
			)}
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{t(
						"The browser bridge is not ready. Set it up once, then connect from your normal DeepSeek tab. Saved credentials were preserved.",
					)}
				</p>
			)}
		</section>
	);
}
