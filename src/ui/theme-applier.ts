/**
 * Atlas Theme Applier — applies dynamic CSS variables based on settings.profile.
 *
 * v0.9.3: refactored to comply with Obsidian guideline ("Creating and attaching
 * style elements is not allowed. Use a styles.css file"). Static class rules
 * moved to styles.css; this module now only sets CSS custom properties on
 * document.body via setProperty(), which is the recommended pattern.
 */

import type AtlasPlugin from "../../main";

const DYNAMIC_VARS_KEY_LIST = [
	"--atlas-accent",
	"--atlas-accent-glow",
	"--atlas-accent-soft",
	"--atlas-accent-strong",
	"--atlas-radius-sm",
	"--atlas-radius-md",
	"--atlas-radius-lg",
	"--atlas-shadow-sm",
	"--atlas-shadow-md",
	"--atlas-shadow-lg",
	"--atlas-transition-fast",
	"--atlas-transition-normal",
	"--atlas-transition-slow",
] as const;

export function applyAtlasTheme(plugin: AtlasPlugin): void {
	const accent = plugin.settings.profile?.colorAccent ?? "#6366f1";
	const accentGlow = hexToRgba(accent, 0.4);
	const accentSoft = hexToRgba(accent, 0.12);
	const accentStrong = darken(accent, 0.15);

	const root = document.body;
	const set = (key: string, val: string): void => root.style.setProperty(key, val);

	set("--atlas-accent", accent);
	set("--atlas-accent-glow", accentGlow);
	set("--atlas-accent-soft", accentSoft);
	set("--atlas-accent-strong", accentStrong);
	set("--atlas-radius-sm", "4px");
	set("--atlas-radius-md", "8px");
	set("--atlas-radius-lg", "12px");
	set("--atlas-shadow-sm", "0 1px 2px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.10)");
	set("--atlas-shadow-md", "0 4px 6px -1px rgba(0, 0, 0, 0.10), 0 2px 4px -1px rgba(0, 0, 0, 0.06)");
	set("--atlas-shadow-lg", "0 10px 15px -3px rgba(0, 0, 0, 0.10), 0 4px 6px -2px rgba(0, 0, 0, 0.05)");
	set("--atlas-transition-fast", "120ms cubic-bezier(0.4, 0, 0.2, 1)");
	set("--atlas-transition-normal", "220ms cubic-bezier(0.4, 0, 0.2, 1)");
	set("--atlas-transition-slow", "400ms cubic-bezier(0.4, 0, 0.2, 1)");
}

export function removeAtlasTheme(): void {
	const root = document.body;
	for (const key of DYNAMIC_VARS_KEY_LIST) {
		root.style.removeProperty(key);
	}
}

function hexToRgba(hex: string, alpha: number): string {
	const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!m) return `rgba(99, 102, 241, ${alpha})`;
	const r = Number.parseInt(m[1], 16);
	const g = Number.parseInt(m[2], 16);
	const b = Number.parseInt(m[3], 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function darken(hex: string, amount: number): string {
	const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!m) return hex;
	const r = Math.max(0, Math.round(Number.parseInt(m[1], 16) * (1 - amount)));
	const g = Math.max(0, Math.round(Number.parseInt(m[2], 16) * (1 - amount)));
	const b = Math.max(0, Math.round(Number.parseInt(m[3], 16) * (1 - amount)));
	const toHex = (n: number) => n.toString(16).padStart(2, "0");
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
