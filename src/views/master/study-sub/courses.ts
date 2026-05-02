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

	// Header
	const intro = container.createDiv();
	intro.style.fontSize = "11px";
	intro.style.opacity = "0.7";
	intro.style.marginBottom = "8px";
	intro.setText("Cursos: módulos checkable, progresso, takeaways, rating, certificado.");

	// Stats
	const courses = plugin.kg.listCourses();
	const stats = container.createDiv();
	stats.style.display = "grid";
	stats.style.gridTemplateColumns = "repeat(4, 1fr)";
	stats.style.gap = "6px";
	stats.style.marginBottom = "10px";

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
	const filters = container.createDiv();
	filters.style.display = "flex";
	filters.style.gap = "4px";
	filters.style.marginBottom = "10px";
	filters.style.alignItems = "center";

	const newBtn = filters.createEl("button", { text: "+ Novo curso" });
	newBtn.style.fontSize = "11px";
	newBtn.style.padding = "5px 12px";
	newBtn.addClass("mod-cta");
	newBtn.addEventListener("click", () => {
		new CourseEditModal(plugin, null, () => void renderStudyCourses(container, plugin)).open();
	});

	let activeFilter: string = "all";
	const statusButtons: { btn: HTMLButtonElement; status: string }[] = [];

	const allBtn = filters.createEl("button", { text: "Todos" });
	allBtn.style.fontSize = "10px";
	allBtn.style.padding = "4px 8px";
	allBtn.style.marginLeft = "8px";
	statusButtons.push({ btn: allBtn, status: "all" });
	allBtn.addClass("mod-cta");

	for (const status of ["active", "planning", "paused", "completed"]) {
		const meta = STATUS_LABELS[status];
		const btn = filters.createEl("button", { text: `${meta.emoji} ${meta.label}` });
		btn.style.fontSize = "10px";
		btn.style.padding = "4px 8px";
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
	const grid = container.createDiv();
	grid.style.display = "grid";
	grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(280px, 1fr))";
	grid.style.gap = "10px";
	grid.style.maxHeight = "calc(100vh - 380px)";
	grid.style.overflowY = "auto";

	const renderList = () => {
		grid.empty();
		const items = activeFilter === "all" ? courses : courses.filter((c) => c.status === activeFilter);

		if (items.length === 0) {
			const empty = grid.createDiv();
			empty.style.gridColumn = "1 / -1";
			empty.style.padding = "32px";
			empty.style.textAlign = "center";
			empty.style.opacity = "0.6";
			empty.setText(
				activeFilter === "all"
					? "🎓 Nenhum curso ainda. Click '+ Novo curso' acima."
					: `Nenhum curso com status "${activeFilter}".`
			);
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
	const card = parent.createDiv();
	card.addClass("atlas-card-interactive");
	card.style.padding = "12px";
	card.style.background = "var(--background-secondary)";
	card.style.borderRadius = "8px";
	card.style.border = "1px solid var(--background-modifier-border)";
	card.style.borderLeft = `4px solid ${STATUS_LABELS[course.status]?.color ?? "#6b7280"}`;
	card.style.cursor = "pointer";
	card.style.display = "flex";
	card.style.flexDirection = "column";
	card.style.gap = "6px";

	// Top: nome + status
	const top = card.createDiv();
	top.style.display = "flex";
	top.style.alignItems = "center";
	top.style.gap = "8px";

	const statusMeta = STATUS_LABELS[course.status];
	const iconEl = top.createEl("span", { text: statusMeta?.emoji ?? "🎓" });
	iconEl.style.fontSize = "16px";

	const titleWrap = top.createDiv();
	titleWrap.style.flexGrow = "1";
	const nameEl = titleWrap.createEl("div", { text: course.name });
	nameEl.style.fontSize = "13px";
	nameEl.style.fontWeight = "bold";
	if (course.provider) {
		const provEl = titleWrap.createEl("div", { text: course.provider });
		provEl.style.fontSize = "10px";
		provEl.style.opacity = "0.65";
	}

	if (course.rating) {
		const star = top.createEl("span", { text: "⭐".repeat(course.rating) });
		star.style.fontSize = "10px";
	}

	// Progresso
	const total = course.modules.length;
	const done = course.modules.filter((m) => m.status === "done").length;
	const pct = total > 0 ? (done / total) * 100 : 0;

	const progLabel = card.createDiv();
	progLabel.style.fontSize = "10px";
	progLabel.style.opacity = "0.7";
	progLabel.style.display = "flex";
	progLabel.style.justifyContent = "space-between";
	progLabel.createEl("span", { text: `${done}/${total} módulos` });
	progLabel.createEl("span", { text: `${pct.toFixed(0)}%` });

	const progBar = card.createDiv();
	progBar.style.height = "6px";
	progBar.style.background = "var(--background-modifier-border)";
	progBar.style.borderRadius = "3px";
	progBar.style.overflow = "hidden";
	const fill = progBar.createDiv();
	fill.style.height = "100%";
	fill.style.width = `${pct}%`;
	fill.style.background = `linear-gradient(90deg, ${STATUS_LABELS[course.status]?.color ?? "#6b7280"}, var(--interactive-accent))`;
	fill.style.transition = "width 300ms ease";

	// Meta row
	const meta = card.createDiv();
	meta.style.display = "flex";
	meta.style.gap = "10px";
	meta.style.fontSize = "10px";
	meta.style.opacity = "0.7";
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

			// Status header
			const statusRow = body.createDiv();
			statusRow.style.display = "flex";
			statusRow.style.alignItems = "center";
			statusRow.style.gap = "8px";
			statusRow.style.marginBottom = "12px";
			const statusMeta = STATUS_LABELS[course.status];
			const badge = statusRow.createEl("span", {
				text: `${statusMeta?.emoji} ${statusMeta?.label}`,
			});
			badge.style.padding = "3px 10px";
			badge.style.borderRadius = "4px";
			badge.style.background = statusMeta?.color ?? "#6b7280";
			badge.style.color = "white";
			badge.style.fontSize = "11px";
			badge.style.fontWeight = "bold";

			if (course.provider) {
				const prov = statusRow.createEl("span", { text: `📚 ${course.provider}` });
				prov.style.fontSize = "11px";
				prov.style.opacity = "0.7";
			}

			// Action bar
			const actions = body.createDiv();
			actions.style.display = "flex";
			actions.style.gap = "6px";
			actions.style.marginBottom = "16px";

			const editBtn = actions.createEl("button", { text: "✏️ Editar" });
			editBtn.style.fontSize = "11px";
			editBtn.style.padding = "4px 10px";
			editBtn.addEventListener("click", () => {
				panel.close();
				new CourseEditModal(plugin, course, onChange).open();
			});

			if (course.notePath) {
				const openBtn = actions.createEl("button", { text: "📝 Abrir nota" });
				openBtn.style.fontSize = "11px";
				openBtn.style.padding = "4px 10px";
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

			const delBtn = actions.createEl("button", { text: "🗑️" });
			delBtn.style.fontSize = "11px";
			delBtn.style.padding = "4px 10px";
			delBtn.title = "Deletar curso";
			delBtn.addEventListener("click", async () => {
				if (!confirm(`Atlas: deletar "${course.name}"? (módulos perdidos)`)) return;
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

			const progSection = body.createDiv();
			progSection.style.padding = "10px";
			progSection.style.background = "var(--background-secondary-alt)";
			progSection.style.borderRadius = "6px";
			progSection.style.marginBottom = "16px";
			progSection.createEl("div", {
				text: `Progresso: ${done}/${total} módulos (${pct.toFixed(0)}%)`,
			}).style.fontSize = "12px";
			const bar = progSection.createDiv();
			bar.style.height = "8px";
			bar.style.background = "var(--background-modifier-border)";
			bar.style.borderRadius = "4px";
			bar.style.marginTop = "6px";
			const fill = bar.createDiv();
			fill.style.height = "100%";
			fill.style.width = `${pct}%`;
			fill.style.background = "var(--interactive-accent)";
			fill.style.borderRadius = "4px";

			// Módulos checkable
			const modulesHead = body.createEl("div", { text: `📦 Módulos (${total})` });
			modulesHead.style.fontSize = "11px";
			modulesHead.style.fontWeight = "bold";
			modulesHead.style.opacity = "0.7";
			modulesHead.style.marginBottom = "6px";

			if (course.modules.length === 0) {
				body.createEl("div", {
					text: "Nenhum módulo. Use Editar para adicionar.",
				}).style.opacity = "0.6";
			} else {
				for (const mod of course.modules) {
					renderModuleRow(body, plugin, course, mod, () => {
						openCourseDetail(plugin, course, onChange);
						onChange();
					});
				}
			}

			// Takeaways
			if (course.takeaways.length > 0) {
				const takHead = body.createEl("div", { text: "💡 Takeaways" });
				takHead.style.fontSize = "11px";
				takHead.style.fontWeight = "bold";
				takHead.style.opacity = "0.7";
				takHead.style.marginTop = "16px";
				takHead.style.marginBottom = "6px";
				const takList = body.createEl("ul");
				takList.style.paddingLeft = "18px";
				takList.style.fontSize = "12px";
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
	const row = parent.createDiv();
	row.style.display = "flex";
	row.style.alignItems = "center";
	row.style.gap = "8px";
	row.style.padding = "6px 8px";
	row.style.marginBottom = "4px";
	row.style.background = "var(--background-secondary)";
	row.style.borderRadius = "4px";

	const checkbox = row.createEl("input", { type: "checkbox" }) as HTMLInputElement;
	checkbox.checked = mod.status === "done";
	checkbox.addEventListener("change", async () => {
		const newStatus: "todo" | "done" = checkbox.checked ? "done" : "todo";
		plugin.kg.updateCourseModule(course.id, mod.id, { status: newStatus });
		await plugin.kg.save();
		onChange();
	});

	const titleEl = row.createDiv();
	titleEl.style.flexGrow = "1";
	titleEl.style.fontSize = "12px";
	titleEl.setText(mod.title);
	if (mod.status === "done") {
		titleEl.style.textDecoration = "line-through";
		titleEl.style.opacity = "0.65";
	}

	if (mod.estimateHours) {
		const time = row.createEl("span", { text: `${mod.estimateHours}h` });
		time.style.fontSize = "10px";
		time.style.opacity = "0.6";
	}

	if (mod.completedAt) {
		const ca = row.createEl("span", { text: `✓ ${mod.completedAt.substring(0, 10)}` });
		ca.style.fontSize = "9px";
		ca.style.opacity = "0.55";
		ca.style.color = "var(--color-green)";
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
		contentEl.createEl("h3", {
			text: this.existing ? `🎓 Editar: ${this.existing.name}` : "🎓 Novo curso",
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
	const cell = parent.createDiv();
	cell.style.padding = "8px";
	cell.style.background = "var(--background-secondary)";
	cell.style.borderRadius = "6px";
	cell.style.textAlign = "center";

	const v = cell.createEl("div", { text: value });
	v.style.fontSize = "16px";
	v.style.fontWeight = "bold";
	v.style.color = "var(--interactive-accent)";

	const l = cell.createEl("div", { text: label });
	l.style.fontSize = "10px";
	l.style.opacity = "0.7";
	l.style.marginTop = "2px";
}

// Re-export type pra uso futuro
export type { CourseStatus };
