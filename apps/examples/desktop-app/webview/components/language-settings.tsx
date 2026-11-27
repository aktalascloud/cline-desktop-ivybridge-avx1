"use client";

import { useEffect } from "react";
import {
	readLanguage,
	setLanguage,
	useLanguage,
	useTranslation,
} from "@/lib/i18n";

export function NativeLanguageSync() {
	const language = useLanguage();
	useEffect(() => {
		document.documentElement.lang = readLanguage();
		if (!("__TAURI_INTERNALS__" in window)) return;
		void import("@tauri-apps/api/core")
			.then(({ invoke }) =>
				invoke("set_interface_language", { language: readLanguage() }),
			)
			.catch(() => {});
	}, [language]);
	return null;
}

export function LanguageSettings() {
	const language = useLanguage();
	const t = useTranslation();
	return (
		<div className="flex items-center justify-between gap-5 border-b py-4 max-[720px]:flex-col max-[720px]:items-stretch">
			<div className="flex flex-col gap-1">
				<p className="text-base font-semibold text-foreground">
					{t("Interface language")}
				</p>
				<p className="text-sm text-muted-foreground">
					{t(
						"Choose the interface language. Your messages, code and commands are unchanged.",
					)}
				</p>
			</div>
			<select
				aria-label={t("Interface language")}
				className="h-9 rounded-md border bg-background px-3 text-sm"
				value={language}
				onChange={(event) =>
					setLanguage(event.target.value === "en" ? "en" : "ru")
				}
			>
				<option lang="ru" value="ru">
					Русский
				</option>
				<option lang="en" value="en">
					English
				</option>
			</select>
		</div>
	);
}
