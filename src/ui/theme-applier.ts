/**
 * Atlas Theme Applier — injeta CSS variables dinamicamente baseadas em settings.profile.
 *
 * Bug histórico v0.7.0: settings.profile.colorAccent era SALVO mas nunca aplicado.
 * Fix v0.7.1: hook em onload + saveSettings + onboarding complete chama applyAtlasTheme().
 *
 * CSS vars expostas:
 *   --atlas-accent          (cor accent do perfil)
 *   --atlas-accent-glow     (accent com 25% alpha — pra glow effects)
 *   --atlas-accent-soft     (accent com 12% alpha — pra hover bg)
 *   --atlas-accent-strong   (accent escurecido 15% — pra active states)
 *   --atlas-radius-sm/md/lg (8/12/16 px)
 *   --atlas-shadow-sm/md/lg (sombras consistentes)
 */

import type AtlasPlugin from "../../main";

const STYLE_TAG_ID = "atlas-theme-vars";

export function applyAtlasTheme(plugin: AtlasPlugin): void {
	const accent = plugin.settings.profile?.colorAccent ?? "#6366f1";
	const accentGlow = hexToRgba(accent, 0.4);
	const accentSoft = hexToRgba(accent, 0.12);
	const accentStrong = darken(accent, 0.15);

	const css = `
:root {
	--atlas-accent: ${accent};
	--atlas-accent-glow: ${accentGlow};
	--atlas-accent-soft: ${accentSoft};
	--atlas-accent-strong: ${accentStrong};
	--atlas-radius-sm: 4px;
	--atlas-radius-md: 8px;
	--atlas-radius-lg: 12px;
	--atlas-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.10);
	--atlas-shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.10), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
	--atlas-shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.10), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
	--atlas-transition-fast: 120ms cubic-bezier(0.4, 0, 0.2, 1);
	--atlas-transition-normal: 220ms cubic-bezier(0.4, 0, 0.2, 1);
	--atlas-transition-slow: 400ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* Active tab no master sidebar usa Atlas accent (não --interactive-accent generic) */
.atlas-master-sidebar .atlas-activity-tab-active {
	background: var(--atlas-accent) !important;
	color: white !important;
	box-shadow: 0 0 12px var(--atlas-accent-glow);
}

/* FAB rotaciona quando popover aberto + glow */
.atlas-fab {
	background: var(--atlas-accent) !important;
	box-shadow: 0 4px 12px var(--atlas-accent-glow) !important;
	transition: transform var(--atlas-transition-fast), box-shadow var(--atlas-transition-fast);
}
.atlas-fab:hover {
	box-shadow: 0 6px 20px var(--atlas-accent-glow) !important;
}

/* Achievement progress bar usa accent */
.atlas-xp-progress-fill {
	background: linear-gradient(90deg, var(--atlas-accent), var(--atlas-accent-strong)) !important;
}

/* Card categories — border-left colorido por tipo */
.atlas-card-action-overdue { border-left: 3px solid var(--color-red); }
.atlas-card-action-today   { border-left: 3px solid var(--color-orange); }
.atlas-card-action-future  { border-left: 3px solid var(--color-green); }
.atlas-card-system-down    { border-left: 3px solid var(--color-red); animation: atlas-pulse-soft 2s infinite; }
.atlas-card-system-degraded{ border-left: 3px solid var(--color-orange); }
.atlas-card-knowledge      { border-left: 3px solid var(--atlas-accent); }
.atlas-card-report         { border-left: 3px solid var(--color-purple); }

/* Badge pulsa quando há novidade */
.atlas-badge-new {
	animation: atlas-pulse-soft 2s infinite;
}

/* Logo Atlas no header — breathing contínuo */
.atlas-header-logo {
	animation: atlas-breathing 4s ease-in-out infinite;
	transition: filter var(--atlas-transition-normal);
}

/* Logo glow quando LLM está pensando */
.atlas-header-logo.atlas-thinking {
	animation: atlas-glow-pulse 1.2s ease-in-out infinite;
}

@keyframes atlas-breathing {
	0%, 100% { transform: scale(1); }
	50% { transform: scale(1.04); }
}

@keyframes atlas-glow-pulse {
	0%, 100% {
		filter: drop-shadow(0 0 4px var(--atlas-accent));
		transform: scale(1);
	}
	50% {
		filter: drop-shadow(0 0 16px var(--atlas-accent-glow));
		transform: scale(1.06);
	}
}

/* HUD floating gradient + glow */
.atlas-hud {
	background: linear-gradient(135deg, var(--background-primary) 0%, var(--background-secondary-alt) 100%);
	border: 1px solid var(--atlas-accent-soft);
	box-shadow: 0 0 0 1px var(--atlas-accent-soft), var(--atlas-shadow-lg);
	border-radius: var(--atlas-radius-lg);
}

/* Status bar Atlas indicator — bolinha pulsante */
.atlas-statusbar-indicator {
	display: inline-block;
	width: 8px;
	height: 8px;
	border-radius: 50%;
	margin-right: 4px;
	background: var(--color-green);
}
.atlas-statusbar-indicator.atlas-status-down {
	background: var(--color-red);
	animation: atlas-pulse-soft 1s infinite;
}
.atlas-statusbar-indicator.atlas-status-thinking {
	background: var(--color-orange);
	animation: atlas-pulse-soft 0.6s infinite;
}
`;

	let styleEl = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
	if (!styleEl) {
		styleEl = document.createElement("style");
		styleEl.id = STYLE_TAG_ID;
		document.head.appendChild(styleEl);
	}
	styleEl.textContent = css;
}

export function removeAtlasTheme(): void {
	document.getElementById(STYLE_TAG_ID)?.remove();
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
	return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
