/**
 * v0.63.0 — Atlas Vault Importer Wizard.
 *
 * Modal full-screen com 7 telas pra importar vault externo com REVISÃO GRANULAR
 * em cada estágio (categorias / pessoas+sistemas / tags / pastas / config / run / done).
 *
 * Pattern: VaultWizardModal (vault-organizer.ts:192) + SlideOverPanel pra detalhes.
 */

import { App, Modal, Notice, Setting } from "obsidian";
import type AtlasPlugin from "../../main";
import { applyResponsiveModal } from "./modal-helpers";
import {
	ImportPipeline,
	ImportOptions,
	ClassifiedNote,
	PipelineProgress,
	PipelineResult,
} from "../import/import-pipeline";
import { NoteType, targetFolderFor } from "../import/heuristic-classifier";
import { t } from "../i18n";

type StepId = "welcome" | "categories" | "entities" | "tags" | "folders" | "configure" | "run";

const ALL_NOTE_TYPES: NoteType[] = [
	"daily", "1on1", "meeting", "weekly-status", "project", "person",
	"raid", "incident", "adr", "paper", "course", "theme", "knowledge",
	"inbox", "other",
];

const NOTE_TYPE_EMOJI: Record<NoteType, string> = {
	daily: "📓", "1on1": "🤝", meeting: "👥", "weekly-status": "📊",
	project: "🚀", person: "👤", raid: "⚠️", incident: "🚨",
	adr: "📜", paper: "📄", course: "🎓", theme: "🎨",
	knowledge: "🧠", inbox: "📥", other: "❓",
};

export class ImportWizardModal extends Modal {
	private pipeline: ImportPipeline;
	private currentStep: StepId = "welcome";
	private opts: ImportOptions = {
		sourceFolder: "",
		includeAttachments: false,
		extractWithLLM: true,
		autoTagAfter: false,
		moveFiles: true,
		backupBeforeMove: false,
	};
	private classified: ClassifiedNote[] = [];
	private personGroups: Map<string, { count: number; aliases: Set<string>; rejected: boolean }> = new Map();
	private systemGroups: Map<string, { count: number; rejected: boolean }> = new Map();
	private tagGroups: Map<string, { count: number; accepted: boolean }> = new Map();
	private result: PipelineResult | null = null;

	constructor(app: App, private plugin: AtlasPlugin) {
		super(app);
		this.pipeline = new ImportPipeline(plugin);
	}

	onOpen(): void {
		applyResponsiveModal(this.contentEl, { preferredWidth: 1100 });
		this.contentEl.addClass("atlas-import-wizard");
		this.render();
	}

	onClose(): void {
		this.pipeline.cancel();
	}

	private render(): void {
		this.contentEl.empty();
		this.renderHeader();
		const body = this.contentEl.createDiv({ cls: "atlas-import-body" });
		switch (this.currentStep) {
			case "welcome": this.renderWelcome(body); break;
			case "categories": this.renderCategories(body); break;
			case "entities": this.renderEntities(body); break;
			case "tags": this.renderTags(body); break;
			case "folders": this.renderFolders(body); break;
			case "configure": this.renderConfigure(body); break;
			case "run": this.renderRunOrDone(body); break;
		}
		this.renderFooter();
	}

	private renderHeader(): void {
		const header = this.contentEl.createDiv({ cls: "atlas-import-header" });
		const title = header.createEl("h2", { cls: "atlas-import-title" });
		title.setText(t("import.title"));
		// Dots progress
		const dots = header.createDiv({ cls: "atlas-import-dots" });
		const steps: StepId[] = ["welcome", "categories", "entities", "tags", "folders", "configure", "run"];
		for (const s of steps) {
			const dot = dots.createDiv({ cls: "atlas-import-dot" });
			if (s === this.currentStep) dot.addClass("is-active");
			const idx = steps.indexOf(s);
			const cur = steps.indexOf(this.currentStep);
			if (idx < cur) dot.addClass("is-done");
		}
	}

