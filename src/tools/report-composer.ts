import { App, normalizePath, TFile } from "obsidian";
import type AtlasPlugin from "../../main";
import { Indexer } from "../retrieval/indexer";
import { MapReduceSummarizer } from "../summarizer/map-reduce";
import { isCoachPath } from "../coach/scope";
import { logger } from "../utils/logger";

/**
 * Atlas v0.5 Sprint 8 — Reports Composer.
 *
 * Compõe relatórios filtrando KG + notas por dimensões (período × pessoas × sistemas × temas × produtos).
 * Usa Map-Reduce LLM pra consolidar.
 */

export interface ReportSpec {
	id?: string;
	name?: string;
	period: { start: string; end: string }; // ISO date
	personIds: string[];
	systemIds: string[];
	themeIds: string[];
	productIds: string[];
	tags: string[]; // free-form tags
	output: "markdown" | "inline" | "email";
	template: "auto" | string;
	useLlm: boolean; // se false, gera só compilação estruturada (rápido)
}

export interface SavedView {
	id: string;
	name: string;
	spec: ReportSpec;
	cron?: string; // ex: "0 16 * * 5" (sexta 16h)
	createdAt: string;
	lastRunAt?: string;
}

export interface ReportResult {
	notePath: string;
	markdown: string;
	stats: {
		notesAnalyzed: number;
		sessionsAnalyzed: number;
		actionItemsAnalyzed: number;
		commitmentsAnalyzed: number;
		systemsTouched: string[];
	};
}

export class ReportComposer {
	constructor(private app: App, private plugin: AtlasPlugin) {}

