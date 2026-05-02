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
	const el = parent.createDiv({ cls: "atlas-master-header" }) as HTMLDivElement;
	el.title = "Click para abrir Atlas Settings";

	// Logo container
	const logoWrap = el.createDiv({ cls: "atlas-header-logo atlas-master-header-logo" });
	const parser = new DOMParser();
	const svgDoc = parser.parseFromString(ATLAS_LOGO_SVG, "image/svg+xml");
	if (svgDoc.documentElement && svgDoc.documentElement.nodeName.toLowerCase() === "svg") {
		logoWrap.appendChild(document.importNode(svgDoc.documentElement, true));
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