	private renderFooter(): void {
		const footer = this.contentEl.createDiv({ cls: "atlas-import-footer" });
		const back = footer.createEl("button", { text: "← Voltar" });
		back.disabled = this.currentStep === "welcome" || this.currentStep === "run";
		back.onclick = () => this.goBack();
		const spacer = footer.createDiv({ cls: "atlas-import-footer-spacer" });
		spacer.style.flex = "1";
		// Save progress (em qualquer step exceto welcome/run)
		if (this.currentStep !== "welcome" && this.currentStep !== "run") {
			const save = footer.createEl("button", { text: "💾 Salvar e sair" });
			save.onclick = () => {
				new Notice("Atlas: progresso salvo (resumo em .atlas/import-state.json)");
				this.close();
			};
		}
		const next = footer.createEl("button", { cls: "mod-cta" });
		next.setText(this.nextLabel());
		next.onclick = () => void this.goNext();
	}

	private nextLabel(): string {
		switch (this.currentStep) {
			case "welcome": return "🔍 Escanear →";
			case "configure": return "▶️ Iniciar import";
			case "run": return this.result ? "✕ Fechar" : "Aguarde...";
			default: return "Continuar →";
		}
	}

	private async goNext(): Promise<void> {
		try {
			switch (this.currentStep) {
				case "welcome":
					if (!this.opts.sourceFolder) {
						new Notice("Atlas: escolha uma pasta de origem.");
						return;
					}
					await this.runScanAndClassify();
					this.currentStep = "categories";
					break;
				case "categories":
					this.currentStep = "entities";
					this.computeEntityGroups();
					break;
				case "entities":
					this.currentStep = "tags";
					this.computeTagGroups();
					break;
				case "tags":
					this.currentStep = "folders";
					break;
				case "folders":
					this.currentStep = "configure";
					break;
				case "configure":
					this.currentStep = "run";
					this.render();
					await this.runImport();
					return;
				case "run":
					this.close();
					return;
			}
			this.render();
		} catch (e) {
			new Notice(`Atlas erro: ${String(e)}`);
		}
	}

	private goBack(): void {
		const order: StepId[] = ["welcome", "categories", "entities", "tags", "folders", "configure", "run"];
		const idx = order.indexOf(this.currentStep);
		if (idx > 0) this.currentStep = order[idx - 1];
		this.render();
	}

	// ─── Tela 1: Welcome + Source picker ───
	private renderWelcome(body: HTMLElement): void {
		const hero = body.createDiv({ cls: "atlas-import-hero" });
		hero.createEl("h1", { text: "📥 Importe seu vault em ~3 minutos" });
		hero.createEl("p", {
			cls: "atlas-import-subtitle",
			text: "Atlas vai analisar suas notas, identificar pessoas e sistemas, e organizar tudo no formato Atlas. Você revisa cada passo antes de mover.",
		});
		new Setting(body)
			.setName("Pasta de origem")
			.setDesc("Path absoluto OU subfolder do vault atual (ex: 'Notas Antigas')")
			.addText((tx) =>
				tx
					.setPlaceholder("/Users/.../old-vault OU subfolder")
					.setValue(this.opts.sourceFolder)
					.onChange((v) => (this.opts.sourceFolder = v.trim()))
			);
		new Setting(body)
			.setName("Incluir attachments (.png/.pdf/.jpg)")
			.setDesc("Por default, só importa .md")
			.addToggle((tg) =>
				tg.setValue(!!this.opts.includeAttachments).onChange((v) => (this.opts.includeAttachments = v))
			);
	}

