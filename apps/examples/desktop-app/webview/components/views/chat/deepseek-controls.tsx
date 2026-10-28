"use client";
import { Brain, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { desktopClient } from "@/lib/desktop-client";
import { useTranslation } from "@/lib/i18n";
import {
	fetchProviderCatalog,
	invalidateProviderCatalogCache,
} from "@/lib/provider-model-catalog";

/** DeepSeek Web has two independent capabilities, not reasoning budgets. */
export function DeepSeekControls({
	thinking,
	disabled,
	onThinkingChange,
}: {
	thinking: boolean;
	disabled: boolean;
	onThinkingChange: (enabled: boolean) => void;
}) {
	const t = useTranslation();
	const [search, setSearch] = useState(false);
	const [saving, setSaving] = useState(false);
	const [ready, setReady] = useState(false);
	const [error, setError] = useState("");
	useEffect(() => {
		let active = true;
		void fetchProviderCatalog({ fresh: true })
			.then((catalog) => {
				if (active) {
					setSearch(
						catalog.providers.find((p) => p.id === "dsw2api")?.configValues?.[
							"sampling.search_enabled"
						] === true,
					);
					setReady(true);
				}
			})
			.catch(() => {
				if (active) setError(t("Failed to load sampling settings"));
			});
		return () => {
			active = false;
		};
	}, [t]);
	async function toggleSearch() {
		setSaving(true);
		setError("");
		try {
			const value = !search;
			await desktopClient.invoke("save_provider_settings", {
				provider: "dsw2api",
				settings: { sampling: { search_enabled: value } },
			});
			invalidateProviderCatalogCache();
			setSearch(value);
		} catch {
			setError(t("Failed to save sampling settings"));
		} finally {
			setSaving(false);
		}
	}
	const style = (active: boolean) =>
		"inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs disabled:opacity-40 " +
		(active
			? "border-primary bg-primary/10 text-primary"
			: "border-transparent text-muted-foreground hover:bg-surface-hover");
	return (
		<div className="flex flex-wrap items-center gap-1">
			<button
				type="button"
				aria-pressed={thinking}
				disabled={disabled}
				onClick={() => onThinkingChange(!thinking)}
				className={style(thinking)}
			>
				<Brain className="size-3" />
				{t("Deep thinking")}
			</button>
			<button
				type="button"
				aria-pressed={search}
				disabled={disabled || saving || !ready}
				onClick={() => void toggleSearch()}
				className={style(search)}
			>
				<Globe className="size-3" />
				{t("Smart search")}
			</button>
			{error ? (
				<span role="alert" className="text-xs text-destructive">
					{error}
				</span>
			) : null}
		</div>
	);
}
