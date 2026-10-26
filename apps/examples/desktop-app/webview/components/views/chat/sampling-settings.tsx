"use client";

import { SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { desktopClient } from "@/lib/desktop-client";
import { useTranslation } from "@/lib/i18n";
import {
	fetchProviderCatalog,
	invalidateProviderCatalogCache,
} from "@/lib/provider-model-catalog";

export const SAMPLING_FIELDS = [
	{ key: "temperature", label: "Temperature", min: 0, max: 2, step: 0.05 },
	{ key: "top_p", label: "Top-p", min: 0, max: 1, step: 0.01 },
	{ key: "top_k", label: "Top-k", min: 1, max: 64, step: 1 },
	{ key: "min_p", label: "Min-p", min: 0, max: 1, step: 0.01 },
	{ key: "max_tokens", label: "Max tokens", min: 1, max: 2147483647, step: 1 },
	{
		key: "presence_penalty",
		label: "Presence penalty",
		min: 0,
		max: 2,
		step: 0.1,
	},
	{
		key: "repetition_penalty",
		label: "Repetition penalty",
		min: 0.1,
		max: 2,
		step: 0.1,
	},
	{ key: "seed", label: "Seed", min: 0, max: 2147483647, step: 1 },
	{
		key: "reasoning_budget_tokens",
		label: "Thinking token limit",
		min: 0,
		max: 2147483647,
		step: 1,
	},
] as const;

export function samplingPatch(
	draft: Record<string, string>,
	initial: Record<string, string>,
) {
	const patch: Record<string, number | null> = {};
	for (const field of SAMPLING_FIELDS) {
		const raw = (draft[field.key] ?? "").trim();
		if (raw === (initial[field.key] ?? "").trim()) continue;
		if (!raw) {
			patch[field.key] = null;
			continue;
		}
		const value = Number(raw);
		if (
			!Number.isFinite(value) ||
			value < field.min ||
			value > field.max ||
			(field.step === 1 && !Number.isInteger(value))
		)
			throw new Error(`Invalid value: ${field.label}`);
		patch[field.key] = value;
	}
	return patch;
}

/** Provider-local defaults. No global server updates and no generation requests. */
export function SamplingSettings({
	provider,
	disabled,
}: {
	provider: string;
	disabled?: boolean;
}) {
	const t = useTranslation();
	const [open, setOpen] = useState(false);
	const [initial, setInitial] = useState<Record<string, string>>({});
	const [draft, setDraft] = useState<Record<string, string>>({});
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [supported, setSupported] = useState(false);
	useEffect(() => {
		setOpen(false);
	}, [provider]);
	useEffect(() => {
		if (!open) return;
		let active = true;
		setLoading(true);
		setError("");
		setSupported(false);
		void fetchProviderCatalog({ fresh: true })
			.then((catalog) => {
				if (!active) return;
				const entry = catalog.providers.find((p) => p.id === provider);
				const available =
					entry?.configFields?.some(
						(f) => f.path === "sampling.temperature",
					) === true;
				setSupported(available);
				const values = Object.fromEntries(
					SAMPLING_FIELDS.map((f) => [
						f.key,
						String(entry?.configValues?.[`sampling.${f.key}`] ?? ""),
					]),
				);
				setInitial(values);
				setDraft(values);
			})
			.catch(() => {
				if (active) setError(t("Failed to load sampling settings"));
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [open, provider, t]);
	async function save() {
		setError("");
		setSaving(true);
		try {
			const sampling = samplingPatch(draft, initial);
			if (Object.keys(sampling).length) {
				await desktopClient.invoke("save_provider_settings", {
					provider,
					settings: { sampling },
				});
				invalidateProviderCatalogCache();
			}
			setOpen(false);
		} catch (e) {
			setError(
				e instanceof Error ? e.message : t("Failed to save sampling settings"),
			);
		} finally {
			setSaving(false);
		}
	}
	return (
		<Popover
			open={open}
			onOpenChange={(value) => {
				if (!saving) setOpen(value);
			}}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					disabled={disabled}
					aria-label={t("Sampling settings")}
					className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-hover disabled:opacity-40"
				>
					<SlidersHorizontal className="size-3.5" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80 max-h-[80vh] overflow-y-auto">
				<h3 className="font-semibold">{t("Sampling settings")}</h3>
				<p className="my-2 text-xs text-muted-foreground">
					{t(
						"Empty: inherit server settings. Applies to the next request; explicit session parameters take precedence.",
					)}
				</p>
				{loading ? (
					<p>{t("Loading...")}</p>
				) : !supported ? (
					<p>{t("Sampling requires an OpenAI-compatible Chat provider")}</p>
				) : (
					<>
						{SAMPLING_FIELDS.map((f) => (
							<label
								key={f.key}
								className="my-2 flex items-center justify-between gap-3 text-sm"
							>
								<span>{t(f.label)}</span>
								<input
									aria-label={t(f.label)}
									type="number"
									min={f.min}
									max={f.max}
									step={f.step}
									className="w-32 rounded border bg-background px-2 py-1"
									placeholder={t("Server default")}
									value={draft[f.key] ?? ""}
									disabled={saving}
									onChange={(e) =>
										setDraft((v) => ({ ...v, [f.key]: e.target.value }))
									}
								/>
							</label>
						))}
						<p className="my-2 text-xs text-muted-foreground">
							{t(
								"Thinking token limit: 0 means no cap. High and XHigh may be equivalent on the server.",
							)}
						</p>
						<button
							type="button"
							className="rounded border px-3 py-1"
							disabled={saving}
							onClick={() => void save()}
						>
							{t("Save")}
						</button>
					</>
				)}
				{error ? (
					<p role="alert" className="mt-2 text-sm text-destructive">
						{error}
					</p>
				) : null}
			</PopoverContent>
		</Popover>
	);
}