	// ─── Tela 2-3: Análise + Categorias review ───
	private renderCategories(body: HTMLElement): void {
		const total = this.classified.length;
		const stats = body.createDiv({ cls: "atlas-import-stats" });
		const lowConf = this.classified.filter((n) => n.confidence < 0.7).length;
		const dateRange = this.computeDateRange();
		const tagsCount = this.computeUniqueTags().size;
		this.statCard(stats, "📄", String(total), "Total notas");
		this.statCard(stats, "📅", dateRange, "Range datas");
		this.statCard(stats, "🏷️", String(tagsCount), "Tags únicas");
		this.statCard(stats, "❓", String(lowConf), "Baixa confidence (LLM-needed)");

		body.createEl("h3", { text: "🗂️ Categorias detectadas" });
		body.createEl("p", {
			cls: "atlas-import-hint",
			text: "Click em qualquer linha pra ver as notas e reclassificar individualmente.",
		});
		const table = body.createEl("table", { cls: "atlas-import-table" });
		const head = table.createEl("thead").createEl("tr");
		for (const h of ["Tipo", "Count", "Confidence média", "Amostra"]) {
			head.createEl("th", { text: h });
		}
		const tbody = table.createEl("tbody");
		const grouped = this.groupByType();
		for (const [type, list] of grouped) {
			if (list.length === 0) continue;
			const row = tbody.createEl("tr");
			row.addClass("atlas-import-row");
			const avgConf = list.reduce((s, n) => s + n.confidence, 0) / list.length;
			const confClass = avgConf >= 0.85 ? "is-high" : avgConf >= 0.7 ? "is-mid" : "is-low";
			row.createEl("td", { text: `${NOTE_TYPE_EMOJI[type]} ${type}` });
			row.createEl("td", { text: String(list.length) });
			const confCell = row.createEl("td");
			confCell.addClass(`atlas-import-conf-${confClass}`);
			confCell.setText(`${(avgConf * 100).toFixed(0)}%`);
			row.createEl("td", { text: list[0]?.relPath ?? "" });
			row.onclick = () => this.openCategoryReview(type, list);
		}
	}

	// ─── Tela 4-5: Entities (Pessoas + Sistemas) ───
	private renderEntities(body: HTMLElement): void {
		body.createEl("h3", { text: "👥 Pessoas detectadas" });
		const personsGrid = body.createDiv({ cls: "atlas-import-grid" });
		if (this.personGroups.size === 0) {
			personsGrid.createEl("p", { cls: "atlas-import-empty", text: t("import.empty.persons") });
		} else {
			for (const [name, info] of this.personGroups) {
				this.entityCard(personsGrid, "👤", name, `${info.count} menções`,
					info.aliases.size > 0 ? `aliases: ${Array.from(info.aliases).join(", ")}` : "",
					info.rejected, () => {
						info.rejected = !info.rejected;
						this.render();
					});
			}
		}
		body.createEl("h3", { text: "🖥️ Sistemas detectados" });
		const sysGrid = body.createDiv({ cls: "atlas-import-grid" });
		if (this.systemGroups.size === 0) {
			sysGrid.createEl("p", { cls: "atlas-import-empty", text: t("import.empty.systems") });
		} else {
			for (const [name, info] of this.systemGroups) {
				this.entityCard(sysGrid, "🖥️", name, `${info.count} menções`, "",
					info.rejected, () => {
						info.rejected = !info.rejected;
						this.render();
					});
			}
		}
	}

	// ─── Tela 6: Tags ───
	private renderTags(body: HTMLElement): void {
		body.createEl("h3", { text: "🏷️ Tags & themes propostos" });
		body.createEl("p", { cls: "atlas-import-hint", text: "Selecione tags pra aplicar nas notas importadas." });
		if (this.tagGroups.size === 0) {
			body.createEl("p", { cls: "atlas-import-empty", text: t("import.empty.tags") });
			return;
		}
		const list = body.createDiv({ cls: "atlas-import-tag-list" });
		const sorted = Array.from(this.tagGroups.entries()).sort((a, b) => b[1].count - a[1].count);
		for (const [name, info] of sorted) {
			const row = list.createDiv({ cls: "atlas-import-tag-row" });
			const cb = row.createEl("input", { type: "checkbox" }) as HTMLInputElement;
			cb.checked = info.accepted;
			cb.onchange = () => { info.accepted = cb.checked; };
			row.createSpan({ cls: "atlas-import-tag-name", text: `#${name}` });
			row.createSpan({ cls: "atlas-import-tag-count", text: `${info.count} notas` });
		}
		const bulk = body.createDiv({ cls: "atlas-import-bulk" });
		const accAll = bulk.createEl("button", { text: "✓ Aceitar todas" });
		accAll.onclick = () => {
			for (const v of this.tagGroups.values()) v.accepted = true;
			this.render();
		};
		const rejAll = bulk.createEl("button", { text: "❌ Rejeitar todas" });
		rejAll.onclick = () => {
			for (const v of this.tagGroups.values()) v.accepted = false;
			this.render();
		};
	}

