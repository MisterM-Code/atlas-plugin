/**
 * Atlas v0.13 — Wellbeing Detectors.
 *
 * 3 detectores proativos que monitoram saúde do trabalho:
 *
 * 1. **Burnout Detector** — analisa sentiment dos últimos 7 daily logs e alerta
 *    se houver 3+ dias consecutivos de mood baixo / fadiga / overwhelm.
 *
 * 2. **Capacity Overload Warning** — detecta pessoas alocadas em 3+ projetos
 *    simultâneos OU mencionadas em 10+ commitments abertos. Sugere conversa
 *    de capacity reset.
 *
 * 3. **Promise Tracker** — varre 1:1s e meetings recentes procurando frases
 *    "prometo X", "garanto", "100%", "vou fazer Y" e extrai como commitments
 *    formais (com confirmação UI).
 *
 * Todos rodam manualmente via Cmd+P ou via ProactiveDetector existente.
 */

import { App, Modal, Notice, TFile } from "obsidian";
import type AtlasPlugin from "../../main";
import { applyResponsiveModal } from "../ui/modal-helpers";
import { logger } from "../utils/logger";

// ──────────────────────────────────────────────────────────
// 1. Burnout Detector

const BURNOUT_KEYWORDS = [
	"cansado",
	"exausto",
	"esgotado",
	"sobrecarregado",
	"burnout",
	"overwhelm",
	"sem energia",
	"sem foco",
	"frustrad",
	"travado",
	"perdid",
	"ansios",
	"insônia",
	"insonia",
	"não consigo dormir",
	"acordei cansad",
	"sem motivação",
	"desanimad",
	"deprimid",
	"chateado",
	"estress",
];

interface BurnoutSignal {
	date: string;
	notePath: string;
	matchedKeywords: string[];
	excerpt: string;
}

export async function scanBurnoutSignals(plugin: AtlasPlugin, daysBack = 14): Promise<BurnoutSignal[]> {
	const folder = plugin.settings.folders.daily;
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - daysBack);

	const files = plugin.app.vault
		.getMarkdownFiles()
		.filter((f) => f.path.startsWith(folder) && f.stat.mtime >= cutoff.getTime());

	const signals: BurnoutSignal[] = [];
	for (const f of files) {
		const content = await plugin.app.vault.cachedRead(f);
		const lower = content.toLowerCase();
		const matched = BURNOUT_KEYWORDS.filter((kw) => lower.includes(kw));
		if (matched.length === 0) continue;

		const dateMatch = f.basename.match(/(\d{4}-\d{2}-\d{2})/);
		const date = dateMatch ? dateMatch[1] : f.basename;

		// Get first matching line as excerpt
		const lines = content.split("\n");
		const excerptLine =
			lines.find((l) => matched.some((kw) => l.toLowerCase().includes(kw))) ?? "";

		signals.push({
			date,
			notePath: f.path,
			matchedKeywords: matched.slice(0, 5),
			excerpt: excerptLine.trim().substring(0, 120),
		});
	}

	return signals.sort((a, b) => b.date.localeCompare(a.date));
}

export function consecutiveBurnoutDays(signals: BurnoutSignal[]): number {
	if (signals.length === 0) return 0;
	const dates = [...new Set(signals.map((s) => s.date))].sort().reverse();
	let consecutive = 1;
	for (let i = 1; i < dates.length; i++) {
		const a = new Date(dates[i - 1]);
		const b = new Date(dates[i]);
		const diff = Math.abs(a.getTime() - b.getTime()) / 86_400_000;
		if (diff <= 1.5) consecutive++;
		else break;
	}
	return consecutive;
}

export class BurnoutDetectorModal extends Modal {
	constructor(app: App, private readonly plugin: AtlasPlugin) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		applyResponsiveModal(contentEl, { preferredWidth: 640 });
		contentEl.addClass("atlas-burnout-modal");

		contentEl.createEl("h3", { cls: "atlas-burnout-title", text: "❤️ Burnout Detector" });
		contentEl.createEl("div", {
			cls: "atlas-burnout-subtitle",
			text: "Atlas analisa últimos 14 dias de daily logs procurando sinais de fadiga, overwhelm, ansiedade.",
		});

