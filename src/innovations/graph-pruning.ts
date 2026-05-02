/**
 * Atlas v0.11 — Graph Pruning Assistant.
 *
 * Detecta clusters desconectados no Knowledge Graph e propõe ações:
 * - merge entidades similares
 * - identificar nós isolados (orphan)
 * - sugerir tags/links que unificam
 *
 * UX: modal com 4 seções:
 *   1. Stats overview (total nodes, components, density)
 *   2. Disconnected components (clusters separados)
 *   3. Orphan entities (sem conexões)
 *   4. Merge suggestions (entidades com nomes similares)
 */

import { App, Modal, Notice } from "obsidian";
import type AtlasPlugin from "../../main";
import type { PersonT, SystemT, ProductT } from "../kg/schemas";
import { applyResponsiveModal } from "../ui/modal-helpers";

interface GraphNode {
	id: string;
	type: "person" | "system" | "product" | "theme";
	label: string;
	connections: number;
}

interface PruningReport {
	totalNodes: number;
	totalEdges: number;
	density: number; // 0-1
	components: GraphNode[][];
	orphans: GraphNode[];
	mergeSuggestions: Array<{ a: GraphNode; b: GraphNode; reason: string; confidence: number }>;
}

export class GraphPruningModal extends Modal {
	private report: PruningReport | null = null;

	constructor(app: App, private readonly plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		applyResponsiveModal(contentEl, { preferredWidth: 720, preferredHeight: 600 });
		contentEl.addClass("atlas-pruning-modal");

		contentEl.createEl("h3", {
			cls: "atlas-pruning-title",
			text: "✂️ Graph Pruning Assistant",
		});
		contentEl.createEl("div", {
			cls: "atlas-pruning-subtitle",
			text: "Análise da saúde do Knowledge Graph: clusters desconectados, órfãos, sugestões de merge.",
		});

		const loading = contentEl.createDiv({ cls: "atlas-pruning-loading" });
		loading.setText("⏳ Analisando knowledge graph...");

		// Run analysis async
		setTimeout(() => {
			this.report = this.analyzeGraph();
			loading.remove();
			this.renderReport(contentEl);
		}, 100);
	}

	private analyzeGraph(): PruningReport {
		const kg = this.plugin.kg.data;

		// Build node list
		const nodes: GraphNode[] = [];
		const nodeMap = new Map<string, GraphNode>();

		const addNode = (id: string, type: GraphNode["type"], label: string) => {
			if (nodeMap.has(`${type}:${id}`)) return;
			const n: GraphNode = { id: `${type}:${id}`, type, label, connections: 0 };
			nodes.push(n);
			nodeMap.set(`${type}:${id}`, n);
		};

		for (const p of kg.people) addNode(p.id, "person", p.name);
		for (const s of kg.systems) addNode(s.id, "system", s.name);
		for (const p of kg.products) addNode(p.id, "product", p.name);
		for (const t of kg.themes) addNode(t.id, "theme", t.name);

		// Build edges (people ↔ sessions ↔ themes ↔ etc.)
		const adjacency = new Map<string, Set<string>>();
		const addEdge = (a: string, b: string) => {
			if (!adjacency.has(a)) adjacency.set(a, new Set());
			if (!adjacency.has(b)) adjacency.set(b, new Set());
			adjacency.get(a)!.add(b);
			adjacency.get(b)!.add(a);
			const na = nodeMap.get(a);
			const nb = nodeMap.get(b);
			if (na) na.connections++;
			if (nb) nb.connections++;
		};

		// People ↔ themes (via theme.personIds)
		for (const t of kg.themes) {
			for (const pid of t.personIds) {
				addEdge(`theme:${t.id}`, `person:${pid}`);
			}
		}
		// People ↔ products (via ownerPersonId)
		for (const p of kg.products) {
			if (p.ownerPersonId) addEdge(`product:${p.id}`, `person:${p.ownerPersonId}`);
			for (const sid of p.systemIds) addEdge(`product:${p.id}`, `system:${sid}`);
		}
		// Systems ↔ owner
		for (const s of kg.systems) {
			if (s.ownerPersonId) addEdge(`system:${s.id}`, `person:${s.ownerPersonId}`);
		}
		// Sessions create person↔theme edges
		for (const sess of kg.sessions) {
			if (sess.personId) {
				for (const tid of sess.topics) {
					const themeId = kg.themes.find((t) => t.name === tid)?.id;
					if (themeId) addEdge(`person:${sess.personId}`, `theme:${themeId}`);
				}
			}
		}

		const totalNodes = nodes.length;
		let totalEdges = 0;
		for (const set of adjacency.values()) totalEdges += set.size;
		totalEdges = Math.floor(totalEdges / 2); // each edge counted twice

		const maxEdges = (totalNodes * (totalNodes - 1)) / 2;
		const density = maxEdges > 0 ? totalEdges / maxEdges : 0;

		// Find connected components via BFS
		const visited = new Set<string>();
		const components: GraphNode[][] = [];
		for (const node of nodes) {
			if (visited.has(node.id)) continue;
			const component: GraphNode[] = [];
			const queue = [node.id];
			while (queue.length > 0) {
				const cur = queue.shift()!;
				if (visited.has(cur)) continue;
				visited.add(cur);
				const n = nodeMap.get(cur);
				if (n) component.push(n);
				const neighbors = adjacency.get(cur);
				if (neighbors) {
					for (const nb of neighbors) {
						if (!visited.has(nb)) queue.push(nb);
					}
				}
			}
			if (component.length > 0) components.push(component);
		}

		// Sort components by size (largest first)
		components.sort((a, b) => b.length - a.length);

		// Orphans = nodes with 0 connections
		const orphans = nodes.filter((n) => n.connections === 0);

		// Merge suggestions: similar names within same type
		const mergeSuggestions: PruningReport["mergeSuggestions"] = [];
		const types: GraphNode["type"][] = ["person", "system", "product", "theme"];
		for (const type of types) {
			const sameType = nodes.filter((n) => n.type === type);
			for (let i = 0; i < sameType.length; i++) {
				for (let j = i + 1; j < sameType.length; j++) {
					const a = sameType[i];
					const b = sameType[j];
					const sim = similarity(a.label, b.label);
					if (sim > 0.7) {
						mergeSuggestions.push({
							a,
							b,
							reason: `Nomes similares (${Math.round(sim * 100)}%)`,
							confidence: sim,
						});
					}
				}
			}
		}
		mergeSuggestions.sort((a, b) => b.confidence - a.confidence);

		return {
			totalNodes,
			totalEdges,
			density,
			components,
			orphans,
			mergeSuggestions: mergeSuggestions.slice(0, 10),
		};
	}