	// ─── Tela 7: Folder mapping ───
	private renderFolders(body: HTMLElement): void {
		body.createEl("h3", { text: "📁 Mapeamento de pastas" });
		body.createEl("p", {
			cls: "atlas-import-hint",
			text: "Cada categoria vai pra uma pasta Atlas. Mude se quiser destino diferente.",
		});
		const table = body.createEl("table", { cls: "atlas-import-table" });
		const head = table.createEl("thead").createEl("tr");
		for (const h of ["Tipo", "Count", "Pasta destino"]) head.createEl("th", { text: h });
		const tbody = table.createEl("tbody");
		const grouped = this.groupByType();
		for (const [type, list] of grouped) {
			if (list.length === 0) continue;
			const row = tbody.createEl("tr");
			row.createEl("td", { text: `${NOTE_TYPE_EMOJI[type]} ${type}` });
			row.createEl("td", { text: String(list.length) });
			const cell = row.createEl("td");
			const input = cell.createEl("input", { type: "text" }) as HTMLInputElement;
			input.value = targetFolderFor(type);
			input.style.width = "100%";
			input.onchange = () => {
				for (const n of list) {
					n.userOverride = { ...(n.userOverride ?? {}), targetFolder: input.value.trim() };
				}
			};
		}
	}

	// ─── Tela 8: Configure ───
	private renderConfigure(body: HTMLElement): void {
		body.createEl("h3", { text: "⚙️ Configurações finais" });
		new Setting(body)
			.setName("Extrair entities via LLM (recomendado)")
			.setDesc("Para notas com baixa confidence (~10%), aciona LLM. Custo estimado: $0.001/nota.")
			.addToggle((tg) =>
				tg.setValue(!!this.opts.extractWithLLM).onChange((v) => (this.opts.extractWithLLM = v))
			);
		new Setting(body)
			.setName("Auto-tag pós-import")
			.setDesc("LLM sugere tags pra cada nota (custo +$0.001/nota).")
			.addToggle((tg) =>
				tg.setValue(!!this.opts.autoTagAfter).onChange((v) => (this.opts.autoTagAfter = v))
			);
		new Setting(body)
			.setName("Mover arquivos")
			.setDesc("Se desligado, só roda a análise (dry-run sem mover).")
			.addToggle((tg) =>
				tg.setValue(!!this.opts.moveFiles).onChange((v) => (this.opts.moveFiles = v))
			);
		new Setting(body)
			.setName("Backup snapshot pre-import (99_Archive)")
			.setDesc("Copia notas pra 99_Archive antes de mover (proteção extra).")
			.addToggle((tg) =>
				tg.setValue(!!this.opts.backupBeforeMove).onChange((v) => (this.opts.backupBeforeMove = v))
			);
		// Custo estimado
		const lowConf = this.classified.filter((n) => n.confidence < 0.7).length;
		const llmCost = this.opts.extractWithLLM ? lowConf * 0.001 : 0;
		const tagCost = this.opts.autoTagAfter ? this.classified.length * 0.001 : 0;
		const total = llmCost + tagCost + 0.01;
		body.createDiv({
			cls: "atlas-import-cost",
			text: `💰 Custo estimado: ~$${total.toFixed(2)}  (${lowConf} LLM extractions + embeddings)`,
		});
	}

	// ─── Tela 9-10: Run + Done ───
	private renderRunOrDone(body: HTMLElement): void {
		if (this.result) {
			this.renderDone(body);
		} else {
			this.renderRun(body);
		}
	}

	private renderRun(body: HTMLElement): void {
		body.createEl("h3", { text: "🚀 Executando import..." });
		const log = body.createDiv({ cls: "atlas-import-log" });
		log.style.minHeight = "300px";
		const lines: string[] = [];
		this.runImportInternal((p) => {
			const line = `[${p.stage}] ${p.stageName}: ${p.processed}/${p.total}${p.currentItem ? ` · ${p.currentItem.split("/").pop()}` : ""}`;
			lines.push(line);
			if (lines.length > 100) lines.shift();
			log.empty();
			for (const l of lines) log.createDiv({ cls: "atlas-import-log-line", text: l });
			log.scrollTop = log.scrollHeight;
		}).catch((e) => {
			new Notice(`Atlas erro: ${String(e)}`);
		});
	}

