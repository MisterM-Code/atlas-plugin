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

const ATLAS_LOGO_SVG = `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" style="width:100%;height:100%;color:var(--atlas-accent)"><circle cx="50" cy="50" r="38"/><path d="M50 12 L50 88 M12 50 L88 50 M22 22 L78 78 M78 22 L22 78"/></svg>`;

export interface AtlasHeaderHandle {
	el: HTMLDivElement;
	updateProfileName: () => void;
	setThinking: (thinking: boolean) => void;
}

export function renderAtlasHeader(parent: HTMLElement, plugin: AtlasPlugin): AtlasHeaderHandle {
	const el = parent.createDiv() as HTMLDivElement;
	el.addClass("atlas-master-header");
	el.style.display = "flex";
	el.style.alignItems = "center";
	el.style.gap = "10px";
	el.style.padding = "10px 12px";
	el.style.marginBottom = "12px";
	el.style.background =
		"linear-gradient(135deg, var(--background-secondary) 0%, var(--background-secondary-alt) 100%)";
	el.style.borderRadius = "var(--atlas-radius-md, 8px)";
	el.style.border = "1px solid var(--atlas-accent-soft, rgba(99, 102, 241, 0.12))";
	el.style.cursor = "pointer";
	el.style.transition = "border-color var(--atlas-transition-fast, 120ms)";
	el.title = "Click para abrir Atlas Settings";

	// Logo container
	const logoWrap = el.createDiv();
	logoWrap.style.width = "32px";
	logoWrap.style.height = "32px";
	logoWrap.style.flexShrink = "0";
	logoWrap.addClass("atlas-header-logo");
	logoWrap.innerHTML = ATLAS_LOGO_SVG;

	// Text content
	const textWrap = el.createDiv();
	textWrap.style.flexGrow = "1";
	textWrap.style.minWidth = "0";

	const nameEl = textWrap.createDiv();
	nameEl.setText("Atlas");
	nameEl.style.fontSize = "13px";
	nameEl.style.fontWeight = "bold";
	nameEl.style.letterSpacing = "0.5px";
	nameEl.style.color = "var(--text-normal)";

	const profileEl = textWrap.createDiv();
	profileEl.style.fontSize = "10px";
	profileEl.style.opacity = "0.7";
	profileEl.style.whiteSpace = "nowrap";
	profileEl.style.overflow = "hidden";
	profileEl.style.textOverflow = "ellipsis";

	const settingsIcon = el.createDiv();
	settingsIcon.style.opacity = "0.5";
	settingsIcon.style.flexShrink = "0";
	settingsIcon.style.transition = "opacity var(--atlas-transition-fast, 120ms)";
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

	// Hover state
	el.addEventListener("mouseenter", () => {
		el.style.borderColor = "var(--atlas-accent, var(--interactive-accent))";
		settingsIcon.style.opacity = "1";
	});
	el.addEventListener("mouseleave", () => {
		el.style.borderColor = "var(--atlas-accent-soft, rgba(99, 102, 241, 0.12))";
		settingsIcon.style.opacity = "0.5";
	});

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
