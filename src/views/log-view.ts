/**
 * Atlas v0.52 Sprint C — Log View modal.
 *
 * Mostra logs do Atlas (ring buffer + arquivo persistente). User pode:
 * - Filtrar por level (debug/info/warn/error)
 * - Filtrar por busca de texto
 * - Copiar tudo pra clipboard
 * - Exportar como .log file
 * - Limpar
 *
 * Uso pra debugging: amigo fica com erro → roda comando → copia logs → manda no chat.
 */

import { App, Modal, Notice, normalizePath, TFile } from "obsidian";
import type AtlasPlugin from "../../main";
import { applyResponsiveModal } from "../ui/modal-helpers";
import {
	getLogEntries,
	clearLogEntries,
	formatLogEntry,
	type LogEntry,
} from "../utils/logger";

const ATLAS_LOG_FILE = ".atlas/atlas.log";

export class LogViewModal extends Modal {
	private filterLevel: "all" | "debug" | "info" | "warn" | "error" = "all";
	private searchQuery = "";

	constructor(app: App, private plugin: AtlasPlugin) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		applyResponsiveModal(contentEl, { preferredWidth: 900, preferredHeight: 700 });
		contentEl.addClass("atlas-log-view");

		// Header
		const header = contentEl.createDiv({ cls: "atlas-log-header" });
		header.createEl("h2", { text: "📋 Atlas Logs" });
		header.createEl("p", {
			cls: "atlas-log-subtitle",
			text: "Histórico do que aconteceu. Use 'Copiar tudo' pra mandar pra suporte/debug.",
		});

		// Toolbar
		const toolbar = contentEl.createDiv({ cls: "atlas-log-toolbar" });

		// Level filter
		const levelSelect = toolbar.createEl("select", { cls: "atlas-log-filter-level" });
		(["all", "debug", "info", "warn", "error"] as const).forEach((lv) => {
			const opt = levelSelect.createEl("option", {
				value: lv,
				text: lv === "all" ? "Todos" : lv.toUpperCase(),
			});
			if (lv === this.filterLevel) opt.selected = true;
		});
		levelSelect.addEventListener("change", () => {
			this.filterLevel = levelSelect.value as typeof this.filterLevel;
			this.renderEntries();
		});

		// Search
		const searchInput = toolbar.createEl("input", {
			cls: "atlas-log-filter-search",
			type: "text",
			attr: { placeholder: "Buscar texto..." },
		});
		searchInput.addEventListener("input", () => {
			this.searchQuery = searchInput.value;
			this.renderEntries();
		});

		// v0.73: Quick filter "Chat I/O only" — Conversa Atlas (entradas + respostas + tools)
		const btnChatOnly = toolbar.createEl("button", {
			text: "💬 Chat I/O",
			cls: "atlas-log-btn",
		});
		btnChatOnly.title = "Mostrar apenas queries, respostas e tool calls do chat";
		btnChatOnly.addEventListener("click", () => {
			this.searchQuery = "agent:|tool:";
			searchInput.value = this.searchQuery;
			this.filterLevel = "all";
			levelSelect.value = "all";
			this.renderEntries();
		});

		// Buttons
		const btnCopy = toolbar.createEl("button", { text: "📋 Copiar tudo", cls: "atlas-log-btn" });
		btnCopy.addEventListener("click", async () => this.copyAll());

		const btnExport = toolbar.createEl("button", { text: "📥 Salvar .log", cls: "atlas-log-btn" });
		btnExport.addEventListener("click", async () => this.exportToFile());

		const btnRefresh = toolbar.createEl("button", { text: "🔄 Atualizar", cls: "atlas-log-btn" });
		btnRefresh.addEventListener("click", () => this.renderEntries());

		const btnClear = toolbar.createEl("button", { text: "🗑️ Limpar", cls: "atlas-log-btn atlas-log-btn-danger" });
		btnClear.addEventListener("click", () => {
			clearLogEntries();
			this.renderEntries();
			new Notice("Logs limpos.");
		});

		// Entries list
		const listEl = contentEl.createDiv({ cls: "atlas-log-list" });
		(listEl as HTMLElement).id = "atlas-log-list";

