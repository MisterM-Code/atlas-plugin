import { App, Modal, Notice, Setting, TFile, normalizePath } from "obsidian";
import type AtlasPlugin from "../../main";
import { RuleEngine, RuleMatch } from "./rule-engine";
import { isCoachPath } from "../coach/scope";
import { applyResponsiveModal } from "../ui/modal-helpers";

// ──────────────────────────────────────────────────────────────────
// Auto-MoC Generator — gera Maps of Content para pasta/tag
// ──────────────────────────────────────────────────────────────────

export interface MocOptions {
	source: { kind: "folder"; path: string } | { kind: "tag"; tag: string };
	groupBy?: "type" | "date" | "tag" | "none";
	includeBacklinkCount?: boolean;
	customTitle?: string;
}

export class AutoMocGenerator {
	constructor(private app: App, private plugin: AtlasPlugin) {}

	async generate(opts: MocOptions): Promise<{ notePath: string }> {
		const files = this.collectFiles(opts);
		if (files.length === 0) {
			throw new Error("Nenhuma nota encontrada para gerar MoC.");
		}

		const title = opts.customTitle ?? this.deriveTitle(opts);
		const md = this.renderMarkdown(title, opts, files);

		const folder =
			opts.source.kind === "folder"
				? opts.source.path
				: this.plugin.settings.folders.knowledge;
		const safeName = title.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-");
		const path = normalizePath(`${folder}/🗺️ MoC ${safeName}.md`);

		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, md);
		} else {
			await this.app.vault.create(path, md);
		}
		return { notePath: path };
	}

	private collectFiles(opts: MocOptions): TFile[] {
		const all = this.app.vault.getMarkdownFiles();
		if (opts.source.kind === "folder") {
			const prefix = opts.source.path;
			return all.filter((f) => f.path.startsWith(prefix) && !f.path.startsWith(".atlas"));
		}
		// tag-based
		const tag = opts.source.tag;
		return all.filter((f) => {
			if (isCoachPath(f.path)) return false;
			const cache = this.app.metadataCache.getFileCache(f);
			const fmTags = cache?.frontmatter?.tags;
			if (Array.isArray(fmTags) && fmTags.some((t: string) => t === tag || t.startsWith(`${tag}/`))) {
				return true;
			}
			const inline = cache?.tags ?? [];
			return inline.some((t) => t.tag === `#${tag}` || t.tag.startsWith(`#${tag}/`));
		});
	}

	private deriveTitle(opts: MocOptions): string {
		if (opts.customTitle) return opts.customTitle;
		if (opts.source.kind === "folder") {
			const last = opts.source.path.split("/").pop() ?? opts.source.path;
			return last.replace(/^\d+_/, "");
		}
		return opts.source.tag;
	}

	private renderMarkdown(title: string, opts: MocOptions, files: TFile[]): string {
		const groupBy = opts.groupBy ?? "type";
		const groups = this.groupFiles(files, groupBy);
		const lines: string[] = [];

		lines.push(`---`);
		lines.push(`type: moc`);
		lines.push(`source_kind: ${opts.source.kind}`);
		lines.push(
			`source: "${opts.source.kind === "folder" ? opts.source.path : opts.source.tag}"`
		);
		lines.push(`generated_at: ${new Date().toISOString()}`);
		lines.push(`generated_by: atlas`);
		lines.push(`tags: [moc, atlas-generated]`);
		lines.push(`---`);
		lines.push(``);
		lines.push(`# 🗺️ ${title}`);
		lines.push(``);
		lines.push(
			`> Map of Content gerado pelo Atlas a partir de ${files.length} notas em ${opts.source.kind === "folder" ? `pasta \`${opts.source.path}\`` : `tag #${opts.source.tag}`}.`
		);
		lines.push("");
		lines.push(`## 📊 Total: ${files.length} notas`);
		lines.push("");

		if (groupBy === "none") {
			for (const f of files) {
				lines.push(`- [[${f.path.replace(/\.md$/, "")}|${f.basename}]]`);
			}
		} else {
			for (const [group, items] of groups) {
				lines.push(`## ${groupHeader(group, groupBy)} (${items.length})`);
				lines.push("");
				for (const f of items) {
					lines.push(`- [[${f.path.replace(/\.md$/, "")}|${f.basename}]]`);
				}
				lines.push("");
			}
		}

		// Live Dataview as bonus (caso user tenha o plugin)
		lines.push("---");
		lines.push("");
		lines.push("## 🔄 Live (atualiza com Dataview)");
		lines.push("");
		lines.push("```dataview");
		if (opts.source.kind === "folder") {
			lines.push(`TABLE WITHOUT ID file.link AS Nota, type AS Tipo, date AS Data`);
			lines.push(`FROM "${opts.source.path}"`);
		} else {
			lines.push(`TABLE WITHOUT ID file.link AS Nota, type AS Tipo, date AS Data`);
			lines.push(`FROM #${opts.source.tag}`);
		}
		lines.push(`SORT date DESC, file.mtime DESC`);
		lines.push("```");
		lines.push("");
		lines.push("---");
		lines.push("");
		lines.push("_Atlas auto-MoC · regenerar via comando \"Atlas: Gerar MoC para pasta/tag\"._");

		return lines.join("\n");
	}

	private groupFiles(files: TFile[], groupBy: string): Map<string, TFile[]> {
		const groups = new Map<string, TFile[]>();
		for (const f of files) {
			const cache = this.app.metadataCache.getFileCache(f);
			const fm = cache?.frontmatter ?? {};
			let key = "outros";

			if (groupBy === "type") {
				key = String(fm.type ?? "outros");
			} else if (groupBy === "date") {
				const dateStr = (fm.date as string) ?? new Date(f.stat.mtime).toISOString();
				key = dateStr.substring(0, 7); // YYYY-MM
			} else if (groupBy === "tag") {
				const fmTags = Array.isArray(fm.tags) ? (fm.tags as string[]) : [];
				key = fmTags[0] ?? "sem-tag";
			}
			const arr = groups.get(key) ?? [];
			arr.push(f);
			groups.set(key, arr);
		}
		// Sort: alphabetical
		return new Map(Array.from(groups).sort(([a], [b]) => a.localeCompare(b)));
	}
}

