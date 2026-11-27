"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@cline/ui";
import { desktopClient } from "@/lib/desktop-client";
import { useTranslation } from "@/lib/i18n";

type Preferences = {
	enabled: boolean;
	triggerTokens: number;
	maxInputTokens: number;
	preserveRecentMessages: number;
};
export function CompactionSettings() {
	const t = useTranslation();
	const [value, setValue] = useState<Preferences>({
		enabled: true,
		triggerTokens: 90000,
		maxInputTokens: 120000,
		preserveRecentMessages: 40,
	});
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState("");
	useEffect(() => {
		let active = true;
		void desktopClient
			.invoke<Preferences>("get_compaction_settings")
			.then((v) => {
				if (active && v) setValue(v);
			})
			.catch(() => {
				if (active) setMessage("Could not load compaction settings");
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, []);
	const save = async () => {
		setSaving(true);
		setMessage("");
		try {
			const saved = await desktopClient.invoke<Preferences>(
				"set_compaction_settings",
				{ settings: value },
			);
			if (saved) setValue(saved);
			setMessage("Compaction settings saved");
		} catch (e) {
			setMessage(e instanceof Error ? e.message : String(e));
		} finally {
			setSaving(false);
		}
	};
	const fields = [
		{
			key: "triggerTokens" as const,
			label: "Token threshold",
			min: 1024,
			max: 10000000,
			help: "Older context is summarized when the request reaches this threshold.",
		},
		{
			key: "maxInputTokens" as const,
			label: "Token limit",
			min: 2048,
			max: 10000000,
			help: "The model window and answer reserve can lower the effective limit.",
		},
		{
			key: "preserveRecentMessages" as const,
			label: "Recent messages to preserve",
			min: 0,
			max: 1000,
			help: "Keep recent messages and whole tool chains when they fit the budget. Full history stays saved.",
		},
	];
	return (
		<section
			className="border-b py-4 space-y-4"
			aria-label={t("Context compaction")}
		>
			<div className="flex items-center justify-between gap-4">
				<h2 className="text-base font-semibold">
					{t("Automatic context compaction")}
				</h2>
				<Switch
					aria-label={t("Automatic context compaction")}
					disabled={loading}
					checked={value.enabled}
					onCheckedChange={(enabled) => setValue({ ...value, enabled })}
				/>
			</div>
			<form
				className="space-y-3"
				onSubmit={(e) => {
					e.preventDefault();
					void save();
				}}
			>
				{fields.map((field) => (
					<div key={field.key} className="max-w-xl space-y-1">
						<label
							htmlFor={`compaction-${field.key}`}
							className="text-sm font-medium"
						>
							{t(field.label)}
						</label>
						<Input
							id={`compaction-${field.key}`}
							type="number"
							min={field.min}
							max={field.max}
							step={1}
							disabled={loading}
							required
							value={Number.isFinite(value[field.key]) ? value[field.key] : ""}
							onChange={(e) =>
								setValue({ ...value, [field.key]: e.target.valueAsNumber })
							}
						/>
						<p className="text-xs text-muted-foreground">{t(field.help)}</p>
					</div>
				))}
				<Button type="submit" disabled={saving || loading}>
					{t(saving ? "Saving…" : "Save")}
				</Button>
				{message && (
					<p role="status" className="text-sm">
						{t(message)}
					</p>
				)}
			</form>
		</section>
	);
}
