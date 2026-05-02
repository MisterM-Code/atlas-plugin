/**
 * Atlas v0.9.2 Sprint 32.1 — Jarvis sidebar tab (default mode)
 *
 * Renders compact JarvisCore (orb 120px) inside the Master Sidebar.
 * Top-right "Expand" button opens fullscreen overlay (Cmd+Shift+J).
 */

import type AtlasPlugin from "../../../main";
import { JarvisCore } from "../../ui/jarvis-core";
import { maybeShowJarvisTutorial } from "../../ui/jarvis-tutorial";

let activeCore: JarvisCore | null = null;

export function renderJarvisTab(container: HTMLElement, plugin: AtlasPlugin): void {
	if (activeCore) {
		try {
			activeCore.destroy();
		} catch {
			// ignore
		}
		activeCore = null;
	}
	container.empty();
	container.style.padding = "0";
	container.style.height = "100%";

	const core = new JarvisCore(plugin.app, plugin, {
		mode: "sidebar",
		orbSize: 120,
		showHistory: true,
		showHexGrid: true,
		onExpand: async () => {
			const m = await import("../../ui/jarvis-overlay");
			new m.JarvisOverlay(plugin.app, plugin).open();
		},
	});
	core.mount(container);
	activeCore = core;

	// Sprint 32.5: First-time tutorial (auto-shown only once)
	maybeShowJarvisTutorial(plugin.app, plugin);
}
