import { Notice, TFile, Modal, Setting, normalizePath } from "obsidian";
import type AtlasPlugin from "../../../../main";
import type { CourseT, CourseModuleT, CourseStatus } from "../../../kg/schemas";
import { applyResponsiveModal } from "../../../ui/modal-helpers";
import { SlideOverPanel } from "../../../ui/slide-over-panel";
import { fieldInput, fieldSelect, fieldTextArea, formButtons } from "../../../ui/form-fields";

const STATUS_LABELS: Record<string, { emoji: string; label: string; color: string }> = {
	planning: { emoji: "📝", label: "Planejado", color: "#a855f7" },
	active: { emoji: "▶️", label: "Em andamento", color: "#3b82f6" },
	paused: { emoji: "⏸️", label: "Pausado", color: "#f97316" },
	completed: { emoji: "✅", label: "Concluído", color: "#10b981" },
	dropped: { emoji: "❌", label: "Abandonado", color: "#6b7280" },
};

/**
 * Courses sub-view — Course Manager completo dentro do Study tab.
 *
 * Cards: status colorido + barra de progresso (módulos concluídos).
 * Click no card → slide-over com detail + módulos checkable.
 * "+ Novo curso" → form 3-pass (nome, fonte, módulos via paste de bullets).
 */
export async function renderStudyCourses(
	container: HTMLElement,
	plugin: AtlasPlugin
): Promise<void> {
	container.empty();
	container.addClass("atlas-study-courses", "atlas-section-stagger");

	// Header
	container.createEl("div", {
		cls: "atlas-tab-section-subtitle",
		text: "Cursos: módulos checkable, progresso, takeaways, rating, certificado.",
	});

	// Stats
	const courses = plugin.kg.listCourses();
	const stats = container.createDiv({ cls: "atlas-study-stats-grid" });

	const active = courses.filter((c) => c.status === "active").length;
	const completed = courses.filter((c) => c.status === "completed").length;
	const totalModules = courses.reduce((s, c) => s + c.modules.length, 0);
	const doneModules = courses.reduce(
		(s, c) => s + c.modules.filter((m) => m.status === "done").length,
		0
	);

	statBlock(stats, "🎓 Cursos", String(courses.length));
	statBlock(stats, "▶️ Ativos", String(active));
	statBlock(stats, "✅ Concluídos", String(completed));
	statBlock(stats, "📦 Módulos", `${doneModules}/${totalModules}`);

	// Filter bar
	const filters = container.createDiv({ cls: "atlas-study-courses-filters" });

	const newBtn = filters.createEl("button", { cls: "mod-cta", text: "+ Novo curso" });
	newBtn.addEventListener("click", () => {
		new CourseEditModal(plugin, null, () => void renderStudyCourses(container, plugin)).open();
	});

	let activeFilter: string = "all";
	const statusButtons: { btn: HTMLButtonElement; status: string }[] = [];

	const allBtn = filters.createEl("button", { cls: "mod-cta atlas-study-filter-pill", text: "Todos" });
	statusButtons.push({ btn: allBtn, status: "all" });

	for (const status of ["active", "planning", "paused", "completed"]) {
		const meta = STATUS_LABELS[status];
		const btn = filters.createEl("button", {
			cls: "atlas-study-filter-pill",
			text: `${meta.emoji} ${meta.label}`,
		});
		statusButtons.push({ btn, status });
	}

	const updateButtons = () => {
		statusButtons.forEach(({ btn, status }) => {
			if (status === activeFilter) btn.addClass("mod-cta");
			else btn.removeClass("mod-cta");
		});
	};

	statusButtons.forEach(({ btn, status }) => {
		btn.addEventListener("click", () => {
			activeFilter = status;
			updateButtons();
			renderList();
		});
	});

	// Grid
	const grid = container.createDiv({ cls: "atlas-study-courses-grid" });

	const renderList = (): void => {
		grid.empty();
		const items = activeFilter === "all" ? courses : courses.filter((c) => c.status === activeFilter);

		if (items.length === 0) {
			const empty = grid.createDiv({ cls: "atlas-tab-empty-state" });
			empty.style.gridColumn = "1 / -1";
			empty.createEl("div", { cls: "atlas-tab-empty-emoji", text: "🎓" });
			empty.createEl("div", {
				cls: "atlas-tab-empty-title",
				text: activeFilter === "all" ? "Nenhum curso ainda" : `Nenhum curso "${activeFilter}"`,
			});
			if (activeFilter === "all") {
				empty.createEl("div", {
					cls: "atlas-tab-empty-desc",
					text: "Click '+ Novo curso' acima para começar.",
				});
			}
			return;
		}

		for (const c of items) {
			renderCourseCard(grid, c, plugin, () => void renderStudyCourses(container, plugin));
		}
	};

	renderList();
}

