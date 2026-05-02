import { ItemView, WorkspaceLeaf, TFile, Notice } from "obsidian";
import type AtlasPlugin from "../../main";

export const ATLAS_HEALTH_VIEW = "atlas-workspace-health";

interface HealthMetrics {
	totalNotes: number;
	totalWords: number;
	avgWordsPerNote: number;
	emptyNotes: number;
	stubNotes: number;
	orphanNotes: number;
	highlyConnected: number;
	staleNotes: number;
	mostLinkedNotes: { path: string; backlinks: number }[];
	leastTouched: { path: string; daysSinceModified: number }[];
	folderDistribution: { folder: string; count: number }[];
	clustersDisconnected: number;
	tagSparsity: { tagged: number; untagged: number };
	kgGrowth: {
		people: { last30: number; total: number };
		themes: { last30: number; total: number };
		sessions: { last30: number; total: number };
	};
}

export class WorkspaceHealthView extends ItemView {
	private container!: HTMLDivElement;

	constructor(leaf: WorkspaceLeaf, private plugin: AtlasPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return ATLAS_HEALTH_VIEW;
	}

	getDisplayText(): string {
		return "Atlas Health";
	}

	getIcon(): string {
		return "activity";
	}

	async onOpen(): Promise<void> {
		const c = this.containerEl.children[1];
		c.empty();
		(c as HTMLElement).style.padding = "16px";
		(c as HTMLElement).style.overflow = "auto";

		this.container = c.createDiv() as HTMLDivElement;

		const h = this.container.createDiv();
		h.style.display = "flex";
		h.style.justifyContent = "space-between";
		h.style.alignItems = "center";
		h.style.marginBottom = "16px";
		h.createEl("h3", { text: "🩺 Workspace Health" });
		const btn = h.createEl("button", { text: "↻ Recalcular" });
		btn.style.fontSize = "11px";
		btn.style.padding = "4px 10px";
		btn.addEventListener("click", () => this.render());

		await this.render();
	}

	async onClose(): Promise<void> {}

	private async render(): Promise<void> {
		// Keep header, clear rest
		const header = this.container.firstChild;
		this.container.empty();
		if (header) this.container.appendChild(header);

		const loading = this.container.createEl("div", { text: "Calculando..." });
		loading.style.padding = "12px";
		loading.style.opacity = "0.6";

		const m = await this.computeMetrics();
		loading.remove();

		this.renderOverview(m);
		this.renderHealthScore(m);
		this.renderProblems(m);
		this.renderTopLists(m);
		this.renderKgGrowth(m);
		this.renderFolders(m);
		this.renderRecommendations(m);
	}

