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
		// Full-screen sizing handled by .atlas-jarvis-modal in styles.css
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