		const loading = contentEl.createDiv({ cls: "atlas-burnout-loading", text: "Scanning..." });
		const signals = await scanBurnoutSignals(this.plugin, 14);
		loading.remove();

		const consecutive = consecutiveBurnoutDays(signals);
		const totalDays = new Set(signals.map((s) => s.date)).size;

		// Verdict
		const verdict = contentEl.createDiv({ cls: "atlas-burnout-verdict" });
		if (signals.length === 0) {
			verdict.addClass("is-healthy");
			verdict.setText("✅ Nenhum sinal detectado. Você está em bom estado.");
		} else if (consecutive >= 3 || totalDays >= 5) {
			verdict.addClass("is-warning");
			verdict.createEl("strong", { text: "⚠️ ALERTA DE BURNOUT" });
			verdict.createEl("div", {
				text: `${consecutive} dia(s) consecutivos com sinais. ${totalDays} dias afetados nos últimos 14. Considere pausa de 1-2 dias e revisão de carga.`,
			});
		} else {
			verdict.addClass("is-mid");
			verdict.setText(
				`💛 ${signals.length} sinal(is) detectado(s) em ${totalDays} dias. Atenção mas sem alarme.`
			);
		}

		// Signals list
		if (signals.length > 0) {
			contentEl.createEl("h4", { cls: "atlas-burnout-section-title", text: "📅 Dias com sinais" });
			for (const s of signals.slice(0, 10)) {
				const card = contentEl.createDiv({ cls: "atlas-burnout-card" });
				card.createEl("div", {
					cls: "atlas-burnout-card-date",
					text: `📅 ${s.date}`,
				});
				const kwRow = card.createDiv({ cls: "atlas-burnout-card-kw" });
				for (const kw of s.matchedKeywords) {
					kwRow.createEl("span", { cls: "atlas-burnout-kw-chip", text: kw });
				}
				card.createEl("div", {
					cls: "atlas-burnout-card-excerpt",
					text: s.excerpt,
				});
				card.addEventListener("click", async () => {
					const f = this.plugin.app.vault.getAbstractFileByPath(s.notePath);
					if (f instanceof TFile) {
						await this.plugin.app.workspace.getLeaf(false).openFile(f);
						this.close();
					}
				});
			}
		}

