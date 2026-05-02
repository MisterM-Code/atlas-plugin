/**
 * Atlas v0.9.2 Sprint 32 — JarvisOverlay (full-screen)
 *
 * Modal full-screen wrapping JarvisCore. User invokes via Cmd+Shift+J or
 * "Expand" button from the sidebar Jarvis tab.
 */

import { App, Modal } from "obsidian";
import type AtlasPlugin from "../../main";
import { JarvisCore } from "./jarvis-core";

export class JarvisOverlay extends Modal {
	private core: JarvisCore | null = null;

	constructor(app: App, private readonly plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		modalEl.addClass("atlas-jarvis-modal");
		contentEl.empty();

		// Full-screen modal sizing
		modalEl.style.width = "100vw";
		modalEl.style.height = "100vh";
		modalEl.style.maxWidth = "100vw";
		modalEl.style.maxHeight = "100vh";
		modalEl.style.padding = "0";
		modalEl.style.background = "transparent";
		modalEl.style.border = "none";
		modalEl.style.boxShadow = "none";
		contentEl.style.padding = "0";
		contentEl.style.height = "100vh";
		contentEl.style.width = "100vw";

		this.core = new JarvisCore(this.app, this.plugin, {
			mode: "fullscreen",
			orbSize: 200,
			showHistory: true,
			showHexGrid: true,
			onClose: () => this.close(),
		});
		this.core.mount(contentEl);
	}

	onClose(): void {
		this.core?.destroy();
		this.contentEl.empty();
	}
}
