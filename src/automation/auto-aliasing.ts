import { App, Modal, Notice, Setting } from "obsidian";
import { KGStore } from "../kg/store";
import { PersonT, slugify } from "../kg/schemas";
import { Embedder, cosineSimilarity } from "../retrieval/embedder";
import { logger } from "../utils/logger";
import { applyResponsiveModal } from "../ui/modal-helpers";

export interface AliasCandidate {
	primary: PersonT;
	alias: PersonT;
	confidence: number;
	reasons: string[];
}

const HIGH_CONFIDENCE = 0.85;
const MIN_CONFIDENCE = 0.55;

/**
 * Detecta candidatos a fusão (alias) entre pessoas no KG.
 * Combina:
 *   - Similarity de nome (Levenshtein-like + token overlap)
 *   - Initials match
 *   - Embedding similarity dos nomes
 *
 * Sempre PEDE confirmação. Nunca funde sozinho.
 */
export class AutoAliaser {
	constructor(
		private app: App,
		private kg: KGStore,
		private embedder: Embedder,
		private model: string
	) {}

	/** Scan todo o KG e retorna candidatos a fusão. */
	async findCandidates(): Promise<AliasCandidate[]> {
		const people = this.kg.listPeople();
		const candidates: AliasCandidate[] = [];

		for (let i = 0; i < people.length; i++) {
			for (let j = i + 1; j < people.length; j++) {
				const a = people[i];
				const b = people[j];

				// Skip if explicit alias already
				if (a.aliases.includes(b.name) || b.aliases.includes(a.name)) continue;

				const reasons: string[] = [];
				let score = 0;

				// 1. Initials match
				const aInit = initials(a.name);
				const bInit = initials(b.name);
				const aIsInit = a.name.length <= 3 && a.name.toUpperCase() === a.name;
				const bIsInit = b.name.length <= 3 && b.name.toUpperCase() === b.name;
				if (aIsInit && bInit.startsWith(a.name.toLowerCase())) {
					score += 0.4;
					reasons.push(`"${a.name}" combina com iniciais de "${b.name}"`);
				}
				if (bIsInit && aInit.startsWith(b.name.toLowerCase())) {
					score += 0.4;
					reasons.push(`"${b.name}" combina com iniciais de "${a.name}"`);
				}

				// 2. First-name same + truncations ("João S." vs "João Silva")
				const aFirst = firstName(a.name);
				const bFirst = firstName(b.name);
				if (aFirst && aFirst === bFirst && aFirst.length > 3) {
					score += 0.3;
					reasons.push(`Mesmo primeiro nome "${aFirst}"`);
				}

				// 3. Levenshtein < 2 char of difference (typos like "Jão" vs "João")
				const lev = levenshtein(
					normalize(a.name),
					normalize(b.name)
				);
				if (lev > 0 && lev <= 2) {
					score += 0.5;
					reasons.push(`Diferença ortográfica pequena (${lev} chars)`);
				}

				// 4. One contains the other
				const an = normalize(a.name);
				const bn = normalize(b.name);
				if (an.length > 3 && bn.length > 3) {
					if (an.includes(bn) || bn.includes(an)) {
						score += 0.35;
						reasons.push(`Um nome contém o outro`);
					}
				}

				// 5. Same role/team if available (further evidence)
				if (a.role && b.role && a.role === b.role) {
					score += 0.1;
					reasons.push(`Mesmo cargo: ${a.role}`);
				}

				if (score < MIN_CONFIDENCE) continue;

				candidates.push({
					primary: countSessions(a, this.kg) >= countSessions(b, this.kg) ? a : b,
					alias: countSessions(a, this.kg) >= countSessions(b, this.kg) ? b : a,
					confidence: Math.min(1, score),
					reasons,
				});
			}
		}

		// Optional: enrich with embedding similarity (if embedder available + Ollama)
		try {
			await this.enrichWithEmbeddings(candidates);
		} catch (e) {
			logger.debug("auto-aliasing: enrich embeddings skipped", { error: String(e) });
		}

		return candidates.sort((a, b) => b.confidence - a.confidence);
	}

	private async enrichWithEmbeddings(candidates: AliasCandidate[]): Promise<void> {
		// Limit to top 30 by initial score to keep cost low
		const top = candidates.slice(0, 30);
		const names = new Set<string>();
		for (const c of top) {
			names.add(c.primary.name);
			names.add(c.alias.name);
		}
		const nameList = Array.from(names);
		if (nameList.length === 0) return;

		const vectors = new Map<string, number[]>();
		// Use embedder's underlying ollama client
		const ollama = (this.embedder as unknown as { ollama: { embed: (s: string, m: string) => Promise<number[][]> } }).ollama;
		for (const n of nameList) {
			try {
				const r = await ollama.embed(`Pessoa: ${n}`, this.model);
				if (r[0] && r[0].length > 0) vectors.set(n, r[0]);
			} catch {
				// continue
			}
		}

		for (const c of top) {
			const va = vectors.get(c.primary.name);
			const vb = vectors.get(c.alias.name);
			if (!va || !vb) continue;
			const sim = cosineSimilarity(va, vb);
			if (sim > 0.85) {
				c.confidence = Math.min(1, c.confidence + 0.15);
				c.reasons.push(`Embedding similarity ${sim.toFixed(2)}`);
			}
		}
	}