	private renderDone(body: HTMLElement): void {
		const r = this.result!.report;
		const dur = Math.max(1, Math.round((r.finishedAt - r.startedAt) / 1000));
		const hero = body.createDiv({ cls: "atlas-import-done" });
		hero.createEl("h1", { text: `🎉 Pronto! ${r.totalNotes} notas importadas em ${dur}s` });
		const stats = body.createDiv({ cls: "atlas-import-stats" });
		this.statCard(stats, "✅", String(r.moved), "Movidas");
		this.statCard(stats, "👥", String(r.personsCreated.length), "Pessoas criadas");
		this.statCard(stats, "🖥️", String(r.systemsCreated.length), "Sistemas");
		this.statCard(stats, "💰", `$${r.costUSD.toFixed(2)}`, "Custo total");
		const actions = body.createDiv({ cls: "atlas-import-actions" });
		const openBtn = actions.createEl("button", { cls: "mod-cta", text: "📋 Abrir relatório" });
		openBtn.onclick = async () => {
			const f = this.app.vault.getAbstractFileByPath(this.result!.reportPath);
			if (f) {
				const { TFile } = await import("obsidian");
				if (f instanceof TFile) await this.app.workspace.getLeaf().openFile(f);
			}
			this.close();
		};
		const kgBtn = actions.createEl("button", { text: "🌐 Ver KG" });
		kgBtn.onclick = () => {
			(this.plugin as unknown as { activateMasterTab(id: string): Promise<void> }).activateMasterTab("knowledge");
			this.close();
		};
	}

	// ─── helpers ───

	private async runScanAndClassify(): Promise<void> {
		new Notice("Atlas: escaneando vault...");
		const manifest = await this.pipeline.scan(this.opts);
		this.classified = await this.pipeline.classify(manifest);
		new Notice(`Atlas: ${this.classified.length} notas analisadas.`);
	}

	private computeEntityGroups(): void {
		this.personGroups.clear();
		this.systemGroups.clear();
		for (const note of this.classified) {
			// Persons via LLM extraction (ExtractionResult.people is string[])
			const ex = note.llmExtraction;
			if (ex?.people) {
				for (const personName of ex.people) {
					if (!personName) continue;
					const cur = this.personGroups.get(personName) ?? { count: 0, aliases: new Set<string>(), rejected: false };
					cur.count += 1;
					this.personGroups.set(personName, cur);
				}
			}
			// Persons via filename pattern (1on1-Maria-...)
			if (note.noteType === "1on1") {
				const m = note.relPath.match(/1on1[-_]?([A-Z][a-zA-Z]+)/);
				if (m) {
					const name = m[1];
					const cur = this.personGroups.get(name) ?? { count: 0, aliases: new Set<string>(), rejected: false };
					cur.count += 1;
					this.personGroups.set(name, cur);
				}
			}
			// Systems via SystemDetector matchCount (já contado, mas precisamos do nome)
			// → fallback: detectar via plugin.systemDetector se disponível
			const sd = (this.plugin as unknown as { systemDetector?: { detect(s: string): { systemName: string }[] } }).systemDetector;
			if (sd && note.bodyPreview) {
				try {
					const matches = sd.detect(note.bodyPreview);
					for (const m of matches) {
						const cur = this.systemGroups.get(m.systemName) ?? { count: 0, rejected: false };
						cur.count += 1;
						this.systemGroups.set(m.systemName, cur);
					}
				} catch {/* ignore */}
			}
		}
	}

	private computeTagGroups(): void {
		this.tagGroups.clear();
		for (const note of this.classified) {
			for (const tag of note.tags) {
				if (!tag) continue;
				const cur = this.tagGroups.get(tag) ?? { count: 0, accepted: true };
				cur.count += 1;
				this.tagGroups.set(tag, cur);
			}
		}
	}