function groupHeader(group: string, kind: string): string {
	if (kind === "date") {
		const [year, month] = group.split("-");
		try {
			const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
			return `📅 ${d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`;
		} catch {
			return group;
		}
	}
	if (kind === "type") {
		return `📂 ${group}`;
	}
	return group;
}

// ──────────────────────────────────────────────────────────────────
// Vault Wizard — multi-step modal pra cleanup do vault
// ──────────────────────────────────────────────────────────────────

interface WizardState {
	step: number;
	ruleMatches: RuleMatch[];
	selectedToApply: Set<string>;
	dupTags: { tag: string; count: number }[];
	orphanCount: number;
	staleCount: number;
}

export class VaultWizardModal extends Modal {
	private state: WizardState = {
		step: 0,
		ruleMatches: [],
		selectedToApply: new Set(),
		dupTags: [],
		orphanCount: 0,
		staleCount: 0,
	};

	constructor(app: App, private plugin: AtlasPlugin) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		applyResponsiveModal(contentEl, { preferredWidth: 680 });
		await this.renderStep();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async renderStep(): Promise<void> {
		this.contentEl.empty();
		const dots = this.contentEl.createDiv();
		dots.style.display = "flex";
		dots.style.gap = "6px";
		dots.style.marginBottom = "12px";
		for (let i = 0; i < 5; i++) {
			const dot = dots.createDiv();
			dot.style.width = "8px";
			dot.style.height = "8px";
			dot.style.borderRadius = "50%";
			dot.style.background =
				i < this.state.step
					? "var(--interactive-accent)"
					: i === this.state.step
						? "var(--interactive-accent-hover)"
						: "var(--background-modifier-border)";
		}

		switch (this.state.step) {
			case 0:
				this.renderIntro();
				break;
			case 1:
				await this.renderRulesStep();
				break;
			case 2:
				await this.renderTagsStep();
				break;
			case 3:
				await this.renderOrphansStep();
				break;
			case 4:
				await this.renderSummaryStep();
				break;
		}
	}

