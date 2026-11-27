"use client";
import { createContext, useContext, type ReactNode } from "react";
export type UiTranslator = (
	text: string,
	parameters?: Readonly<Record<string, string | number>>,
) => string;
export const t: UiTranslator = (text, parameters) =>
	parameters
		? text.replace(/\{(\w+)\}/g, (token, name: string) =>
				Object.hasOwn(parameters, name) ? String(parameters[name]) : token,
			)
		: text;
const Context = createContext<{ t: UiTranslator; locale: string }>({
	t,
	locale: "en",
});
export function UiLocaleProvider({
	value,
	children,
}: {
	value: { t: UiTranslator; locale: string };
	children: ReactNode;
}) {
	return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useUiLocale() {
	return useContext(Context);
}
export function useTranslation() {
	return useUiLocale().t;
}
