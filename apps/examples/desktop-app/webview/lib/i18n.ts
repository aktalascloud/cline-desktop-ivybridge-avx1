"use client";

import { useCallback, useSyncExternalStore } from "react";
import ru from "./locales/ru.json";
import en from "./locales/en.json";

export type InterfaceLanguage = "en" | "ru";
const STORAGE_KEY = "cline-avx1-interface-language";
const EVENT = "cline-avx1-language-change";
let cachedLanguage: InterfaceLanguage | undefined;

export function readLanguage(): InterfaceLanguage {
	if (typeof window === "undefined") return "en";
	if (cachedLanguage) return cachedLanguage;
	try {
		cachedLanguage =
			window.localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "ru";
	} catch {
		cachedLanguage = "ru";
	}
	return cachedLanguage;
}

export function setLanguage(language: InterfaceLanguage): void {
	if (language !== "en" && language !== "ru") return;
	cachedLanguage = language;
	try {
		window.localStorage.setItem(STORAGE_KEY, language);
	} catch {
		/* In-memory fallback. */
	}
	document.documentElement.lang = language;
	window.dispatchEvent(new Event(EVENT));
}

function subscribe(listener: () => void): () => void {
	const onStorage = (event: StorageEvent) => {
		if (event.key === STORAGE_KEY || event.key === null) {
			cachedLanguage = undefined;
			listener();
		}
	};
	window.addEventListener(EVENT, listener);
	window.addEventListener("storage", onStorage);
	return () => {
		window.removeEventListener(EVENT, listener);
		window.removeEventListener("storage", onStorage);
	};
}

// Decode only JSX source entities; translations remain plain React text.
function sourceText(text: string): string {
	const entities: Record<string, string> = {
		"&apos;": "'",
		"&quot;": '"',
		"&amp;": "&",
		"&ldquo;": "“",
		"&rdquo;": "”",
		"&gt;": ">",
		"&lt;": "<",
		"&nbsp;": "\u00a0",
	};
	return text.replace(
		/&(?:apos|quot|amp|ldquo|rdquo|gt|lt|nbsp);/g,
		(entity) => entities[entity],
	);
}

export function translate(
	text: string,
	language: InterfaceLanguage,
	parameters?: Readonly<Record<string, string | number>>,
): string {
	const catalog: Readonly<Record<string, string>> = language === "ru" ? ru : en;
	const key = text.trim().replace(/\s+/g, " ");
	const pluralKey =
		typeof parameters?.count === "number"
			? `${key}__${new Intl.PluralRules(language).select(parameters.count)}`
			: key;
	const lookupKey = Object.hasOwn(catalog, pluralKey) ? pluralKey : key;
	const translated = Object.hasOwn(catalog, lookupKey)
		? catalog[lookupKey]
		: sourceText(key);
	const leading = text.match(/^\s*/)?.[0] ?? "";
	const trailing = text.match(/\s*$/)?.[0] ?? "";
	const result = leading + translated + trailing;
	return parameters
		? result.replace(/\{(\w+)\}/g, (token, name: string) =>
				Object.hasOwn(parameters, name) ? String(parameters[name]) : token,
			)
		: result;
}

// For non-component presentation helpers. Never pass user/model text to this.
export const t = (
	text: string,
	parameters?: Readonly<Record<string, string | number>>,
) => translate(text, readLanguage(), parameters);

export function useLanguage(): InterfaceLanguage {
	return useSyncExternalStore(subscribe, readLanguage, () => "en");
}

export function useTranslation() {
	const language = useLanguage();
	return useCallback(
		(text: string, parameters?: Readonly<Record<string, string | number>>) =>
			translate(text, language, parameters),
		[language],
	);
}

export function plural(
	count: number,
	forms: { one: string; few: string; many: string; other: string },
	language: InterfaceLanguage,
): string {
	const category = new Intl.PluralRules(language).select(
		count,
	) as keyof typeof forms;
	return forms[category] ?? forms.other;
}