	private async computeMetrics(): Promise<HealthMetrics> {
		const allFiles = this.app.vault.getMarkdownFiles();
		const now = Date.now();

		let totalWords = 0;
		let emptyNotes = 0;
		let stubNotes = 0;
		let orphanNotes = 0;
		let highlyConnected = 0;
		let staleNotes = 0;
		let tagged = 0;

		const folderCount = new Map<string, number>();
		const linkedCounts: { path: string; backlinks: number }[] = [];
		const leastTouched: { path: string; daysSinceModified: number }[] = [];

		const cache = this.app.metadataCache as unknown as {
			getBacklinksForFile?: (file: TFile) => { data: Map<string, unknown> };
		};

		for (const f of allFiles) {
			if (f.path.startsWith(".atlas") || f.path.startsWith(this.app.vault.configDir)) continue;

			let raw = "";
			try {
				raw = await this.app.vault.read(f);
			} catch {
				continue;
			}

			const wordCount = raw.split(/\s+/).filter(Boolean).length;
			totalWords += wordCount;

			if (wordCount === 0 || raw.trim().length < 10) {
				emptyNotes++;
				continue;
			}
			if (wordCount < 50) stubNotes++;

			// Tags
			const meta = this.app.metadataCache.getFileCache(f);
			const fmTags = meta?.frontmatter?.tags;
			const inlineTags = (raw.match(/#[a-zA-Z][a-zA-Z0-9_/-]*/g) ?? []).length;
			if ((Array.isArray(fmTags) && fmTags.length > 0) || inlineTags > 0) tagged++;

			// Backlinks
			let backlinks = 0;
			try {
				const r = cache.getBacklinksForFile?.(f);
				if (r?.data) backlinks = r.data.size;
			} catch {
				// ignore
			}
			if (backlinks === 0) orphanNotes++;
			if (backlinks >= 5) highlyConnected++;
			linkedCounts.push({ path: f.path, backlinks });

			const daysSince = Math.floor((now - f.stat.mtime) / 86_400_000);
			if (daysSince > 90) staleNotes++;
			leastTouched.push({ path: f.path, daysSinceModified: daysSince });

			// Folder
			const folder = f.path.split("/").slice(0, -1).join("/") || "(raiz)";
			folderCount.set(folder, (folderCount.get(folder) ?? 0) + 1);
		}

		// Sort top 5
		linkedCounts.sort((a, b) => b.backlinks - a.backlinks);
		leastTouched.sort((a, b) => b.daysSinceModified - a.daysSinceModified);

		const folderDistribution = Array.from(folderCount.entries())
			.map(([folder, count]) => ({ folder, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 8);

		// KG growth
		const since30 = new Date(now - 30 * 86_400_000).toISOString();
		const kg = this.plugin.kg.data;

		return {
			totalNotes: allFiles.length,
			totalWords,
			avgWordsPerNote: allFiles.length > 0 ? Math.round(totalWords / allFiles.length) : 0,
			emptyNotes,
			stubNotes,
			orphanNotes,
			highlyConnected,
			staleNotes,
			mostLinkedNotes: linkedCounts.filter((l) => l.backlinks > 0).slice(0, 5),
			leastTouched: leastTouched.slice(0, 5),
			folderDistribution,
			clustersDisconnected: 0, // TODO: real graph clustering algo
			tagSparsity: { tagged, untagged: allFiles.length - tagged },
			kgGrowth: {
				people: {
					last30: kg.people.filter((p) => p.createdAt >= since30).length,
					total: kg.people.length,
				},
				themes: {
					last30: kg.themes.filter((t) => t.firstSeen >= since30).length,
					total: kg.themes.length,
				},
				sessions: {
					last30: kg.sessions.filter((s) => s.date >= since30.substring(0, 10)).length,
					total: kg.sessions.length,
				},
			},
		};
	}

	private renderOverview(m: HealthMetrics): void {
		const sec = this.section("📊 OVERVIEW");
		const grid = sec.createDiv();
		grid.style.display = "grid";
		grid.style.gridTemplateColumns = "repeat(4, 1fr)";
		grid.style.gap = "8px";

		this.statCard(grid, "Notas", String(m.totalNotes));
		this.statCard(grid, "Palavras", m.totalWords.toLocaleString("pt-BR"));
		this.statCard(grid, "Média/nota", String(m.avgWordsPerNote));
		this.statCard(grid, "Highly connected", String(m.highlyConnected), "var(--color-green)");
	}

	private renderHealthScore(m: HealthMetrics): void {
		const score = this.computeScore(m);
		const sec = this.section("💯 HEALTH SCORE");
		const wrap = sec.createDiv();
		wrap.style.padding = "12px";
		wrap.style.background = "var(--background-secondary)";
		wrap.style.borderRadius = "6px";
		wrap.style.textAlign = "center";

		const big = wrap.createEl("div", { text: `${score}/100` });
		big.style.fontSize = "32px";
		big.style.fontWeight = "bold";
		big.style.color = score >= 80 ? "#2e7d32" : score >= 60 ? "#f57c00" : "#c62828";

		const desc = wrap.createEl("div", { text: this.healthLabel(score) });
		desc.style.fontSize = "12px";
		desc.style.opacity = "0.7";
		desc.style.marginTop = "4px";
	}

	private renderProblems(m: HealthMetrics): void {
		const sec = this.section("⚠️ PROBLEMAS DETECTADOS");
		const issues: { label: string; count: number; severity: "high" | "med" | "low" }[] = [];
		if (m.emptyNotes > 0) issues.push({ label: "Notas vazias", count: m.emptyNotes, severity: "med" });
		if (m.stubNotes > 10) issues.push({ label: "Notas stub (<50 palavras)", count: m.stubNotes, severity: "low" });
		if (m.orphanNotes > 0)
			issues.push({
				label: "Notas órfãs (zero backlinks)",
				count: m.orphanNotes,
				severity: m.orphanNotes > m.totalNotes * 0.3 ? "high" : "med",
			});
		if (m.staleNotes > 0)
			issues.push({ label: "Notas stale (>90d sem mexer)", count: m.staleNotes, severity: "low" });

		if (issues.length === 0) {
			sec.createEl("div", { text: "🎉 Nenhum problema crítico." }).style.opacity = "0.7";
			return;
		}

		for (const it of issues) {
			const row = sec.createDiv();
			row.style.padding = "6px 8px";
			row.style.marginBottom = "4px";
			row.style.fontSize = "12px";
			row.style.borderLeft = `3px solid ${
				it.severity === "high"
					? "var(--color-red)"
					: it.severity === "med"
						? "var(--color-orange)"
						: "var(--text-muted)"
			}`;
			row.style.background = "var(--background-secondary)";
			row.setText(`${it.label}: ${it.count}`);
		}
	}

	private renderTopLists(m: HealthMetrics): void {
		const sec = this.section("🔝 TOP 5 NOTAS LINKADAS");
		if (m.mostLinkedNotes.length === 0) {
			sec.createEl("div", { text: "Nenhuma nota com backlinks ainda." }).style.opacity = "0.5";
		} else {
			const ul = sec.createEl("ul");
			ul.style.fontSize = "12px";
			ul.style.paddingLeft = "20px";
			for (const x of m.mostLinkedNotes) {
				const li = ul.createEl("li");
				li.style.cursor = "pointer";
				li.setText(`${x.path.split("/").pop()?.replace(/\.md$/, "")} (${x.backlinks} backlinks)`);
				li.addEventListener("click", () => this.openNote(x.path));
			}
		}
	}

	private renderKgGrowth(m: HealthMetrics): void {
		const sec = this.section("🌱 KNOWLEDGE GRAPH GROWTH");
		const grid = sec.createDiv();
		grid.style.display = "grid";
		grid.style.gridTemplateColumns = "1fr 1fr 1fr";
		grid.style.gap = "8px";

		const card = (label: string, total: number, last30: number) => {
			const c = grid.createDiv();
			c.style.padding = "10px";
			c.style.background = "var(--background-secondary)";
			c.style.borderRadius = "6px";
			c.style.textAlign = "center";
			const t = c.createEl("div", { text: String(total) });
			t.style.fontSize = "18px";
			t.style.fontWeight = "bold";
			const l = c.createEl("div", { text: label });
			l.style.fontSize = "10px";
			l.style.opacity = "0.6";
			const sub = c.createEl("div", { text: `+${last30} (30d)` });
			sub.style.fontSize = "10px";
			sub.style.color = "var(--color-green)";
			sub.style.marginTop = "2px";
		};

		card("Pessoas", m.kgGrowth.people.total, m.kgGrowth.people.last30);
		card("Temas", m.kgGrowth.themes.total, m.kgGrowth.themes.last30);
		card("Sessões", m.kgGrowth.sessions.total, m.kgGrowth.sessions.last30);
	}

	private renderFolders(m: HealthMetrics): void {
		const sec = this.section("📁 DISTRIBUIÇÃO POR PASTA");
		const max = Math.max(...m.folderDistribution.map((f) => f.count));
		for (const f of m.folderDistribution) {
			const row = sec.createDiv();
			row.style.display = "flex";
			row.style.alignItems = "center";
			row.style.gap = "8px";
			row.style.fontSize = "11px";
			row.style.marginBottom = "3px";

			const lbl = row.createEl("span", { text: f.folder.substring(0, 30) });
			lbl.style.minWidth = "200px";
			lbl.style.opacity = "0.8";

			const bar = row.createDiv();
			bar.style.flexGrow = "1";
			bar.style.height = "10px";
			bar.style.background = "var(--background-modifier-border)";
			bar.style.borderRadius = "2px";
			bar.style.position = "relative";

			const fill = bar.createDiv();
			fill.style.height = "100%";
			fill.style.width = `${(f.count / max) * 100}%`;
			fill.style.background = "var(--interactive-accent)";
			fill.style.borderRadius = "2px";

			const count = row.createEl("span", { text: String(f.count) });
			count.style.minWidth = "30px";
			count.style.textAlign = "right";
		}
	}

	private renderRecommendations(m: HealthMetrics): void {
		const sec = this.section("💡 RECOMENDAÇÕES");
		const recs: string[] = [];
		if (m.orphanNotes > m.totalNotes * 0.2) {
			recs.push(
				`📌 ${m.orphanNotes} notas órfãs (${Math.round((m.orphanNotes / m.totalNotes) * 100)}%) — use Smart Suggestions sidebar pra reduzir.`
			);
		}
		if (m.tagSparsity.untagged > m.totalNotes * 0.3) {
			recs.push(
				`🏷️ ${m.tagSparsity.untagged} notas sem tags. Habilite Auto-tagger no Settings.`
			);
		}
		if (m.staleNotes > m.totalNotes * 0.3) {
			recs.push(
				`📅 ${m.staleNotes} notas stale (>90d). Revise ou archive em 99_Archive.`
			);
		}
		if (m.kgGrowth.people.last30 === 0 && m.kgGrowth.people.total > 0) {
			recs.push("👥 KG não cresceu em 30d. Rode 'Atlas: Indexar vault'.");
		}
		if (recs.length === 0) {
			recs.push("🎉 Tudo no verde. Continue assim.");
		}
		for (const r of recs) {
			const row = sec.createDiv();
			row.style.padding = "8px";
			row.style.marginBottom = "4px";
			row.style.background = "var(--background-secondary)";
			row.style.borderRadius = "4px";
			row.style.fontSize = "12px";
			row.setText(r);
		}
	}

	private computeScore(m: HealthMetrics): number {
		if (m.totalNotes === 0) return 0;
		let score = 100;
		const orphanRatio = m.orphanNotes / m.totalNotes;
		const staleRatio = m.staleNotes / m.totalNotes;
		const stubRatio = m.stubNotes / m.totalNotes;
		const untaggedRatio = m.tagSparsity.untagged / m.totalNotes;
		score -= orphanRatio * 30;
		score -= staleRatio * 15;
		score -= stubRatio * 10;
		score -= untaggedRatio * 15;
		score -= (m.emptyNotes / Math.max(m.totalNotes, 1)) * 30;
		return Math.max(0, Math.min(100, Math.round(score)));
	}

	private healthLabel(score: number): string {
		if (score >= 90) return "🌟 Excelente — vault saudável e bem conectado";
		if (score >= 80) return "✅ Bom — pequenos ajustes melhoram";
		if (score >= 60) return "⚠️ Médio — atenção em órfãs / tags / stale";
		if (score >= 40) return "🔴 Atenção — vault precisa de cleanup";
		return "🚨 Crítico — comece pela auto-tagger e indexação";
	}

	private statCard(parent: HTMLElement, label: string, value: string, color = ""): void {
		const c = parent.createDiv();
		c.style.padding = "10px";
		c.style.background = "var(--background-secondary)";
		c.style.borderRadius = "6px";
		c.style.textAlign = "center";
		const v = c.createEl("div", { text: value });
		v.style.fontSize = "18px";
		v.style.fontWeight = "bold";
		if (color) v.style.color = color;
		const l = c.createEl("div", { text: label });
		l.style.fontSize = "10px";
		l.style.opacity = "0.6";
	}

	private section(title: string): HTMLDivElement {
		const wrap = this.container.createDiv();
		wrap.style.marginBottom = "16px";
		const h = wrap.createEl("h4", { text: title });
		h.style.fontSize = "11px";
		h.style.opacity = "0.7";
		h.style.letterSpacing = "0.5px";
		h.style.margin = "0 0 8px 0";
		const body = wrap.createDiv() as HTMLDivElement;
		return body;
	}

	private async openNote(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			await this.app.workspace.getLeaf().openFile(file);
		} else {
			new Notice(`Atlas: arquivo não encontrado: ${path}`);
		}
	}
}