function renderCourseCard(
	parent: HTMLElement,
	course: CourseT,
	plugin: AtlasPlugin,
	onChange: () => void
): void {
	const card = parent.createDiv({
		cls: `atlas-tab-card-premium atlas-study-course-card is-status-${course.status}`,
	});
	const accentColor = STATUS_LABELS[course.status]?.color ?? "#6b7280";
	card.style.borderLeft = `4px solid ${accentColor}`;

	// Top: nome + status
	const top = card.createDiv({ cls: "atlas-study-course-top" });
	const statusMeta = STATUS_LABELS[course.status];
	top.createEl("span", {
		cls: "atlas-study-course-icon",
		text: statusMeta?.emoji ?? "🎓",
	});

	const titleWrap = top.createDiv({ cls: "atlas-study-course-title-wrap" });
	titleWrap.createEl("div", {
		cls: "atlas-study-course-name",
		text: course.name,
	});
	if (course.provider) {
		titleWrap.createEl("div", {
			cls: "atlas-study-course-provider",
			text: course.provider,
		});
	}

	if (course.rating) {
		top.createEl("span", {
			cls: "atlas-study-course-stars",
			text: "⭐".repeat(course.rating),
		});
	}

	// Progresso
	const total = course.modules.length;
	const done = course.modules.filter((m) => m.status === "done").length;
	const pct = total > 0 ? (done / total) * 100 : 0;

	const progLabel = card.createDiv({ cls: "atlas-study-course-prog-label" });
	progLabel.createEl("span", { text: `${done}/${total} módulos` });
	progLabel.createEl("span", { text: `${pct.toFixed(0)}%` });

	const progBar = card.createDiv({ cls: "atlas-progress-bar" });
	const fill = progBar.createDiv({ cls: "atlas-progress-bar-fill" });
	fill.style.width = `${pct}%`;
	fill.style.background = `linear-gradient(90deg, ${accentColor}, var(--atlas-accent, #00e5e5))`;

	// Meta row
	const meta = card.createDiv({ cls: "atlas-study-course-meta" });
	if (course.hoursLogged > 0) meta.createEl("span", { text: `⏱️ ${course.hoursLogged}h` });
	if (course.targetEndDate) meta.createEl("span", { text: `🎯 ${course.targetEndDate}` });
	if (course.takeaways.length > 0) meta.createEl("span", { text: `💡 ${course.takeaways.length}` });

	card.addEventListener("click", () => {
		openCourseDetail(plugin, course, onChange);
	});
}

