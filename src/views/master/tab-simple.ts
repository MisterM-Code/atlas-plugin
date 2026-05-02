import { TFile, MarkdownView, Editor, Notice } from "obsidian";
import type AtlasPlugin from "../../../main";
import { HealthCheck } from "../../automation/health-check";

/**
 * Tab Suggestions — versão inline simplificada.
 */
export async function renderSuggestionsTab(container: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	container.empty();
	container.createEl("h3", { text: "🔗 Smart Suggestions" }).style.margin = "0 0 4px 0";

	const desc = container.createEl("div", {
		text: "Atlas sugere [[pessoas]], #temas, [[projetos]] do KG relevantes ao bloco onde seu cursor está.",
	});
	desc.style.fontSize = "11px";
	desc.style.opacity = "0.6";
	desc.style.marginBottom = "10px";

	const status = container.createEl("div");
	status.style.fontSize = "10px";
	status.style.opacity = "0.5";
	status.style.marginBottom = "8px";

	const list = container.createDiv();
	list.style.maxHeight = "calc(100vh - 280px)";
	list.style.overflowY = "auto";

	const update = () => {
		list.empty();
		const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
		const editor: Editor | undefined = view?.editor;

		if (!editor) {
			status.setText("Abra uma nota para ver sugestões.");
			return;
		}

		const cur = editor.getCursor();
		const lineCount = editor.lineCount();
		let start = cur.line;
		while (start > 0 && editor.getLine(start - 1).trim() !== "") start--;
		let end = cur.line;
		while (end < lineCount - 1 && editor.getLine(end + 1).trim() !== "") end++;
		const lines: string[] = [];
		for (let i = start; i <= end; i++) lines.push(editor.getLine(i));
		const text = lines.join("\n").trim();

		if (!text || text.length < 20) {
			status.setText("Cursor sem contexto suficiente.");
			return;
		}

		status.setText(`Análise: ${text.length} chars`);

		const candidates = computeCandidates(text, plugin);
		if (candidates.length === 0) {
			list.createEl("div", { text: "Nada relevante no KG. Indexe vault." }).style.opacity = "0.5";
			return;
		}

		for (const s of candidates.slice(0, 12)) {
			const card = list.createDiv();
			card.style.padding = "6px 8px";
			card.style.marginBottom = "4px";
			card.style.background = "var(--background-secondary)";
			card.style.borderRadius = "4px";
			card.style.cursor = "pointer";
			card.style.display = "flex";
			card.style.alignItems = "flex-start";
			card.style.gap = "8px";

			const icon = card.createEl("span", { text: s.icon });
			icon.style.fontSize = "14px";

			const w = card.createDiv();
			w.style.flexGrow = "1";
			const lbl = w.createEl("div", { text: s.label });
			lbl.style.fontSize = "12px";
			lbl.style.fontWeight = "bold";
			const sub = w.createEl("div", { text: s.subtitle });
			sub.style.fontSize = "10px";
			sub.style.opacity = "0.6";

			const insertBtn = card.createEl("button", { text: "+" });
			insertBtn.style.fontSize = "12px";
			insertBtn.style.padding = "2px 8px";
			insertBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				const cur2 = editor.getCursor();
				const lineText = editor.getLine(cur2.line);
				const prevChar = cur2.ch > 0 ? lineText[cur2.ch - 1] : "";
				const prefix = prevChar && !/\s/.test(prevChar) ? " " : "";
				editor.replaceRange(prefix + s.insertText + " ", cur2);
				new Notice(`Atlas: inserido ${s.insertText}`);
			});
		}
	};

	plugin.registerEvent(plugin.app.workspace.on("editor-change", () => update()));
	plugin.registerEvent(plugin.app.workspace.on("active-leaf-change", () => update()));
	update();
}

interface SuggestCandidate {
	icon: string;
	label: string;
	subtitle: string;
	insertText: string;
	score: number;
}

