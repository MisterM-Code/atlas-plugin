/**
 * Atlas v0.51 — Active Learning review modal.
 *
 * Lista entities recém-extraídas pelo KG e permite confirmar/rejeitar.
 * Rejeitadas: removidas do KG + viram negative examples no extractor.
 */

import { App, Modal, Notice, Setting } from "obsidian";
import type AtlasPlugin from "../../main";
import { applyResponsiveModal } from "./modal-helpers";
import { ExtractionFeedbackStore } from "../kg/extraction-feedback";

interface ReviewItem {
	kind: "person" | "system" | "product" | "course" | "theme";
	id: string;
	name: string;
	updatedAt: string;
}

export class ActiveLearningModal extends Modal {
	private feedback: ExtractionFeedbackStore;
	private items: ReviewItem[] = [];
	private filterKind: ReviewItem["kind"] | "all" = "all";

	constructor(app: App, private plugin: AtlasPlugin) {
		super(app);
		this.feedback = new ExtractionFeedbackStore(app, plugin.settings.folders.atlas);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		applyResponsiveModal(contentEl, { preferredWidth: 640 });

		contentEl.createEl("h2", { text: "🎓 Active Learning — revisar extrações" });
		contentEl.createEl("p", {
			text: "Confirme ou rejeite entities recém-extraídas. Rejeições viram anti-exemplos pra próximas extrações (LLM melhora).",
			cls: "atlas-active-learning-desc",
		});

		await this.feedback.load();
		await this.loadRecentItems();

		// Stats summary
		const stats = await this.feedback.stats();
		const statsEl = contentEl.createDiv({ cls: "atlas-active-learning-stats" });
		statsEl.setText(
			`Total feedback: ${stats.total} (✓ ${stats.accepts} confirmados · ✗ ${stats.rejects} rejeitados)`
		);

		// Filter
		new Setting(contentEl)
			.setName("Filtrar tipo")
			.addDropdown((dd) => {
				dd.addOption("all", "Todos");
				dd.addOption("person", "Pessoas");
				dd.addOption("system", "Sistemas");
				dd.addOption("product", "Produtos");
				dd.addOption("course", "Cursos");
				dd.addOption("theme", "Temas");
				dd.setValue("all");
				dd.onChange((v) => {
					this.filterKind = v as ReviewItem["kind"] | "all";
					this.renderList();
				});
			});

		const list = contentEl.createDiv({ cls: "atlas-active-learning-list" });
		(list as HTMLElement).id = "atlas-active-learning-list";

		this.renderList();
	}

	private async loadRecentItems(): Promise<void> {
		const kg = this.plugin.kg.data;
		// Take last 30 of each kind (most recently updated)
		const sortByUpd = <T extends { updatedAt?: string }>(arr: T[]): T[] =>
			[...arr].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));

		const top = (n: number) => <T>(a: T[]): T[] => a.slice(0, n);
		const N = 10;

		const people = top(N)(sortByUpd(kg.people));
		const systems = top(N)(sortByUpd(kg.systems));
		const products = top(N)(sortByUpd(kg.products));
		const courses = top(N)(sortByUpd(kg.courses));
		const themes = top(N)(sortByUpd(kg.themes));

		this.items = [
			...people.map((p): ReviewItem => ({
				kind: "person",
				id: p.id,
				name: p.name,
				updatedAt: p.updatedAt ?? "",
			})),
			...systems.map((s): ReviewItem => ({
				kind: "system",
				id: s.id,
				name: s.name,
				updatedAt: s.updatedAt ?? "",
			})),
			...products.map((p): ReviewItem => ({
				kind: "product",
				id: p.id,
				name: p.name,
				updatedAt: p.updatedAt ?? "",
			})),
			...courses.map((c): ReviewItem => ({
				kind: "course",
				id: c.id,
				name: c.name,
				updatedAt: c.updatedAt ?? "",
			})),
			...themes.map((t): ReviewItem => ({
				kind: "theme",
				id: t.id ?? t.name,
				name: t.name,
				updatedAt: t.updatedAt ?? "",
			})),
		];

		this.items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}

	private renderList(): void {
		const listEl = this.contentEl.querySelector("#atlas-active-learning-list") as HTMLElement | null;
		if (!listEl) return;
		listEl.empty();

		const visible = this.items.filter(
			(i) => this.filterKind === "all" || i.kind === this.filterKind
		);

		if (visible.length === 0) {
			listEl.createDiv({
				cls: "atlas-active-learning-empty",
				text: "Nenhuma entity pra revisar.",
			});
			return;
		}

		const KIND_EMOJI: Record<ReviewItem["kind"], string> = {
			person: "👤",
			system: "🖥️",
			product: "📦",
			course: "🎓",
			theme: "🏷️",
		};

		for (const item of visible.slice(0, 30)) {
			const row = listEl.createDiv({ cls: "atlas-active-learning-row" });
			const head = row.createDiv({ cls: "atlas-active-learning-head" });
			head.createSpan({ cls: "atlas-active-learning-emoji", text: KIND_EMOJI[item.kind] });
			head.createSpan({ cls: "atlas-active-learning-name", text: item.name });
			head.createSpan({
				cls: "atlas-active-learning-kind",
				text: ` (${item.kind})`,
			});

			const actions = row.createDiv({ cls: "atlas-active-learning-actions" });

			const accept = actions.createEl("button", {
				cls: "atlas-active-learning-accept",
				text: "✓ Confirmar",
			});
			accept.addEventListener("click", async () => {
				await this.feedback.record({
					kind: item.kind,
					action: "accept",
					text: item.name,
				});
				row.classList.add("is-confirmed");
				accept.disabled = true;
				new Notice(`✓ ${item.name} confirmado.`);
			});

			const reject = actions.createEl("button", {
				cls: "atlas-active-learning-reject",
				text: "✗ Rejeitar",
			});
			reject.addEventListener("click", async () => {
				const reason = prompt(`Por quê rejeitar "${item.name}"? (opcional)`);
				if (reason === null) return; // user cancelled
				await this.feedback.record({
					kind: item.kind,
					action: "reject",
					text: item.name,
					reason: reason || undefined,
				});

				// Remove from KG
				try {
					const data = this.plugin.kg.data;
					if (item.kind === "person") data.people = data.people.filter((x) => x.id !== item.id);
					if (item.kind === "system") data.systems = data.systems.filter((x) => x.id !== item.id);
					if (item.kind === "product") data.products = data.products.filter((x) => x.id !== item.id);
					if (item.kind === "course") data.courses = data.courses.filter((x) => x.id !== item.id);
					if (item.kind === "theme")
						data.themes = data.themes.filter((x) => (x.id ?? x.name) !== item.id);
					await this.plugin.kg.save();
				} catch (e) {
					new Notice(`Erro removendo do KG: ${String(e)}`, 6000);
				}

				row.classList.add("is-rejected");
				reject.disabled = true;
				accept.disabled = true;
				new Notice(`✗ ${item.name} rejeitado e removido do KG. Anti-exemplo registrado.`);
			});
		}
	}
}