function openCourseDetail(plugin: AtlasPlugin, course: CourseT, onChange: () => void): void {
	const panel = new SlideOverPanel({
		title: course.name,
		icon: STATUS_LABELS[course.status]?.emoji ?? "🎓",
		render: (body) => {
			body.empty();
			body.addClass("atlas-course-detail");

			// Status header
			const statusRow = body.createDiv({ cls: "atlas-course-status-row" });
			const statusMeta = STATUS_LABELS[course.status];
			const badge = statusRow.createEl("span", {
				cls: "atlas-course-status-badge",
				text: `${statusMeta?.emoji} ${statusMeta?.label}`,
			});
			badge.style.background = statusMeta?.color ?? "#6b7280";

			if (course.provider) {
				statusRow.createEl("span", {
					cls: "atlas-course-provider-tag",
					text: `📚 ${course.provider}`,
				});
			}

			// Action bar
			const actions = body.createDiv({ cls: "atlas-course-detail-actions" });

			const editBtn = actions.createEl("button", { text: "✏️ Editar" });
			editBtn.addEventListener("click", () => {
				panel.close();
				new CourseEditModal(plugin, course, onChange).open();
			});

			if (course.notePath) {
				const openBtn = actions.createEl("button", { text: "📝 Abrir nota" });
				openBtn.addEventListener("click", async () => {
					if (course.notePath) {
						const f = plugin.app.vault.getAbstractFileByPath(course.notePath);
						if (f instanceof TFile) {
							panel.close();
							await plugin.app.workspace.getLeaf().openFile(f);
						}
					}
				});
			}

			const delBtn = actions.createEl("button", { cls: "is-danger", text: "🗑️" });
			delBtn.title = "Deletar curso";
			delBtn.addEventListener("click", async () => {
				const { confirmAsync } = await import("../../../ui/confirm-modal");
				const ok = await confirmAsync(plugin.app, `Deletar "${course.name}"? Módulos serão perdidos.`, {
					title: "Confirmar exclusão",
					yesLabel: "Deletar",
					danger: true,
				});
				if (!ok) return;
				plugin.kg.deleteCourse(course.id);
				await plugin.kg.save();
				new Notice("Atlas: curso deletado.");
				panel.close();
				onChange();
			});

			// Progresso
			const total = course.modules.length;
			const done = course.modules.filter((m) => m.status === "done").length;
			const pct = total > 0 ? (done / total) * 100 : 0;

			const progSection = body.createDiv({ cls: "atlas-course-detail-prog-section" });
			progSection.createEl("div", {
				cls: "atlas-course-detail-prog-text",
				text: `Progresso: ${done}/${total} módulos (${pct.toFixed(0)}%)`,
			});
			const bar = progSection.createDiv({ cls: "atlas-progress-bar" });
			const fill = bar.createDiv({ cls: "atlas-progress-bar-fill" });
			fill.style.width = `${pct}%`;

			// Módulos checkable
			body.createEl("div", {
				cls: "atlas-course-detail-section-head",
				text: `📦 MÓDULOS (${total})`,
			});

			if (course.modules.length === 0) {
				const empty = body.createDiv({ cls: "atlas-course-detail-empty" });
				empty.setText("Nenhum módulo. Use Editar para adicionar.");
			} else {
				const modList = body.createDiv({ cls: "atlas-course-detail-modules" });
				for (const mod of course.modules) {
					renderModuleRow(modList, plugin, course, mod, () => {
						openCourseDetail(plugin, course, onChange);
						onChange();
					});
				}
			}

			// Takeaways
			if (course.takeaways.length > 0) {
				body.createEl("div", {
					cls: "atlas-course-detail-section-head",
					text: "💡 TAKEAWAYS",
				});
				const takList = body.createEl("ul", { cls: "atlas-course-detail-takeaways" });
				for (const t of course.takeaways) {
					takList.createEl("li", { text: t });
				}
			}
		},
	});
	void panel.open();
}

function renderModuleRow(
	parent: HTMLElement,
	plugin: AtlasPlugin,
	course: CourseT,
	mod: CourseModuleT,
	onChange: () => void
): void {
	const isDone = mod.status === "done";
	const row = parent.createDiv({
		cls: `atlas-course-module-row ${isDone ? "is-done" : ""}`.trim(),
	});

	const checkbox = row.createEl("input", {
		cls: "atlas-course-module-check",
		type: "checkbox",
	}) as HTMLInputElement;
	checkbox.checked = isDone;
	checkbox.addEventListener("change", async () => {
		const newStatus: "todo" | "done" = checkbox.checked ? "done" : "todo";
		plugin.kg.updateCourseModule(course.id, mod.id, { status: newStatus });
		await plugin.kg.save();
		onChange();
	});

	row.createDiv({ cls: "atlas-course-module-title", text: mod.title });

	if (mod.estimateHours) {
		row.createEl("span", {
			cls: "atlas-course-module-time",
			text: `${mod.estimateHours}h`,
		});
	}

	if (mod.completedAt) {
		row.createEl("span", {
			cls: "atlas-course-module-completed",
			text: `✓ ${mod.completedAt.substring(0, 10)}`,
		});
	}
}

class CourseEditModal extends Modal {
	private draft: Partial<CourseT> & { name: string; modulesText: string };