function computeCandidates(text: string, plugin: AtlasPlugin): SuggestCandidate[] {
	const out: SuggestCandidate[] = [];
	const lower = text.toLowerCase();
	const linked = new Set<string>();
	let m: RegExpExecArray | null;
	const wikilinkRe = /\[\[([^\]|#]+)/g;
	while ((m = wikilinkRe.exec(text)) !== null) linked.add(m[1].trim().toLowerCase());

	for (const p of plugin.kg.listPeople()) {
		if (linked.has(p.name.toLowerCase())) continue;
		const nameLower = p.name.toLowerCase();
		let score = 0;
		if (lower.includes(nameLower)) score += 80;
		const firstName = p.name.split(/\s+/)[0]?.toLowerCase();
		if (firstName && firstName.length > 3 && lower.includes(firstName)) score += 40;
		for (const a of p.aliases) {
			if (lower.includes(a.toLowerCase())) score += 60;
		}
		if (score > 0) {
			out.push({
				icon: "👤",
				label: p.name,
				subtitle: [p.role, p.type].filter(Boolean).join(" · ") || "Pessoa",
				insertText: `[[${p.name}]]`,
				score,
			});
		}
	}

	const tokens = lower
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.split(/\s+/)
		.filter((t) => t.length > 2);

	for (const t of plugin.kg.data.themes) {
		if (linked.has(t.name.toLowerCase())) continue;
		const nameTokens = t.name.split(/[-_]/).filter((s) => s.length > 2);
		let score = 0;
		for (const nt of nameTokens) {
			if (tokens.includes(nt.toLowerCase())) score += 30;
		}
		if (score > 0) {
			out.push({
				icon: "🏷️",
				label: `#theme/${t.name}`,
				subtitle: `${t.frequency}× · ${t.sentiment}`,
				insertText: `#theme/${t.name}`,
				score: score + Math.min(t.frequency / 5, 5),
			});
		}
	}

	return out.sort((a, b) => b.score - a.score);
}

/**
 * Tab Health — render simplificado do workspace health.
 */
export async function renderHealthTab(container: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	container.empty();

	const header = container.createDiv();
	header.style.display = "flex";
	header.style.justifyContent = "space-between";
	header.style.alignItems = "center";
	header.style.marginBottom = "12px";
	header.createEl("h3", { text: "🩺 Workspace Health" }).style.margin = "0";

	const refresh = header.createEl("button", { text: "↻" });
	refresh.style.fontSize = "11px";

	const body = container.createDiv();
	body.style.maxHeight = "calc(100vh - 240px)";
	body.style.overflowY = "auto";

	const compute = async () => {
		body.empty();
		const loading = body.createEl("div", { text: "Calculando..." });
		loading.style.opacity = "0.6";

		const allFiles = plugin.app.vault.getMarkdownFiles().filter(
			(f) => !f.path.startsWith(".atlas") && !f.path.startsWith(plugin.app.vault.configDir)
		);
		const now = Date.now();
		const ninetyDaysAgo = now - 90 * 86_400_000;

		let totalWords = 0;
		let emptyNotes = 0;
		let stubNotes = 0;
		let orphanNotes = 0;
		let staleNotes = 0;
		let tagged = 0;

		const cache = plugin.app.metadataCache as unknown as {
			getBacklinksForFile?: (file: TFile) => { data: Map<string, unknown> };
		};

		for (const f of allFiles) {
			let raw = "";
			try {
				raw = await plugin.app.vault.read(f);
			} catch {
				continue;
			}
			const wc = raw.split(/\s+/).filter(Boolean).length;
			totalWords += wc;
			if (wc < 10) {
				emptyNotes++;
				continue;
			}
			if (wc < 50) stubNotes++;

			const meta = plugin.app.metadataCache.getFileCache(f);
			if (
				(Array.isArray(meta?.frontmatter?.tags) && meta.frontmatter.tags.length > 0) ||
				/#[a-zA-Z]/.test(raw)
			) {
				tagged++;
			}

			let bl = 0;
			try {
				const r = cache.getBacklinksForFile?.(f);
				if (r?.data) bl = r.data.size;
			} catch {
				// ignore
			}
			if (bl === 0) orphanNotes++;
			if (f.stat.mtime < ninetyDaysAgo) staleNotes++;
		}

		body.empty();

		// Health score
		const total = allFiles.length;
		let score = 100;
		score -= (orphanNotes / Math.max(total, 1)) * 30;
		score -= (staleNotes / Math.max(total, 1)) * 15;
		score -= (stubNotes / Math.max(total, 1)) * 10;
		score -= (emptyNotes / Math.max(total, 1)) * 30;
		score = Math.max(0, Math.min(100, Math.round(score)));

		const scoreCard = body.createDiv();
		scoreCard.style.padding = "16px";
		scoreCard.style.background = "var(--background-secondary)";
		scoreCard.style.borderRadius = "6px";
		scoreCard.style.textAlign = "center";
		scoreCard.style.marginBottom = "12px";
		const scoreNum = scoreCard.createEl("div", { text: `${score}/100` });
		scoreNum.style.fontSize = "32px";
		scoreNum.style.fontWeight = "bold";
		scoreNum.style.color =
			score >= 80 ? "#2e7d32" : score >= 60 ? "#f57c00" : "#c62828";
		const scoreLabel = scoreCard.createEl("div");
		scoreLabel.style.fontSize = "12px";
		scoreLabel.style.opacity = "0.7";
		scoreLabel.setText(
			score >= 90
				? "🌟 Excelente"
				: score >= 80
					? "✅ Bom"
					: score >= 60
						? "⚠️ Médio"
						: "🔴 Atenção"
		);

		// Stats grid
		const grid = body.createDiv();
		grid.style.display = "grid";
		grid.style.gridTemplateColumns = "1fr 1fr";
		grid.style.gap = "6px";
		grid.style.marginBottom = "12px";

		stat(grid, "Notas", String(total));
		stat(grid, "Palavras", totalWords.toLocaleString("pt-BR"));
		stat(grid, "Órfãs", String(orphanNotes), orphanNotes > total * 0.3 ? "var(--color-red)" : undefined);
		stat(grid, "Stale (>90d)", String(staleNotes));
		stat(grid, "Stub (<50w)", String(stubNotes));
		stat(grid, "Sem tags", String(total - tagged));
	};

	refresh.addEventListener("click", () => void compute());
	await compute();
}

function stat(parent: HTMLElement, label: string, value: string, color?: string): void {
	const c = parent.createDiv();
	c.style.padding = "8px";
	c.style.background = "var(--background-secondary)";
	c.style.borderRadius = "4px";
	c.style.textAlign = "center";
	const v = c.createEl("div", { text: value });
	v.style.fontSize = "16px";
	v.style.fontWeight = "bold";
	if (color) v.style.color = color;
	const l = c.createEl("div", { text: label });
	l.style.fontSize = "10px";
	l.style.opacity = "0.6";
}

/**
 * Tab Status — diagnóstico Ollama + RAM (simplificado).
 */
export async function renderStatusTab(container: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	container.empty();

	const header = container.createDiv();
	header.style.marginBottom = "8px";
	header.createEl("h3", { text: "⚙️ Atlas Status" }).style.margin = "0";

	const { renderSubTabBar } = await import("../../ui/sub-tab-bar");
	const { renderModelCatalogSub } = await import("./status-sub/model-catalog");

	renderSubTabBar(
		container,
		[
			{
				id: "diagnostics",
				icon: "🩺",
				label: "Diagnóstico",
				description: "Ollama daemon, RAM, modelos instalados",
				render: (c) => renderDiagnosticsSub(c, plugin),
			},
			{
				id: "catalog",
				icon: "📦",
				label: "Catálogo",
				description: "12+ modelos curados — pull com 1 click, recomendação por RAM",
				render: (c) => renderModelCatalogSub(c, plugin),
			},
		],
		{ storageKey: "atlas-status-subtab", defaultId: "diagnostics" }
	);
}

async function renderDiagnosticsSub(container: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	container.empty();

	const refreshBar = container.createDiv();
	refreshBar.style.display = "flex";
	refreshBar.style.justifyContent = "flex-end";
	refreshBar.style.marginBottom = "8px";
	const refresh = refreshBar.createEl("button", { text: "↻ Re-verificar" });
	refresh.style.fontSize = "11px";

	const body = container.createDiv();

	const update = async () => {
		body.empty();
		const loading = body.createEl("div", { text: "Verificando..." });
		loading.style.opacity = "0.6";

		const hc = new HealthCheck(plugin.ollama);
		const h = await hc.run(plugin.settings.ollama.generationModel);

		body.empty();

		// Ollama status
		const ollama = body.createDiv();
		ollama.style.padding = "10px";
		ollama.style.background = "var(--background-secondary)";
		ollama.style.borderRadius = "4px";
		ollama.style.marginBottom = "8px";
		const oTitle = ollama.createEl("div");
		oTitle.style.fontWeight = "bold";
		oTitle.setText(
			h.ollamaUp
				? `🟢 Ollama UP (ping ${h.pingMs}ms)`
				: "🔴 Ollama OFFLINE"
		);
		if (!h.ollamaUp) {
			ollama.createEl("div", {
				text: "Inicie o app Ollama. Click ↻ para verificar.",
			}).style.fontSize = "11px";
		}

		// RAM
		const ram = body.createDiv();
		ram.style.padding = "10px";
		ram.style.background = "var(--background-secondary)";
		ram.style.borderRadius = "4px";
		ram.style.marginBottom = "8px";
		const usedPct = Math.round((h.usedRamGB / h.totalRamGB) * 100);
		ram.createEl("div", {
			text: `💾 ${h.totalRamGB} GB total · ${h.usedRamGB} GB usada · ${h.freeRamGB} GB livre`,
		}).style.fontSize = "12px";
		const bar = ram.createDiv();
		bar.style.height = "6px";
		bar.style.background = "var(--background-modifier-border)";
		bar.style.borderRadius = "3px";
		bar.style.marginTop = "4px";
		const fill = bar.createDiv();
		fill.style.height = "100%";
		fill.style.width = `${usedPct}%`;
		fill.style.background =
			usedPct > 85 ? "var(--color-red)" : usedPct > 65 ? "var(--color-orange)" : "var(--color-green)";

		// Models
		const modelsSection = body.createDiv();
		modelsSection.style.marginBottom = "8px";
		const mTitle = modelsSection.createEl("div", { text: "🤖 Modelos" });
		mTitle.style.fontSize = "11px";
		mTitle.style.fontWeight = "bold";
		mTitle.style.opacity = "0.7";
		mTitle.style.marginBottom = "4px";

		if (h.models.length === 0) {
			modelsSection.createEl("div", { text: "(nenhum modelo encontrado)" }).style.opacity = "0.6";
		} else {
			for (const m of h.models) {
				const fits = m.estimatedRamGB <= h.freeRamGB;
				const isConfigured = m.name === h.configuredModel;
				const row = modelsSection.createDiv();
				row.style.padding = "6px 8px";
				row.style.background = "var(--background-secondary)";
				row.style.borderRadius = "4px";
				row.style.marginBottom = "3px";
				row.style.fontSize = "11px";
				const nameEl = row.createEl("div", {
					text: `${isConfigured ? "⭐ " : ""}${m.name}`,
				});
				nameEl.style.fontWeight = isConfigured ? "bold" : "normal";
				const meta = row.createEl("div");
				meta.style.fontSize = "10px";
				meta.style.opacity = "0.7";
				meta.setText(
					`~${m.estimatedRamGB} GB · ${fits ? "✅ cabe" : "⚠️ pode dar OOM"}`
				);
			}
		}

		// Recommendations
		if (h.recommendations.length > 0) {
			const recsTitle = body.createEl("div", { text: "⚠️ Recomendações" });
			recsTitle.style.fontSize = "11px";
			recsTitle.style.fontWeight = "bold";
			recsTitle.style.opacity = "0.7";
			recsTitle.style.marginTop = "8px";
			recsTitle.style.marginBottom = "4px";
			for (const r of h.recommendations) {
				const row = body.createDiv();
				row.style.padding = "6px 8px";
				row.style.marginBottom = "3px";
				row.style.background = "var(--background-secondary-alt)";
				row.style.borderLeft = "3px solid var(--color-orange)";
				row.style.fontSize = "11px";
				row.setText(r);
			}
		}

		// Action buttons
		const actions = body.createDiv();
		actions.style.display = "grid";
		actions.style.gridTemplateColumns = "1fr 1fr";
		actions.style.gap = "6px";
		actions.style.marginTop = "10px";

		const btn = (label: string, cmd: string) => {
			const b = actions.createEl("button", { text: label });
			b.style.padding = "6px";
			b.style.fontSize = "11px";
			b.addEventListener("click", () => {
				const apiAny = plugin.app as unknown as {
					commands?: { executeCommandById?: (id: string) => void };
				};
				apiAny.commands?.executeCommandById?.(`atlas:${cmd}`);
			});
		};

		btn("📥 Pull modelo recomendado", "pull-recommended-model");
		btn("🔄 Como reiniciar Ollama", "restart-ollama");
	};

	refresh.addEventListener("click", () => void update());
	await update();
}