		// Recommendations
		if (consecutive >= 3 || totalDays >= 5) {
			const recs = contentEl.createDiv({ cls: "atlas-burnout-recs" });
			recs.createEl("h4", { cls: "atlas-burnout-section-title", text: "💡 Recomendações" });
			const ul = recs.createEl("ul");
			[
				"Considere 1-2 dias de pausa real (off-grid)",
				"Identifique 1-2 commitments pra renegotiar prazo",
				"Conversa franca com manager: BICEPS framework (Lara Hogan)",
				"Evite reuniões não-essenciais essa semana",
				"Atividade física, mesmo 20 min/dia",
				"Sleep first: nada > 7h sono hoje",
			].forEach((r) => ul.createEl("li", { text: r }));
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

// ──────────────────────────────────────────────────────────
// 2. Capacity Overload Warning

interface OverloadedPerson {
	personId: string;
	personName: string;
	productCount: number;
	openCommitmentsCount: number;
	projectNames: string[];
	severity: "ok" | "watch" | "overload";
}

export function detectCapacityOverload(plugin: AtlasPlugin): OverloadedPerson[] {
	const kg = plugin.kg.data;
	const result: OverloadedPerson[] = [];

	for (const p of kg.people) {
		// Count products owned + product team mentions
		const owned = kg.products.filter((pr) => pr.ownerPersonId === p.id);
		const teamMember = 0; // KG schema doesn't have teamMemberIds on Product currently
		const productCount = owned.length + teamMember;

		// Open commitments to this person
		const openCommits = kg.commitments.filter(
			(c) => (c.madeBy === p.id || c.madeTo === p.id) && c.status === "open"
		).length;

		// Severity
		let severity: OverloadedPerson["severity"] = "ok";
		if (productCount >= 4 || openCommits >= 12) severity = "overload";
		else if (productCount >= 3 || openCommits >= 7) severity = "watch";

		if (severity !== "ok") {
			result.push({
				personId: p.id,
				personName: p.name,
				productCount,
				openCommitmentsCount: openCommits,
				projectNames: owned.map((pr) => pr.name),
				severity,
			});
		}
	}

	result.sort((a, b) => {
		const order = { overload: 0, watch: 1, ok: 2 };
		return order[a.severity] - order[b.severity];
	});

	return result;
}

export class CapacityOverloadModal extends Modal {
	constructor(app: App, private readonly plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		applyResponsiveModal(contentEl, { preferredWidth: 640 });
		contentEl.addClass("atlas-overload-modal");

		contentEl.createEl("h3", { cls: "atlas-overload-title", text: "⚖️ Capacity Overload Warning" });
		contentEl.createEl("div", {
			cls: "atlas-overload-subtitle",
			text: "Atlas detecta pessoas alocadas em 3+ produtos OU com 7+ commitments abertos. Sugere conversa de capacity reset.",
		});

		const overloaded = detectCapacityOverload(this.plugin);

		if (overloaded.length === 0) {
			contentEl.createDiv({
				cls: "atlas-overload-empty",
				text: "✅ Ninguém em sobrecarga detectada. Capacidade do time saudável.",
			});
			return;
		}

		for (const o of overloaded) {
			const card = contentEl.createDiv({
				cls: `atlas-overload-card is-${o.severity}`,
			});

			const header = card.createDiv({ cls: "atlas-overload-card-header" });
			header.createEl("span", {
				cls: "atlas-overload-card-emoji",
				text: o.severity === "overload" ? "🔴" : "🟡",
			});
			header.createEl("strong", { text: o.personName });
			header.createEl("span", {
				cls: "atlas-overload-card-severity",
				text: o.severity === "overload" ? " — SOBRECARGA" : " — atenção",
			});

			const meta = card.createDiv({ cls: "atlas-overload-card-meta" });
			meta.setText(
				`${o.productCount} produto(s) · ${o.openCommitmentsCount} commitment(s) aberto(s)`
			);

			if (o.projectNames.length > 0) {
				card.createEl("div", {
					cls: "atlas-overload-card-projects",
					text: "Em: " + o.projectNames.join(", "),
				});
			}

			const tip = card.createDiv({ cls: "atlas-overload-card-tip" });
			if (o.severity === "overload") {
				tip.setText(
					"💡 Conversa proposta: 'Seu nome aparece em N projetos. Vamos priorizar 1-2 essa semana?'"
				);
			} else {
				tip.setText("💡 Monitorar próxima semana. Se piorar, conversa de reset.");
			}
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

// ──────────────────────────────────────────────────────────
// 3. Promise Tracker

interface DetectedPromise {
	notePath: string;
	line: string;
	speakerHint: string;
	dateHint: string;
	promiseText: string;
}

const PROMISE_PATTERNS = [
	/(prometo|garanto|me comprometo|vou fazer|farei|irei|asseguro)\s+(.{10,150}?)(?=[.!?\n]|$)/gi,
	/(100%|com certeza|garantido|sem dúvida)\s+(.{10,150}?)(?=[.!?\n]|$)/gi,
];

export async function scanPromises(plugin: AtlasPlugin, daysBack = 30): Promise<DetectedPromise[]> {
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - daysBack);

	const files = plugin.app.vault.getMarkdownFiles().filter((f) => {
		if (f.stat.mtime < cutoff.getTime()) return false;
		// Focus on meeting/1on1 notes
		const cache = plugin.app.metadataCache.getFileCache(f);
		const type = cache?.frontmatter?.type as string | undefined;
		return type === "1on1" || type === "meeting" || type === "coaching";
	});

	const promises: DetectedPromise[] = [];
	for (const f of files) {
		const content = await plugin.app.vault.cachedRead(f);
		const cache = plugin.app.metadataCache.getFileCache(f);
		const dateHint = (cache?.frontmatter?.date as string) ?? f.basename;
		const personHint = (cache?.frontmatter?.person as string) ?? "—";

		for (const pattern of PROMISE_PATTERNS) {
			pattern.lastIndex = 0; // reset
			const lines = content.split("\n");
			for (const line of lines) {
				const matches = [...line.matchAll(pattern)];
				for (const m of matches) {
					const fullMatch = m[0].trim();
					if (fullMatch.length < 15 || fullMatch.length > 200) continue;
					promises.push({
						notePath: f.path,
						line: line.trim().substring(0, 200),
						speakerHint: personHint,
						dateHint,
						promiseText: fullMatch,
					});
				}
			}
		}
	}

	// Dedupe similar promises
	const seen = new Set<string>();
	return promises.filter((p) => {
		const key = `${p.notePath}:${p.promiseText.substring(0, 50)}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

export class PromiseTrackerModal extends Modal {
	constructor(app: App, private readonly plugin: AtlasPlugin) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		applyResponsiveModal(contentEl, { preferredWidth: 720 });
		contentEl.addClass("atlas-promise-modal");

		contentEl.createEl("h3", { cls: "atlas-promise-title", text: "🤝 Promise Tracker" });
		contentEl.createEl("div", {
			cls: "atlas-promise-subtitle",
			text: "Atlas escaneia 1:1s e meetings dos últimos 30 dias procurando promessas (prometo/garanto/100%) e oferece converter em commitments formais.",
		});

		const loading = contentEl.createDiv({ cls: "atlas-promise-loading", text: "Scanning..." });
		const promises = await scanPromises(this.plugin, 30);
		loading.remove();

		if (promises.length === 0) {
			contentEl.createDiv({
				cls: "atlas-promise-empty",
				text: "Nenhuma promessa detectada nos últimos 30 dias. Ou cadê os 1:1s? :)",
			});
			return;
		}

		contentEl.createEl("div", {
			cls: "atlas-promise-count",
			text: `${promises.length} promessa(s) detectada(s):`,
		});

		for (const p of promises.slice(0, 20)) {
			const card = contentEl.createDiv({ cls: "atlas-promise-card" });
			card.createEl("div", {
				cls: "atlas-promise-card-text",
				text: `"${p.promiseText}"`,
			});
			card.createEl("div", {
				cls: "atlas-promise-card-meta",
				text: `📅 ${p.dateHint} · 👤 ${p.speakerHint} · ${p.notePath.split("/").pop()}`,
			});

			const actions = card.createDiv({ cls: "atlas-promise-card-actions" });
			const convertBtn = actions.createEl("button", {
				cls: "atlas-promise-convert-btn mod-cta",
				text: "→ Commitment formal",
			});
			convertBtn.addEventListener("click", () => void this.convertToCommitment(p, card));

			const ignoreBtn = actions.createEl("button", {
				cls: "atlas-promise-ignore-btn",
				text: "Ignorar",
			});
			ignoreBtn.addEventListener("click", () => card.addClass("is-ignored"));
		}
	}

	private async convertToCommitment(p: DetectedPromise, card: HTMLElement): Promise<void> {
		try {
			// Find or create person from hint
			let personId: string | undefined;
			if (p.speakerHint && p.speakerHint !== "—") {
				const person = this.plugin.kg.findPersonByName(p.speakerHint);
				if (person) personId = person.id;
			}

			const commitId = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
			this.plugin.kg.upsertCommitment({
				id: commitId,
				text: p.promiseText.substring(0, 200),
				madeBy: personId ?? "eu",
				madeTo: "eu",
				status: "open",
				weight: "medium",
				sourceNotePath: p.notePath,
			});
			await this.plugin.kg.save();
			card.addClass("is-converted");
			new Notice(`Atlas: commitment criado em KG. Vai aparecer em Hub → Action Items.`);
		} catch (e) {
			logger.error("promise-tracker: convert failed", { error: String(e) });
			new Notice(`Atlas: erro — ${String(e)}`, 6000);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