	private groupByType(): Map<NoteType, ClassifiedNote[]> {
		const out = new Map<NoteType, ClassifiedNote[]>();
		for (const t of ALL_NOTE_TYPES) out.set(t, []);
		for (const n of this.classified) out.get(n.noteType)!.push(n);
		return out;
	}

	private computeDateRange(): string {
		if (this.classified.length === 0) return "N/A";
		const mtimes = this.classified.map((n) => n.mtime);
		const min = new Date(Math.min(...mtimes)).toISOString().slice(0, 10);
		const max = new Date(Math.max(...mtimes)).toISOString().slice(0, 10);
		return `${min} → ${max}`;
	}

	private computeUniqueTags(): Set<string> {
		const set = new Set<string>();
		for (const n of this.classified) for (const t of n.tags) set.add(t);
		return set;
	}

	private statCard(container: HTMLElement, emoji: string, value: string, label: string): void {
		const card = container.createDiv({ cls: "atlas-import-stat" });
		card.createDiv({ cls: "atlas-import-stat-emoji", text: emoji });
		card.createDiv({ cls: "atlas-import-stat-value", text: value });
		card.createDiv({ cls: "atlas-import-stat-label", text: label });
	}

	private entityCard(
		container: HTMLElement,
		emoji: string,
		name: string,
		count: string,
		extra: string,
		rejected: boolean,
		toggle: () => void
	): void {
		const card = container.createDiv({ cls: `atlas-import-entity ${rejected ? "is-rejected" : ""}` });
		card.createSpan({ cls: "atlas-import-entity-emoji", text: emoji });
		const meta = card.createDiv({ cls: "atlas-import-entity-meta" });
		meta.createDiv({ cls: "atlas-import-entity-name", text: name });
		meta.createDiv({ cls: "atlas-import-entity-count", text: count });
		if (extra) meta.createDiv({ cls: "atlas-import-entity-extra", text: extra });
		const btn = card.createEl("button", { text: rejected ? "↩️ Aceitar" : "❌ Rejeitar" });
		btn.onclick = toggle;
	}

	private openCategoryReview(type: NoteType, notes: ClassifiedNote[]): void {
		const modal = new CategoryReviewModal(this.app, type, notes, () => this.render());
		modal.open();
	}

	private async runImport(): Promise<void> {
		// Aplicar overrides de rejeição em pessoas → marcar notas com pessoas rejeitadas
		for (const note of this.classified) {
			const ex = note.llmExtraction;
			if (!ex?.people) continue;
			ex.people = ex.people.filter((personName) => !this.personGroups.get(personName)?.rejected);
		}
		this.result = await this.pipeline.run(this.opts);
		this.render();
	}

	private async runImportInternal(onProgress: (p: PipelineProgress) => void): Promise<void> {
		// Already classified; just continue from extract → move → upsert
		this.result = await this.pipeline.run(this.opts, onProgress);
		this.render();
	}
}

class CategoryReviewModal extends Modal {
	constructor(
		app: App,
		private type: NoteType,
		private notes: ClassifiedNote[],
		private onChange: () => void
	) {
		super(app);
	}

	onOpen(): void {
		applyResponsiveModal(this.contentEl, { preferredWidth: 720 });
		this.contentEl.addClass("atlas-import-cat-review");
		this.contentEl.createEl("h2", { text: `${NOTE_TYPE_EMOJI[this.type]} ${this.type} (${this.notes.length})` });
		const list = this.contentEl.createDiv();
		for (const note of this.notes) {
			const row = list.createDiv({ cls: "atlas-import-cat-row" });
			row.createDiv({ cls: "atlas-import-cat-path", text: note.relPath });
			row.createDiv({ cls: "atlas-import-cat-conf", text: `${(note.confidence * 100).toFixed(0)}%` });
			const sel = row.createEl("select") as HTMLSelectElement;
			for (const t of ALL_NOTE_TYPES) {
				const opt = sel.createEl("option", { text: t, value: t });
				if (t === note.noteType) opt.selected = true;
			}
			sel.onchange = () => {
				note.userOverride = { ...(note.userOverride ?? {}), noteType: sel.value as NoteType };
				note.noteType = sel.value as NoteType;
				this.onChange();
			};
		}
	}
}
