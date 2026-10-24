"use client";
import { UiLocaleProvider } from "@cline/ui";
import { useMemo, type ReactNode } from "react";
import { useLanguage, useTranslation } from "@/lib/i18n";
export function UiLanguageProvider({ children }: { children: ReactNode }) {
	const locale = useLanguage();
	const t = useTranslation();
	const value = useMemo(() => ({ t, locale }), [t, locale]);
	return <UiLocaleProvider value={value}>{children}</UiLocaleProvider>;
}