	private renderIntro(): void {
		const c = this.contentEl;
		c.createEl("h3", { text: "🧹 Atlas Vault Wizard" });
		c.createEl("p", {
			text: "Vou te ajudar a organizar o vault em 4 passos. Você sempre confirma antes de qualquer ação.",
		});

		const steps = c.createEl("ol");
		steps.createEl("li", {
			text: "🗂️ Aplicar rules (mover por type, taggear automático)",
		});
		steps.createEl("li", {
			text: "🏷️ Limpar tags duplicadas / órfãs",
		});
		steps.createEl("li", { text: "📌 Notas órfãs (sugerir MoC)" });
		steps.createEl("li", { text: "📋 Resumo das mudanças" });

		new Setting(c)
			.addButton((b) => b.setButtonText("Cancelar").onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText("Começar →")
					.setCta()
					.onClick(async () => {
						this.state.step = 1;
						await this.renderStep();
					})
			);
	}

	private async renderRulesStep(): Promise<void> {
		const c = this.contentEl;
		c.createEl("h3", { text: "🗂️ Passo 1 — Rules" });
		c.createEl("p", {
			text: "Atlas detectou estas notas que match com rules ativas. Selecione quais aplicar.",
		});

		const loading = c.createEl("div", { text: "Avaliando vault..." });
		const engine = new RuleEngine(this.app, this.plugin);
		this.state.ruleMatches = await engine.evaluateVault();
		loading.remove();

		if (this.state.ruleMatches.length === 0) {
			c.createEl("p", { text: "🎉 Nenhuma rule match. Vault já está organizado!" });
		} else {
			const list = c.createDiv();
			list.style.maxHeight = "300px";
			list.style.overflowY = "auto";
			list.style.border = "1px solid var(--background-modifier-border)";
			list.style.borderRadius = "4px";
			list.style.padding = "8px";

			for (const m of this.state.ruleMatches) {
				const row = list.createDiv();
				row.style.display = "flex";
				row.style.alignItems = "center";
				row.style.gap = "8px";
				row.style.padding = "4px 0";

				const cb = row.createEl("input", { type: "checkbox" }) as HTMLInputElement;
				cb.checked = true;
				this.state.selectedToApply.add(m.file.path + "::" + m.rule.id);
				cb.addEventListener("change", () => {
					const key = m.file.path + "::" + m.rule.id;
					if (cb.checked) this.state.selectedToApply.add(key);
					else this.state.selectedToApply.delete(key);
				});

				const text = row.createDiv();
				text.style.fontSize = "12px";
				const t1 = text.createEl("div", { text: m.file.path });
				t1.style.fontWeight = "bold";
				const t2 = text.createEl("div", { text: `→ ${m.preview} (rule: ${m.rule.name})` });
				t2.style.fontSize = "11px";
				t2.style.opacity = "0.7";
			}
		}

		new Setting(c)
			.addButton((b) =>
				b.setButtonText("← Voltar").onClick(async () => {
					this.state.step = 0;
					await this.renderStep();
				})
			)
			.addButton((b) =>
				b
					.setButtonText("Próximo →")
					.setCta()
					.onClick(async () => {
						this.state.step = 2;
						await this.renderStep();
					})
			);
	}