	private renderReport(parent: HTMLElement): void {
		if (!this.report) return;
		const r = this.report;

		// Stats overview
		const statsBox = parent.createDiv({ cls: "atlas-pruning-stats" });
		statsBox.createEl("h4", { text: "📊 Overview" });
		const grid = statsBox.createDiv({ cls: "atlas-pruning-stats-grid" });
		this.statCell(grid, "Nodes totais", String(r.totalNodes));
		this.statCell(grid, "Edges totais", String(r.totalEdges));
		this.statCell(grid, "Densidade", `${(r.density * 100).toFixed(1)}%`);
		this.statCell(grid, "Componentes", String(r.components.length));

		// Health verdict
		const verdict = parent.createDiv({ cls: "atlas-pruning-verdict" });
		if (r.components.length <= 1 && r.orphans.length === 0) {
			verdict.addClass("is-healthy");
			verdict.setText("✅ KG saudável: nenhum cluster desconectado, zero órfãos.");
		} else if (r.components.length > 3 || r.orphans.length > r.totalNodes * 0.3) {
			verdict.addClass("is-warning");
			verdict.setText(
				`⚠️ KG fragmentado: ${r.components.length} clusters, ${r.orphans.length} órfãos (${Math.round((r.orphans.length / Math.max(r.totalNodes, 1)) * 100)}%).`
			);
		} else {
			verdict.addClass("is-mid");
			verdict.setText(
				`💡 KG ok mas pode melhorar: ${r.components.length} clusters, ${r.orphans.length} órfãos.`
			);
		}

		// Disconnected components (small ones only)
		if (r.components.length > 1) {
			const sec = parent.createDiv({ cls: "atlas-pruning-section" });
			sec.createEl("h4", { text: `🧩 Clusters desconectados (${r.components.length})` });
			sec.createEl("p", {
				cls: "atlas-pruning-section-desc",
				text: "Atlas detectou subgraphs sem conexão entre si. Considere criar links que unifiquem.",
			});
			r.components.slice(0, 5).forEach((comp, idx) => {
				const row = sec.createDiv({ cls: "atlas-pruning-component-row" });
				row.createEl("strong", { text: idx === 0 ? "Principal" : `Cluster ${idx + 1}` });
				row.createEl("span", { text: ` (${comp.length} nós): ` });
				row.createEl("span", {
					cls: "atlas-pruning-component-list",
					text: comp.slice(0, 8).map((n) => n.label).join(", ") + (comp.length > 8 ? "…" : ""),
				});
			});
		}

		// Orphans
		if (r.orphans.length > 0) {
			const sec = parent.createDiv({ cls: "atlas-pruning-section" });
			sec.createEl("h4", { text: `🏝️ Entidades órfãs (${r.orphans.length})` });
			sec.createEl("p", {
				cls: "atlas-pruning-section-desc",
				text: "Cadastradas mas sem nenhuma conexão. Mencione em alguma nota ou delete se desnecessárias.",
			});
			const list = sec.createEl("ul", { cls: "atlas-pruning-orphans-list" });
			for (const o of r.orphans.slice(0, 12)) {
				list.createEl("li", { text: `${typeEmoji(o.type)} ${o.label}` });
			}
			if (r.orphans.length > 12) {
				sec.createEl("div", {
					cls: "atlas-pruning-more",
					text: `… e mais ${r.orphans.length - 12}.`,
				});
			}
		}

		// Merge suggestions
		if (r.mergeSuggestions.length > 0) {
			const sec = parent.createDiv({ cls: "atlas-pruning-section" });
			sec.createEl("h4", { text: `🔗 Sugestões de merge (${r.mergeSuggestions.length})` });
			sec.createEl("p", {
				cls: "atlas-pruning-section-desc",
				text: "Atlas detectou entidades com nomes muito parecidos. Considere unificar via aliases.",
			});
			for (const s of r.mergeSuggestions) {
				const row = sec.createDiv({ cls: "atlas-pruning-merge-row" });
				row.createEl("span", { cls: "atlas-pruning-merge-emoji", text: typeEmoji(s.a.type) });
				row.createEl("strong", { text: ` "${s.a.label}" ↔ "${s.b.label}" ` });
				row.createEl("span", {
					cls: "atlas-pruning-merge-reason",
					text: ` — ${s.reason}`,
				});
				const btn = row.createEl("button", {
					cls: "atlas-pruning-merge-btn",
					text: "Adicionar como alias",
				});
				btn.addEventListener("click", () => void this.suggestMerge(s.a, s.b));
			}
		}

		// Done
		const done = parent.createDiv({ cls: "atlas-pruning-done" });
		const closeBtn = done.createEl("button", { text: "Fechar", cls: "mod-cta" });
		closeBtn.addEventListener("click", () => this.close());
	}

