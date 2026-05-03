/**
 * v0.60: Atlas Cockpit popout — janela Electron OS-level via app.workspace.openPopoutLeaf().
 *
 * Reusa JarvisCore (mode: fullscreen) + chat strip pattern de tab-today (chat-bridge).
 * Always-on-top toggle persiste em localStorage.
 */

import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type AtlasPlugin from "../../main";
import { JarvisCore } from "../ui/jarvis-core";
import { setAlwaysOnTop, isAlwaysOnTop } from "../ui/window-helper";
import { t } from "../i18n";

export const COCKPIT_VIEW_TYPE = "atlas-cockpit";

const PREFS_KEY = "atlas-cockpit-prefs";

interface CockpitPrefs {
	alwaysOnTop?: boolean;
}

function loadPrefs(): CockpitPrefs {
	try {
		const raw = localStorage.getItem(PREFS_KEY);
		return raw ? JSON.parse(raw) : {};
	} catch { return {}; }
}

function savePrefs(p: CockpitPrefs): void {
	try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch {/* ignore */}
}

export class AtlasCockpitView extends ItemView {
	private jarvis: JarvisCore | null = null;

	constructor(leaf: WorkspaceLeaf, private readonly plugin: AtlasPlugin) {
		super(leaf);
	}

	getViewType(): string { return COCKPIT_VIEW_TYPE; }
	getDisplayText(): string { return "Atlas Cockpit"; }
	getIcon(): string { return "sparkles"; }

	async onOpen(): Promise<void> {
		const c = this.containerEl.children[1] as HTMLElement;
		c.empty();
		c.addClass("atlas-cockpit");

		// Header bar
		const header = c.createDiv({ cls: "atlas-cockpit-header" });
		header.createSpan({ cls: "atlas-cockpit-title", text: "🌌 Atlas Cockpit" });
		const actions = header.createDiv({ cls: "atlas-cockpit-actions" });

		const prefs = loadPrefs();
		const pinBtn = actions.createEl("button", {
			cls: "atlas-cockpit-pin",
			text: prefs.alwaysOnTop ? "📌" : "📍",
		}) as HTMLButtonElement;
		pinBtn.title = prefs.alwaysOnTop ? "Always-on-top ON" : "Always-on-top OFF";
		// Apply persisted always-on-top
		if (prefs.alwaysOnTop) setAlwaysOnTop(true);
		pinBtn.addEventListener("click", () => {
			const next = !isAlwaysOnTop();
			const ok = setAlwaysOnTop(next);
			if (ok) {
				pinBtn.setText(next ? "📌" : "📍");
				pinBtn.title = next ? "Always-on-top ON" : "Always-on-top OFF";
				savePrefs({ ...prefs, alwaysOnTop: next });
			} else {
				new Notice("Atlas: Electron remote indisponível (sandbox).");
			}
		});

		// Body com Jarvis fullscreen
		const body = c.createDiv({ cls: "atlas-cockpit-body" });
		this.jarvis = new JarvisCore(this.app, this.plugin, {
			mode: "fullscreen",
			orbSize: 220,
			showHistory: true,
			showHexGrid: true,
		});
		this.jarvis.mount(body);

		// Chat strip sticky bottom — abre tab Chat no popout view-target
		const strip = c.createDiv({ cls: "atlas-cockpit-chat-strip" });
		const stripIcon = strip.createSpan({ cls: "atlas-cockpit-chat-icon", text: "💬" });
		stripIcon.style.fontSize = "14px";
		const input = strip.createEl("input", {
			cls: "atlas-cockpit-chat-input",
			type: "text",
			attr: { placeholder: t("chat.placeholder") },
		});
		const sendBtn = strip.createEl("button", {
			cls: "atlas-cockpit-chat-send mod-cta",
			text: "→",
		});

		const submit = async (): Promise<void> => {
			const text = input.value.trim();
			if (!text) return;
			input.value = "";
			// Inject pra tab Chat no main window via custom event
			document.dispatchEvent(new CustomEvent("atlas:chat-send", { detail: { text } }));
			await this.plugin.activateMasterTab("chat");
			new Notice(`Atlas: enviado "${text.slice(0, 60)}..."`);
		};
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") void submit();
		});
		sendBtn.addEventListener("click", () => void submit());
	}

	async onClose(): Promise<void> {
		this.jarvis?.destroy();
		this.jarvis = null;
	}
}