	private async renderTagsStep(): Promise<void> {
		const c = this.contentEl;
		c.createEl("h3", { text: "🏷️ Passo 2 — Tags" });
		c.createEl("p", { text: "Top tags do vault — revise duplicatas/typos." });

		const tagCount = new Map<string, number>();
		for (const f of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(f);
			const fmTags = cache?.frontmatter?.tags;
			if (Array.isArray(fmTags)) {
				for (const t of fmTags) {
					tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
				}
			}
			for (const t of cache?.tags ?? []) {
				const clean = t.tag.replace(/^#/, "");
				tagCount.set(clean, (tagCount.get(clean) ?? 0) + 1);
			}
		}
		this.state.dupTags = Array.from(tagCount.entries())
			.map(([tag, count]) => ({ tag, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 30);

		const list = c.createDiv();
		list.style.maxHeight = "300px";
		list.style.overflowY = "auto";
		list.style.display = "grid";
		list.style.gridTemplateColumns = "1fr 1fr";
		list.style.gap = "4px";
		list.style.padding = "8px";
		list.style.border = "1px solid var(--background-modifier-border)";
		list.style.borderRadius = "4px";

		for (const { tag, count } of this.state.dupTags) {
			const row = list.createDiv();
			row.style.padding = "4px 6px";
			row.style.fontSize = "11px";
			row.style.background = "var(--background-secondary)";
			row.style.borderRadius = "3px";
			row.setText(`#${tag} (${count})`);
		}

		c.createEl("p", {
			text: "💡 Duplicatas/typos não são fundidas automaticamente. Para limpar, edite as tags manualmente nas notas.",
		}).style.fontSize = "11px";

		new Setting(c)
			.addButton((b) =>
				b.setButtonText("← Voltar").onClick(async () => {
					this.state.step = 1;
					await this.renderStep();
				})
			)
			.addButton((b) =>
				b
					.setButtonText("Próximo →")
					.setCta()
					.onClick(async () => {
						this.state.step = 3;
						await this.renderStep();
					})
			);
	}

	private async renderOrphansStep(): Promise<void> {
		const c = this.contentEl;
		c.createEl("h3", { text: "📌 Passo 3 — Notas órfãs" });
		c.createEl("p", { text: "Notas sem nenhum backlink (ninguém aponta pra elas)." });

		let orphans = 0;
		let stale = 0;
		const cache = this.app.metadataCache as unknown as {
			getBacklinksForFile?: (file: TFile) => { data: Map<string, unknown> };
		};
		const ninetyDaysAgo = Date.now() - 90 * 86_400_000;
		for (const f of this.app.vault.getMarkdownFiles()) {
			if (f.path.startsWith(".atlas") || f.path.startsWith("99_Archive")) continue;
			const r = cache.getBacklinksForFile?.(f);
			if (!r?.data || r.data.size === 0) orphans++;
			if (f.stat.mtime < ninetyDaysAgo) stale++;
		}
		this.state.orphanCount = orphans;
		this.state.staleCount = stale;

		const stats = c.createDiv();
		stats.style.padding = "12px";
		stats.style.background = "var(--background-secondary)";
		stats.style.borderRadius = "4px";
		stats.style.marginBottom = "12px";
		stats.createEl("div", { text: `🔗 Notas órfãs: ${orphans}` }).style.marginBottom = "4px";
		stats.createEl("div", { text: `📅 Notas stale (>90d sem mexer): ${stale}` });

		c.createEl("p", {
			text: "💡 Sugestão: gere MoC pra pastas grandes (`Atlas: Gerar MoC para pasta/tag`) — Atlas indexa órfãs nele.",
		}).style.fontSize = "11px";

		new Setting(c)
			.addButton((b) =>
				b.setButtonText("← Voltar").onClick(async () => {
					this.state.step = 2;
					await this.renderStep();
				})
			)
			.addButton((b) =>
				b
					.setButtonText("Resumo →")
					.setCta()
					.onClick(async () => {
						this.state.step = 4;
						await this.renderStep();
					})
			);
	}

	private async renderSummaryStep(): Promise<void> {
		const c = this.contentEl;
		c.createEl("h3", { text: "📋 Passo 4 — Resumo" });

		const summary = c.createDiv();
		summary.style.padding = "12px";
		summary.style.background = "var(--background-secondary)";
		summary.style.borderRadius = "4px";
		summary.style.marginBottom = "12px";

		const selectedMatches = this.state.ruleMatches.filter((m) =>
			this.state.selectedToApply.has(m.file.path + "::" + m.rule.id)
		);

		summary.createEl("div", {
			text: `🗂️ ${selectedMatches.length} rules aplicar`,
		}).style.marginBottom = "4px";
		summary.createEl("div", {
			text: `🏷️ ${this.state.dupTags.length} tags inventariadas`,
		}).style.marginBottom = "4px";
		summary.createEl("div", { text: `🔗 ${this.state.orphanCount} órfãs identificadas` });

		c.createEl("p", {
			text: "Atlas vai aplicar somente as rules selecionadas. Tags/órfãs ficam pra você revisar manualmente.",
		}).style.fontSize = "11px";

		new Setting(c)
			.addButton((b) =>
				b.setButtonText("← Voltar").onClick(async () => {
					this.state.step = 3;
					await this.renderStep();
				})
			)
			.addButton((b) =>
				b
					.setButtonText(`✅ Aplicar ${selectedMatches.length} ações`)
					.setCta()
					.onClick(async () => {
						this.close();
						const engine = new RuleEngine(this.app, this.plugin);
						const notice = new Notice(`Atlas: aplicando ${selectedMatches.length} ações...`, 0);
						const r = await engine.applyAll(selectedMatches);
						notice.hide();
						new Notice(
							`Atlas Vault Wizard: ${r.applied} aplicadas, ${r.failed} falharam.`,
							8000
						);
					})
			);
	}
}
