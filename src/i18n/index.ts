/**
 * Atlas v0.55.0 — i18n bilíngue (PT-BR + EN).
 *
 * User escolhe idioma no onboarding. Default "pt" (audiência principal BR).
 *
 * Uso:
 *   import { t, setLanguage } from "../i18n";
 *   t("sidebar.today")  // → "Hoje" (pt) | "Today" (en)
 *   t("greeting.hello", { name: "Miguel" })  // → "Olá, Miguel" | "Hello, Miguel"
 *
 * Sem deps. Lookup é Map em-memória, fast.
 */

import { dict as ptDict } from "./pt";
import { dict as enDict } from "./en";

export type Locale = "pt" | "en";

let currentLocale: Locale = "pt";
const dicts: Record<Locale, Record<string, string>> = {
	pt: ptDict,
	en: enDict,
};

export function setLanguage(locale: Locale): void {
	currentLocale = locale;
}

export function getLanguage(): Locale {
	return currentLocale;
}

/**
 * Translate key with optional variables. Vars use {name} placeholders.
 * Falls back to key if missing.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
	const dict = dicts[currentLocale] ?? dicts.pt;
	let str = dict[key] ?? dicts.pt[key] ?? key;
	if (vars) {
		for (const [k, v] of Object.entries(vars)) {
			str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
		}
	}
	return str;
}

/** Init i18n from settings on plugin onload. */
export function initI18n(uiLanguage?: string): void {
	const lang = uiLanguage === "en" ? "en" : "pt";
	setLanguage(lang);
}