	private statCell(grid: HTMLElement, label: string, value: string): void {
		const cell = grid.createDiv({ cls: "atlas-pruning-stat-cell" });
		cell.createEl("div", { cls: "atlas-pruning-stat-value", text: value });
		cell.createEl("div", { cls: "atlas-pruning-stat-label", text: label });
	}

	private async suggestMerge(a: GraphNode, b: GraphNode): Promise<void> {
		if (a.type !== b.type) return;
		// For people/systems, add alias
		try {
			if (a.type === "person") {
				const target = this.plugin.kg.data.people.find((p) => `person:${p.id}` === a.id);
				const source = this.plugin.kg.data.people.find((p) => `person:${p.id}` === b.id);
				if (target && source) {
					target.aliases = Array.from(new Set([...(target.aliases ?? []), source.name, ...(source.aliases ?? [])]));
					await this.plugin.kg.save();
					new Notice(`Atlas: "${source.name}" agora é alias de "${target.name}".`);
				}
			} else if (a.type === "system") {
				const target = this.plugin.kg.data.systems.find((s) => `system:${s.id}` === a.id);
				const source = this.plugin.kg.data.systems.find((s) => `system:${s.id}` === b.id);
				if (target && source) {
					target.aliases = Array.from(new Set([...(target.aliases ?? []), source.name, ...(source.aliases ?? [])]));
					await this.plugin.kg.save();
					new Notice(`Atlas: "${source.name}" agora é alias de "${target.name}".`);
				}
			} else {
				new Notice(`Atlas: merge de ${a.type} ainda não automatizado. Edite manualmente.`);
			}
		} catch (e) {
			new Notice(`Atlas: merge falhou — ${String(e)}`, 6000);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

function similarity(a: string, b: string): number {
	const aL = a.toLowerCase().trim();
	const bL = b.toLowerCase().trim();
	if (aL === bL) return 1;
	// Simple Jaro-Winkler-ish: char overlap + length similarity
	const setA = new Set(aL);
	const setB = new Set(bL);
	const intersect = [...setA].filter((c) => setB.has(c)).length;
	const union = new Set([...setA, ...setB]).size;
	const charSim = union > 0 ? intersect / union : 0;
	const lenSim = 1 - Math.abs(aL.length - bL.length) / Math.max(aL.length, bL.length);
	// Substring bonus
	const substringBonus = aL.includes(bL) || bL.includes(aL) ? 0.3 : 0;
	return Math.min(1, charSim * 0.6 + lenSim * 0.2 + substringBonus);
}

function typeEmoji(t: GraphNode["type"]): string {
	switch (t) {
		case "person": return "👤";
		case "system": return "🖥️";
		case "product": return "📦";
		case "theme": return "🏷️";
	}
}