	async compose(spec: ReportSpec): Promise<ReportResult> {
		const startMs = new Date(spec.period.start).getTime();
		const endMs = new Date(`${spec.period.end}T23:59:59`).getTime();
		const startIso = new Date(startMs).toISOString();
		const endIso = new Date(endMs).toISOString();

		// Coleta dados filtrados
		const kg = this.plugin.kg.data;

		// Sessions: filtro por pessoa + data
		const sessions = kg.sessions.filter((s) => {
			if (s.date < spec.period.start || s.date > spec.period.end) return false;
			if (isCoachPath(s.sourceNotePath)) return false;
			if (spec.personIds.length > 0) {
				const matchPerson =
					(s.personId && spec.personIds.includes(s.personId)) ||
					s.participantIds.some((id) => spec.personIds.includes(id));
				if (!matchPerson) return false;
			}
			return true;
		});

		// Action items
		const actionItems = kg.actionItems.filter((a) => {
			const aDate = a.completedDate ?? a.createdAt;
			if (aDate < startIso || aDate > endIso) return false;
			if (spec.personIds.length > 0 && a.ownerId && !spec.personIds.includes(a.ownerId)) return false;
			return true;
		});

		// Commitments
		const commitments = kg.commitments.filter((c) => {
			if (c.createdAt < startIso || c.createdAt > endIso) return false;
			if (spec.personIds.length > 0) {
				if (!spec.personIds.includes(c.madeBy) && !spec.personIds.includes(c.madeTo)) return false;
			}
			return true;
		});

		// Notes filter — por sistema, tag, produto
		const indexer = new Indexer(this.app);
		const allNotes = await indexer.indexVault();
		const matchingNotes = allNotes.filter((n) => {
			if (n.mtime < startMs || n.mtime > endMs) return false;
			if (isCoachPath(n.path)) return false;

			// Filter por sistema (frontmatter.systems contains any of spec systems)
			if (spec.systemIds.length > 0) {
				const fmSystems = n.frontmatter.systems;
				if (!Array.isArray(fmSystems)) return false;
				const sysNames = spec.systemIds
					.map((id) => kg.systems.find((s) => s.id === id)?.name)
					.filter(Boolean);
				if (!fmSystems.some((s) => sysNames.includes(String(s)))) return false;
			}

			// Filter por produto
			if (spec.productIds.length > 0) {
				const fmProducts = n.frontmatter.products;
				if (!Array.isArray(fmProducts)) return false;
				const prodNames = spec.productIds
					.map((id) => kg.products.find((p) => p.id === id)?.name)
					.filter(Boolean);
				if (!fmProducts.some((p) => prodNames.includes(String(p)))) return false;
			}

			// Filter por tag
			if (spec.tags.length > 0) {
				if (!spec.tags.some((t) => n.tags.includes(t.replace(/^#/, "")))) return false;
			}

			// Filter por tema
			if (spec.themeIds.length > 0) {
				const themeNames = spec.themeIds
					.map((id) => kg.themes.find((t) => t.id === id)?.name)
					.filter(Boolean);
				if (!themeNames.some((tn) => n.tags.some((nt) => nt.startsWith(`theme/${tn}`)))) {
					return false;
				}
			}

			return true;
		});

		// Stats
		const systemsTouched: string[] = [];
		for (const n of matchingNotes) {
			const fmSys = n.frontmatter.systems;
			if (Array.isArray(fmSys)) {
				for (const s of fmSys) {
					const str = String(s);
					if (!systemsTouched.includes(str)) systemsTouched.push(str);
				}
			}
		}

		// Build markdown
		let markdown: string;
		if (spec.useLlm && matchingNotes.length > 0) {
			markdown = await this.composeWithLlm(spec, matchingNotes, sessions, actionItems, commitments, systemsTouched);
		} else {
			markdown = this.composeStructured(spec, matchingNotes, sessions, actionItems, commitments, systemsTouched);
		}

		// Save note
		const reportName = spec.name ?? this.deriveName(spec);
		const date = new Date().toISOString().split("T")[0];
		const folder = `${this.plugin.settings.folders.reports}/composed`;
		if (!this.app.vault.getAbstractFileByPath(folder)) {
			await this.app.vault.createFolder(folder);
		}
		const path = normalizePath(`${folder}/${reportName}-${date}.md`);
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, markdown);
		} else {
			await this.app.vault.create(path, markdown);
		}

		await this.plugin.auditLog({
			action: "report.composed",
			spec_id: spec.id,
			notes: matchingNotes.length,
			path,
		});

		return {
			notePath: path,
			markdown,
			stats: {
				notesAnalyzed: matchingNotes.length,
				sessionsAnalyzed: sessions.length,
				actionItemsAnalyzed: actionItems.length,
				commitmentsAnalyzed: commitments.length,
				systemsTouched,
			},
		};
	}

	private deriveName(spec: ReportSpec): string {
		const parts: string[] = ["Report"];
		const days = Math.round(
			(new Date(spec.period.end).getTime() - new Date(spec.period.start).getTime()) /
				86_400_000
		);
		parts.push(`${days}d`);
		if (spec.systemIds.length > 0) {
			const names = spec.systemIds
				.map((id) => this.plugin.kg.data.systems.find((s) => s.id === id)?.name)
				.filter(Boolean);
			parts.push(names.slice(0, 2).join("-"));
		}
		if (spec.personIds.length > 0) {
			const names = spec.personIds
				.map((id) => this.plugin.kg.data.people.find((p) => p.id === id)?.name)
				.filter(Boolean);
			parts.push(names.slice(0, 2).join("-"));
		}
		return parts.join("-").replace(/[^a-zA-Z0-9-_]/g, "");
	}

	private composeStructured(
		spec: ReportSpec,
		notes: import("../retrieval/indexer").IndexedNote[],
		sessions: typeof this.plugin.kg.data.sessions,
		actions: typeof this.plugin.kg.data.actionItems,
		commitments: typeof this.plugin.kg.data.commitments,
		systemsTouched: string[]
	): string {
		const kg = this.plugin.kg.data;
		const personNames = spec.personIds
			.map((id) => kg.people.find((p) => p.id === id)?.name)
			.filter(Boolean);
		const systemNames = spec.systemIds
			.map((id) => kg.systems.find((s) => s.id === id)?.name)
			.filter(Boolean);

		const lines: string[] = [];
		lines.push(`---`);
		lines.push(`type: composed-report`);
		lines.push(`period_start: ${spec.period.start}`);
		lines.push(`period_end: ${spec.period.end}`);
		lines.push(`generated_at: ${new Date().toISOString()}`);
		lines.push(`generated_by: atlas`);
		if (spec.id) lines.push(`spec_id: ${spec.id}`);
		lines.push(`---`);
		lines.push("");
		lines.push(`# 📊 ${spec.name ?? "Relatório composto"}`);
		lines.push("");
		lines.push(`> **Período:** ${spec.period.start} → ${spec.period.end}`);

		// Filtros aplicados
		const filters: string[] = [];
		if (personNames.length > 0) filters.push(`👤 Pessoas: ${personNames.join(", ")}`);
		if (systemNames.length > 0) filters.push(`🖥️ Sistemas: ${systemNames.join(", ")}`);
		if (spec.tags.length > 0) filters.push(`🏷️ Tags: ${spec.tags.join(", ")}`);
		if (filters.length > 0) {
			lines.push(`> **Filtros:** ${filters.join(" · ")}`);
		}
		lines.push("");

		// Stats
		lines.push("## 📊 Sumário");
		lines.push(`- ${notes.length} notas analisadas`);
		lines.push(`- ${sessions.length} sessões`);
		lines.push(`- ${actions.length} action items`);
		lines.push(`- ${commitments.length} commitments`);
		if (systemsTouched.length > 0) {
			lines.push(`- ${systemsTouched.length} sistemas tocados: ${systemsTouched.join(", ")}`);
		}
		lines.push("");

		// Sessions
		if (sessions.length > 0) {
			lines.push("## 🤝 Sessões no período");
			for (const s of sessions) {
				const person = kg.people.find((p) => p.id === s.personId);
				lines.push(
					`- **${s.date}** · ${s.type} · ${person?.name ?? "—"} · [[${s.sourceNotePath.replace(/\.md$/, "")}]]`
				);
			}
			lines.push("");
		}

		// Action items
		if (actions.length > 0) {
			lines.push("## ✅ Action Items");
			const open = actions.filter((a) => a.status !== "completed" && a.status !== "cancelled");
			const done = actions.filter((a) => a.status === "completed");
			if (done.length > 0) {
				lines.push(`### Concluídas (${done.length})`);
				for (const a of done) lines.push(`- ✅ ${a.description}`);
			}
			if (open.length > 0) {
				lines.push(`### Abertas (${open.length})`);
				for (const a of open) lines.push(`- [ ] ${a.description}${a.dueDate ? ` (@${a.dueDate})` : ""}`);
			}
			lines.push("");
		}

		// Commitments
		if (commitments.length > 0) {
			lines.push("## 🔁 Commitments");
			for (const c of commitments) {
				lines.push(`- "${c.text}" · ${c.status}`);
			}
			lines.push("");
		}

		// Notas relacionadas
		if (notes.length > 0) {
			lines.push("## 📝 Notas");
			const recent = notes
				.sort((a, b) => b.mtime - a.mtime)
				.slice(0, 30);
			for (const n of recent) {
				const date = new Date(n.mtime).toISOString().substring(0, 10);
				lines.push(`- **${date}** · [[${n.path.replace(/\.md$/, "")}]]`);
			}
			if (notes.length > 30) {
				lines.push(`- _… e mais ${notes.length - 30} notas_`);
			}
			lines.push("");
		}

		lines.push("---");
		lines.push("");
		lines.push(`_Gerado por Atlas Reports Composer · ${new Date().toLocaleDateString("pt-BR")}_`);

		return lines.join("\n");
	}

	private async composeWithLlm(
		spec: ReportSpec,
		notes: import("../retrieval/indexer").IndexedNote[],
		sessions: typeof this.plugin.kg.data.sessions,
		actions: typeof this.plugin.kg.data.actionItems,
		commitments: typeof this.plugin.kg.data.commitments,
		systemsTouched: string[]
	): Promise<string> {
		// Skeleton estruturado primeiro
		const baseMarkdown = this.composeStructured(spec, notes, sessions, actions, commitments, systemsTouched);

		// Tenta enriquecer com LLM se Ollama disponível
		try {
			const ok = await this.plugin.ollama.ping();
			if (!ok) return baseMarkdown;

			const mr = new MapReduceSummarizer(this.plugin.ollama);
			// v0.23: wire LLMService — cloud preferred for long doc summarization
			if (this.plugin.llm) mr.setLLMService(this.plugin.llm);
			const chunks = notes
				.slice(0, 30)
				.map((n) => `Path: ${n.path}\n\n${n.body.substring(0, 1500)}`);

			if (chunks.length === 0) return baseMarkdown;

			const personNames = spec.personIds
				.map((id) => this.plugin.kg.data.people.find((p) => p.id === id)?.name)
				.filter(Boolean);
			const systemNames = spec.systemIds
				.map((id) => this.plugin.kg.data.systems.find((s) => s.id === id)?.name)
				.filter(Boolean);

			const aiSection = await mr.run(chunks, {
				model: this.plugin.settings.ollama.generationModel,
				mapPrompt: (chunk) =>
					`Resuma esta nota em 2-3 bullets focando em: decisões, bloqueios, ações${
						systemNames.length > 0 ? `, eventos relacionados aos sistemas ${systemNames.join("/")}` : ""
					}${personNames.length > 0 ? `, menções a ${personNames.join("/")}` : ""}. PT-BR factual.

${chunk}

Resumo:`,
				reducePrompt: (summaries) =>
					`Você é Atlas Reports Composer. Consolide ${summaries.length} resumos no período ${spec.period.start} → ${spec.period.end}.

${personNames.length > 0 ? `Pessoas em foco: ${personNames.join(", ")}` : ""}
${systemNames.length > 0 ? `Sistemas em foco: ${systemNames.join(", ")}` : ""}

Estrutura (PT-BR, executivo, factual):

## 🟢 Highlights (3 bullets)
[principais realizações]

## 🔴 Lowlights / desafios
[o que não foi tão bem]

## 🎯 Conclusões / próximos passos
[3 pontos acionáveis]

Resumos:
${summaries.map((s, i) => `--- ${i + 1} ---\n${s}`).join("\n\n")}

Status report:`,
				mapTemperature: 0.2,
				reduceTemperature: 0.4,
				maxTokensMap: 250,
				maxTokensReduce: 1500,
			});

			// Inserir seção AI antes do "## 📊 Sumário"
			const insertIdx = baseMarkdown.indexOf("## 📊 Sumário");
			if (insertIdx < 0) return baseMarkdown + "\n\n## 🤖 Síntese (Atlas IA)\n\n" + aiSection;
			return (
				baseMarkdown.substring(0, insertIdx) +
				`## 🤖 Síntese (Atlas IA)\n\n${aiSection}\n\n` +
				baseMarkdown.substring(insertIdx)
			);
		} catch (e) {
			logger.warn("report-composer: LLM falhou, retornando estruturado", { error: String(e) });
			return baseMarkdown;
		}
	}
}

// ──────────────────────────────────────────────────────────────────
// Saved Views storage

const SAVED_VIEWS_KEY = "atlas-saved-views";

export class SavedViewsStore {
	private views: SavedView[] = [];

	constructor(private plugin: AtlasPlugin) {
		this.load();
	}

	private load(): void {
		try {
			const raw = window.localStorage.getItem(SAVED_VIEWS_KEY);
			if (raw) this.views = JSON.parse(raw);
		} catch {
			this.views = [];
		}
	}

	private save(): void {
		try {
			window.localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(this.views));
		} catch {
			// noop
		}
	}

	list(): SavedView[] {
		return [...this.views];
	}

	add(view: Omit<SavedView, "id" | "createdAt">): SavedView {
		const id = `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
		const v: SavedView = { ...view, id, createdAt: new Date().toISOString() };
		this.views.push(v);
		this.save();
		return v;
	}

	update(id: string, patch: Partial<SavedView>): SavedView | null {
		const v = this.views.find((x) => x.id === id);
		if (!v) return null;
		Object.assign(v, patch);
		this.save();
		return v;
	}

	delete(id: string): boolean {
		const idx = this.views.findIndex((v) => v.id === id);
		if (idx < 0) return false;
		this.views.splice(idx, 1);
		this.save();
		return true;
	}

	get(id: string): SavedView | undefined {
		return this.views.find((v) => v.id === id);
	}
}
