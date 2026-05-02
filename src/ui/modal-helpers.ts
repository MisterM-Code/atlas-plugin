/**
 * Atlas Modal Helpers — utilities para garantir UX consistente em todos os modals.
 *
 * Bug histórico: 17 modals usavam `minWidth: NNNpx` hardcodado, causando overflow
 * horizontal em viewports menores (laptop 13", janelas pequenas). Modal ficava
 * cortado e user precisava arrastar para o lado.
 *
 * Fix: usar `applyResponsiveModal` em vez de `style.minWidth`. Ele:
 *  - usa `min(NNNpx, 95vw)` — nunca extrapola viewport
 *  - aplica `maxHeight: 85vh` + `overflowY: auto` — scroll interno se conteúdo grande
 *  - box-sizing border-box + padding consistente
 */

export interface ResponsiveModalOptions {
	/** Largura preferida em px. Modal usa `min(preferredWidth, 95vw)`. Default: 720px. */
	preferredWidth?: number;
	/** Altura máxima em px. Modal usa `min(preferredHeight, 90vh)`. Default: undefined (= 85vh). */
	preferredHeight?: number;
	/** Adiciona padding horizontal no container? Default: true. */
	withPadding?: boolean;
	/** Se true, usa scroll interno; se false, conteúdo vaza (ex: Cytoscape canvas). Default: true. */
	scroll?: boolean;
}

/**
 * Aplica estilo responsivo no contentEl de um Modal Obsidian.
 * Uso:
 *   onOpen() {
 *     applyResponsiveModal(this.contentEl, { preferredWidth: 720 });
 *     // ...resto do render
 *   }
 */
export function applyResponsiveModal(
	contentEl: HTMLElement,
	opts: ResponsiveModalOptions = {}
): void {
	const w = opts.preferredWidth ?? 720;
	const withPadding = opts.withPadding ?? true;
	const scroll = opts.scroll ?? true;

	contentEl.style.width = `min(${w}px, 95vw)`;
	contentEl.style.maxWidth = "95vw";
	contentEl.style.boxSizing = "border-box";

	if (opts.preferredHeight !== undefined) {
		contentEl.style.maxHeight = `min(${opts.preferredHeight}px, 90vh)`;
	} else {
		contentEl.style.maxHeight = "85vh";
	}

	if (scroll) {
		contentEl.style.overflowY = "auto";
		contentEl.style.overflowX = "hidden";
	}

	if (withPadding) {
		// Apenas se ainda não tem padding inline definido
		if (!contentEl.style.padding) {
			contentEl.style.padding = "16px";
		}
	}
}