		this.renderEntries();
	}

	private getFilteredEntries(): LogEntry[] {
		const filter: { level?: "debug" | "info" | "warn" | "error"; search?: string; limit?: number } = {
			limit: 500,
		};
		if (this.filterLevel !== "all") filter.level = this.filterLevel;
		if (this.searchQuery.trim().length > 0) filter.search = this.searchQuery.trim();
		return getLogEntries(filter);
	}

	private renderEntries(): void {
		const listEl = this.contentEl.querySelector("#atlas-log-list") as HTMLElement | null;
		if (!listEl) return;
		listEl.empty();

		const entries = this.getFilteredEntries();

		if (entries.length === 0) {
			listEl.createDiv({
				cls: "atlas-log-empty",
				text: "Nenhum log com esses filtros. Use Atlas + interaja com chat/comandos pra gerar logs.",
			});
			return;
		}

		// Show most recent first
		for (const e of [...entries].reverse()) {
			const row = listEl.createDiv({ cls: `atlas-log-row is-${e.level}` });
			row.createSpan({
				cls: "atlas-log-time",
				text: e.ts.substring(11, 19), // HH:MM:SS
			});
			row.createSpan({ cls: `atlas-log-level is-${e.level}`, text: e.level.toUpperCase() });
			row.createSpan({ cls: "atlas-log-msg", text: e.msg });
			if (e.meta && Object.keys(e.meta).length > 0) {
				const metaStr = JSON.stringify(e.meta);
				row.createSpan({
					cls: "atlas-log-meta",
					text: metaStr.length > 120 ? `${metaStr.substring(0, 120)}…` : metaStr,
				});
				row.title = metaStr; // full on hover
			}
		}

		// Counter
		listEl.createDiv({
			cls: "atlas-log-counter",
			text: `${entries.length} entries (mostrando até 500)`,
		});
	}

	private async copyAll(): Promise<void> {
		const entries = this.getFilteredEntries();
		const text = entries.map(formatLogEntry).join("\n");
		try {
			await navigator.clipboard.writeText(text);
			new Notice(`✓ ${entries.length} logs copiados pra clipboard.`);
		} catch (e) {
			new Notice(`Erro: ${String(e)}`, 6000);
		}
	}

	private async exportToFile(): Promise<void> {
		const entries = this.getFilteredEntries();
		const text = entries.map(formatLogEntry).join("\n");
		const date = new Date().toISOString().split("T")[0];
		const path = normalizePath(`${this.plugin.settings.folders.inbox}/${date}-atlas-log-export.md`);
		try {
			if (!this.app.vault.getAbstractFileByPath(this.plugin.settings.folders.inbox)) {
				await this.app.vault.createFolder(this.plugin.settings.folders.inbox);
			}
			const md = `# Atlas log export — ${date}\n\n\`\`\`\n${text}\n\`\`\`\n`;
			const existing = this.app.vault.getAbstractFileByPath(path);
			if (existing instanceof TFile) {
				await this.app.vault.modify(existing, md);
			} else {
				await this.app.vault.create(path, md);
			}
			new Notice(`✓ Log exportado em ${path}`);
		} catch (e) {
			new Notice(`Erro ao exportar: ${String(e)}`, 6000);
		}
	}
}

/**
 * Hook persistência de log → arquivo `.atlas/atlas.log` (rolling lines).
 * Append em batch a cada 5s pra não thrashing o vault.
 */
export function attachAtlasLogFile(plugin: AtlasPlugin): () => void {
	const buffer: string[] = [];
	let flushTimer: number | null = null;
	const FLUSH_INTERVAL_MS = 5000;
	const MAX_FILE_LINES = 5000;

	const flush = async (): Promise<void> => {
		if (buffer.length === 0) return;
		const lines = buffer.splice(0, buffer.length).join("\n") + "\n";
		try {
			const file = plugin.app.vault.getAbstractFileByPath(ATLAS_LOG_FILE);
			if (file instanceof TFile) {
				const cur = await plugin.app.vault.read(file);
				let merged = cur + lines;
				const all = merged.split("\n");
				if (all.length > MAX_FILE_LINES) {
					merged = all.slice(-MAX_FILE_LINES).join("\n");
				}
				await plugin.app.vault.modify(file, merged);
			} else {
				if (!plugin.app.vault.getAbstractFileByPath(plugin.settings.folders.atlas)) {
					await plugin.app.vault.createFolder(plugin.settings.folders.atlas);
				}
				await plugin.app.vault.create(ATLAS_LOG_FILE, lines);
			}
		} catch {
			// swallow — persistence is non-critical
		}
	};

	const hook = (entry: LogEntry): void => {
		buffer.push(formatLogEntry(entry));
		if (flushTimer === null) {
			flushTimer = window.setTimeout(() => {
				flushTimer = null;
				void flush();
			}, FLUSH_INTERVAL_MS);
		}
	};

	// Import lazy to avoid circular
	void import("../utils/logger").then((m) => m.attachLogPersistence(hook));

	// Return detach function
	return () => {
		if (flushTimer !== null) {
			window.clearTimeout(flushTimer);
			flushTimer = null;
		}
		void import("../utils/logger").then((m) => m.detachLogPersistence());
		void flush(); // final flush
	};
}