	/** Apply: merge alias into primary. Adds alias.name to primary.aliases. */
	async mergeAlias(candidate: AliasCandidate): Promise<void> {
		const primary = this.kg.findPersonByName(candidate.primary.name);
		const alias = this.kg.findPersonByName(candidate.alias.name);
		if (!primary || !alias) return;
		if (primary.id === alias.id) return;

		// Add alias name to primary aliases
		this.kg.upsertPerson({
			name: primary.name,
			aliases: [...primary.aliases, alias.name, ...alias.aliases],
		});

		// Reassign sessions/actions/commitments/themes from alias to primary
		const data = this.kg.data;
		for (const s of data.sessions) {
			if (s.personId === alias.id) s.personId = primary.id;
			s.participantIds = s.participantIds.map((id) =>
				id === alias.id ? primary.id : id
			);
		}
		for (const a of data.actionItems) {
			if (a.ownerId === alias.id) a.ownerId = primary.id;
		}
		for (const c of data.commitments) {
			if (c.madeBy === alias.id) c.madeBy = primary.id;
			if (c.madeTo === alias.id) c.madeTo = primary.id;
		}
		for (const t of data.themes) {
			t.personIds = Array.from(
				new Set(t.personIds.map((id) => (id === alias.id ? primary.id : id)))
			);
		}

		// Remove alias from people list
		const idx = data.people.findIndex((p) => p.id === alias.id);
		if (idx >= 0) data.people.splice(idx, 1);

		await this.kg.save();
	}
}

export class AutoAliasingModal extends Modal {
	private candidates: AliasCandidate[] = [];

	constructor(app: App, private aliaser: AutoAliaser) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		applyResponsiveModal(contentEl, { preferredWidth: 720 });
		contentEl.createEl("h3", { text: "🪪 Atlas — Auto-aliasing" });

		const status = contentEl.createEl("div", { text: "Escaneando KG..." });
		status.style.opacity = "0.7";
		status.style.padding = "12px 0";

		this.candidates = await this.aliaser.findCandidates();
		status.remove();

		if (this.candidates.length === 0) {
			contentEl.createEl("p", {
				text: "🎉 Nenhum candidato a fusão detectado. KG limpo.",
			});
			new Setting(contentEl).addButton((b) =>
				b.setButtonText("Fechar").setCta().onClick(() => this.close())
			);
			return;
		}

		contentEl.createEl("p", {
			text: `${this.candidates.length} candidatos detectados. Confirme cada fusão (Atlas nunca funde sozinho).`,
		});

		const list = contentEl.createDiv();
		list.style.maxHeight = "60vh";
		list.style.overflowY = "auto";

		for (const c of this.candidates) {
			this.renderCandidate(list, c);
		}

		new Setting(contentEl).addButton((b) =>
			b.setButtonText("Fechar").onClick(() => this.close())
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderCandidate(parent: HTMLDivElement, c: AliasCandidate): void {
		const card = parent.createDiv();
		card.style.padding = "10px";
		card.style.marginBottom = "8px";
		card.style.background = "var(--background-secondary)";
		card.style.borderRadius = "6px";

		const header = card.createDiv();
		header.style.display = "flex";
		header.style.justifyContent = "space-between";
		header.style.alignItems = "center";
		header.style.marginBottom = "6px";

		const title = header.createEl("div");
		title.style.fontSize = "13px";
		title.createEl("strong", { text: c.primary.name });
		title.appendText(" ← ");
		title.createEl("em", { text: c.alias.name });

		const conf = header.createEl("span", {
			text: `${Math.round(c.confidence * 100)}%`,
		});
		conf.style.fontSize = "11px";
		conf.style.padding = "2px 6px";
		conf.style.borderRadius = "4px";
		conf.style.color = "white";
		if (c.confidence >= HIGH_CONFIDENCE) conf.style.background = "#2e7d32";
		else if (c.confidence >= 0.7) conf.style.background = "#f57c00";
		else conf.style.background = "#9e9e9e";

		const reasonList = card.createEl("ul");
		reasonList.style.fontSize = "11px";
		reasonList.style.opacity = "0.7";
		reasonList.style.margin = "4px 0";
		reasonList.style.paddingLeft = "20px";
		for (const r of c.reasons) {
			reasonList.createEl("li", { text: r });
		}

		const actions = card.createDiv();
		actions.style.display = "flex";
		actions.style.gap = "6px";
		actions.style.marginTop = "6px";

		const mergeBtn = actions.createEl("button", { text: "✅ Fundir" });
		mergeBtn.style.padding = "4px 10px";
		mergeBtn.style.fontSize = "11px";
		mergeBtn.addEventListener("click", async () => {
			await this.aliaser.mergeAlias(c);
			card.style.opacity = "0.4";
			card.style.pointerEvents = "none";
			new Notice(`Atlas: "${c.alias.name}" fundido em "${c.primary.name}"`);
		});

		const skipBtn = actions.createEl("button", { text: "Pular" });
		skipBtn.style.padding = "4px 10px";
		skipBtn.style.fontSize = "11px";
		skipBtn.addEventListener("click", () => {
			card.style.display = "none";
		});
	}
}

// ─── helpers ───

function normalize(s: string): string {
	return s
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z\s]/g, "")
		.trim();
}

function firstName(name: string): string | null {
	const parts = name.trim().split(/\s+/);
	if (parts.length === 0) return null;
	return normalize(parts[0]);
}

function initials(name: string): string {
	return name
		.split(/\s+/)
		.map((w) => w[0]?.toLowerCase() ?? "")
		.join("");
}

function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	if (!a.length) return b.length;
	if (!b.length) return a.length;
	const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
	for (let i = 0; i <= a.length; i++) dp[i][0] = i;
	for (let j = 0; j <= b.length; j++) dp[0][j] = j;
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			dp[i][j] = Math.min(
				dp[i - 1][j] + 1,
				dp[i][j - 1] + 1,
				dp[i - 1][j - 1] + cost
			);
		}
	}
	return dp[a.length][b.length];
}

function countSessions(p: PersonT, kg: KGStore): number {
	return kg.data.sessions.filter(
		(s) => s.personId === p.id || s.participantIds.includes(p.id)
	).length;
}
