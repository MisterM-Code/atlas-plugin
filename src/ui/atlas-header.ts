/**
 * Atlas Header — branding component da Master Sidebar.
 *
 * Contém:
 *  - Logo Atlas SVG (32px, breathing animation contínua)
 *  - Nome "Atlas" + nome do(s) perfil(is) ativo(s)
 *  - Click → abre Settings tab Atlas
 *
 * Logo recebe class `.atlas-thinking` durante streaming chat → glow pulse.
 */

import { setIcon } from "obsidian";
import type AtlasPlugin from "../../main";
import { findProfile } from "../profiles/registry";

// v0.16: SVG logo Atlas — explicit width/height + clear stroke for guaranteed render
// Uses a more polished glyph: outer ring + inner brain-like neural network
const ATLAS_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" aria-label="Atlas"><circle cx="50" cy="50" r="40" stroke-opacity="0.95"/><circle cx="50" cy="50" r="22" stroke-opacity="0.55"/><path d="M50 12 L50 30 M50 70 L50 88 M12 50 L30 50 M70 50 L88 50" stroke-opacity="0.85"/><path d="M28 28 L40 40 M60 60 L72 72 M72 28 L60 40 M40 60 L28 72" stroke-opacity="0.75"/><circle cx="50" cy="50" r="4" fill="currentColor" stroke-opacity="0"/></svg>`;

export interface AtlasHeaderHandle {
	el: HTMLDivElement;
	updateProfileName: () => void;
	setThinking: (thinking: boolean) => void;
}

export function renderAtlasHeader(parent: HTMLElement, plugin: AtlasPlugin): AtlasHeaderHandle {
	const el = parent.createDiv({ cls: "atlas-master-header" }) as HTMLDivElement;
	el.title = "Click para abrir Atlas Settings";

	// Logo container — try SVG, fallback to emoji if DOMParser fails for any reason
	const logoWrap = el.createDiv({ cls: "atlas-header-logo atlas-master-header-logo" });
	let svgRendered = false;
	try {
		const parser = new DOMParser();
		const svgDoc = parser.parseFromString(ATLAS_LOGO_SVG, "image/svg+xml");
		const docEl = svgDoc.documentElement;
		const isSvg = docEl?.nodeName.toLowerCase() === "svg";
		const hasParserError = svgDoc.querySelector("parsererror") !== null;
		if (isSvg && !hasParserError && docEl) {
			logoWrap.appendChild(document.importNode(docEl, true));
			svgRendered = true;
		}
	} catch {
		// fallthrough to emoji
	}
	if (!svgRendered) {
		const fallback = logoWrap.createSpan({ text: "🧠" });
		fallback.addClass("atlas-master-header-logo-fallback");
	}

	const textWrap = el.createDiv({ cls: "atlas-master-header-text" });
	textWrap.createDiv({ cls: "atlas-master-header-name", text: "Atlas" });
	const profileEl = textWrap.createDiv({ cls: "atlas-master-header-profile" });

	const settingsIcon = el.createDiv({ cls: "atlas-master-header-settings-icon" });
	setIcon(settingsIcon, "settings");

	const updateProfileName = (): void => {
		const profileIds = plugin.settings.profile?.ids ?? [];
		if (profileIds.length === 0) {
			profileEl.setText("Sem perfil configurado");
			return;
		}
		if (profileIds.length === 1) {
			const p = findProfile(profileIds[0]);
			profileEl.setText(p ? `${p.emoji} ${p.name}` : profileIds[0]);
			return;
		}
		const names = profileIds
			.map((id) => findProfile(id)?.emoji ?? "•")
			.join(" ");
		profileEl.setText(`${names} (${profileIds.length} perfis)`);
	};

	updateProfileName();
	// Hover state handled by .atlas-master-header:hover in styles.css

	// Click → open Atlas settings
	el.addEventListener("click", () => {
		const apiAny = plugin.app as unknown as {
			setting?: { open: () => void; openTabById: (id: string) => void };
		};
		apiAny.setting?.open();
		apiAny.setting?.openTabById("atlas");
	});

	return {
		el,
		updateProfileName,
		setThinking: (thinking: boolean) => {
			if (thinking) logoWrap.addClass("atlas-thinking");
			else logoWrap.removeClass("atlas-thinking");
		},
	};
}