	constructor(
		private plugin: AtlasPlugin,
		private existing: CourseT | null,
		private onSave: () => void
	) {
		super(plugin.app);
		const e = existing;
		this.draft = e
			? {
					...e,
					modulesText: e.modules.map((m) => m.title).join("\n"),
				}
			: {
					name: "",
					provider: "",
					url: "",
					status: "active",
					modules: [],
					hoursLogged: 0,
					takeaways: [],
					tags: [],
					modulesText: "",
				};
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		applyResponsiveModal(contentEl, { preferredWidth: 640 });
		contentEl.addClass("atlas-form-modal", "atlas-course-edit-modal");

		const header = contentEl.createDiv({ cls: "atlas-form-modal-header" });
		header.createEl("h3", {
			cls: "atlas-form-modal-title",
			text: this.existing ? `🎓 Editar: ${this.existing.name}` : "🎓 Novo curso",
		});
		header.createEl("div", {
			cls: "atlas-form-modal-subtitle",
			text: this.existing
				? "Atualize informações + módulos. Status reflect no card."
				: "Configure curso novo. Atlas cria nota automática + tracking de módulos.",
		});

		fieldInput(contentEl, "Nome *", this.draft.name, (v) => (this.draft.name = v), {
			placeholder: "Ex: Sistemas Distribuídos (Coursera)",
		});

		fieldInput(contentEl, "Provider / Fonte", this.draft.provider ?? "", (v) => (this.draft.provider = v), {
			placeholder: "Coursera / Domestika / livro / interno",
		});

		fieldInput(contentEl, "URL do curso", this.draft.url ?? "", (v) => (this.draft.url = v), {
			placeholder: "https://...",
		});

		fieldSelect(
			contentEl,
			"Status",
			this.draft.status ?? "active",
			["planning", "active", "paused", "completed", "dropped"],
			(v) => (this.draft.status = v as CourseT["status"]),
			["📝 Planejado", "▶️ Em andamento", "⏸️ Pausado", "✅ Concluído", "❌ Abandonado"]
		);

		fieldInput(
			contentEl,
			"Data alvo de fim",
			this.draft.targetEndDate ?? "",
			(v) => (this.draft.targetEndDate = v),
			{ placeholder: "YYYY-MM-DD", type: "date" }
		);

		fieldTextArea(
			contentEl,
			"Módulos (1 por linha)",
			this.draft.modulesText,
			(v) => (this.draft.modulesText = v),
			{
				placeholder: "Módulo 1: Introdução\nMódulo 2: Conceitos\nMódulo 3: Hands-on\n...",
				minHeight: "150px",
			}
		);

		fieldInput(
			contentEl,
			"Rating (1-5, opcional)",
			String(this.draft.rating ?? ""),
			(v) => {
				const n = Number.parseInt(v, 10);
				if (n >= 1 && n <= 5) this.draft.rating = n as 1 | 2 | 3 | 4 | 5;
				else this.draft.rating = undefined;
			},
			{ placeholder: "1 a 5" }
		);

		formButtons(
			contentEl,
			this.existing ? "Salvar" : "Criar curso",
			async () => {
				if (!this.draft.name.trim()) {
					new Notice("Atlas: nome é obrigatório.");
					return;
				}
				// Parse modules from text
				const moduleLines = this.draft.modulesText
					.split("\n")
					.map((s) => s.trim())
					.filter(Boolean);
				const existingMods = this.existing?.modules ?? [];
				const modules: CourseModuleT[] = moduleLines.map((title, i) => {
					// Tenta preservar status existentes
					const existingMod = existingMods.find((m) => m.title === title);
					return existingMod ?? {
						id: `m-${i + 1}-${Date.now().toString(36)}`,
						title,
						status: "todo" as const,
					};
				});

				const saved = this.plugin.kg.upsertCourse({
					...this.draft,
					name: this.draft.name.trim(),
					modules,
				});
				await this.plugin.kg.save();

				// Cria nota se nova
				if (!this.existing && !saved.notePath) {
					await this.createCourseNote(saved);
				}

				new Notice(`Atlas: curso "${saved.name}" salvo.`);
				this.close();
				this.onSave();
			},
			() => this.close()
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async createCourseNote(course: CourseT): Promise<void> {
		const folder = `${this.plugin.settings.folders.studies}/courses`;
		if (!this.plugin.app.vault.getAbstractFileByPath(folder)) {
			await this.plugin.app.vault.createFolder(folder);
		}
		const path = normalizePath(`${folder}/${course.id}.md`);
		const md = `---
type: course
course_id: ${course.id}
name: ${JSON.stringify(course.name)}
provider: ${course.provider ? JSON.stringify(course.provider) : "null"}
status: ${course.status}
url: ${course.url ? JSON.stringify(course.url) : "null"}
created_by: atlas
tags: [course, ${course.tags.join(", ")}]
---

# 🎓 ${course.name}

${course.provider ? `**Fonte:** ${course.provider}` : ""}
${course.url ? `**URL:** [${course.url}](${course.url})` : ""}

## 📦 Módulos

${course.modules.map((m, i) => `- [ ] ${i + 1}. ${m.title}`).join("\n")}

## 💡 Takeaways

${course.takeaways.map((t) => `- ${t}`).join("\n") || "- "}

## 📝 Notas

`;
		await this.plugin.app.vault.create(path, md);
		this.plugin.kg.upsertCourse({ name: course.name, notePath: path });
		await this.plugin.kg.save();
	}
}

function statBlock(parent: HTMLElement, label: string, value: string): void {
	const cell = parent.createDiv({ cls: "atlas-study-stat-card" });
	cell.createEl("div", { cls: "atlas-study-stat-value", text: value });
	cell.createEl("div", { cls: "atlas-study-stat-label", text: label });
}

// Re-export type pra uso futuro
export type { CourseStatus };
