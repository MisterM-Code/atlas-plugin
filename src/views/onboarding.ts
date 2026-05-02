import { App, Modal, Notice, Setting } from "obsidian";
import type AtlasPlugin from "../../main";
import { setupVaultStructure } from "../commands/setup-vault";
import { applyTemplatesToVault } from "../commands/apply-templates";
import { encryptLight } from "../utils/crypto-light";
import { detectSystemInfo, recommendationForProfile } from "../utils/system-info";
import { logger } from "../utils/logger";
import { applyResponsiveModal } from "../ui/modal-helpers";
import { PROFILES, PROFILE_CATEGORIES, ProfileId, mergeProfiles } from "../profiles/registry";
import { detectOllama } from "../automation/ollama-installer";

const STEPS = [
	"welcome",
	"profile",
	"workflow",
	"goals",
	"vault",
	"ollama",
	"color",
	"email",
	"telegram",
	"calendar",
	"done",
] as const;
type Step = (typeof STEPS)[number];

const COLOR_PRESETS: { id: string; label: string; hex: string }[] = [
	{ id: "indigo", label: "Indigo", hex: "#6366f1" },
	{ id: "teal", label: "Teal", hex: "#14b8a6" },
	{ id: "orange", label: "Orange", hex: "#f97316" },
	{ id: "rose", label: "Rose", hex: "#f43f5e" },
	{ id: "forest", label: "Forest", hex: "#16a34a" },
];

function dayNameToNum(day: string): number {
	const map: Record<string, number> = {
		sunday: 0,
		monday: 1,
		tuesday: 2,
		wednesday: 3,
		thursday: 4,
		friday: 5,
		saturday: 6,
	};
	return map[day.toLowerCase()] ?? 5; // default Friday
}

export class OnboardingWizard extends Modal {
	private step: Step = "welcome";

	constructor(app: App, private plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		this.containerEl.addClass("atlas-onboarding");
		applyResponsiveModal(this.contentEl, { preferredWidth: 640 });
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async go(next: Step): Promise<void> {
		this.step = next;
		this.plugin.settings.onboarding.currentStep = STEPS.indexOf(next);
		await this.plugin.saveSettings();
		this.render();
	}

	private async finish(): Promise<void> {
		this.plugin.settings.onboarding.completed = true;
		this.plugin.settings.onboarding.currentStep = STEPS.length;
		await this.plugin.saveSettings();
		await this.plugin.auditLog({ action: "onboarding.completed" });
		this.close();
	}

	private render(): void {
		this.contentEl.empty();
		this.renderHeader();

		switch (this.step) {
			case "welcome":
				this.renderWelcome();
				break;
			case "profile":
				this.renderProfile();
				break;
			case "workflow":
				this.renderWorkflow();
				break;
			case "goals":
				this.renderGoals();
				break;
			case "vault":
				this.renderVault();
				break;
			case "ollama":
				this.renderOllama();
				break;
			case "color":
				this.renderColor();
				break;
			case "email":
				this.renderEmail();
				break;
			case "telegram":
				this.renderTelegram();
				break;
			case "calendar":
				this.renderCalendar();
				break;
			case "done":
				this.renderDone();
				break;
		}
	}

	private renderHeader(): void {
		const wrap = this.contentEl.createDiv();
		wrap.style.display = "flex";
		wrap.style.justifyContent = "space-between";
		wrap.style.alignItems = "center";
		wrap.style.marginBottom = "16px";

		wrap.createEl("h2", { text: "🧠 Atlas — Setup" });

		const dots = wrap.createDiv();
		dots.style.display = "flex";
		dots.style.gap = "6px";
		const total = STEPS.length - 1; // skip "done"
		const idx = STEPS.indexOf(this.step);
		for (let i = 0; i < total; i++) {
			const dot = dots.createDiv();
			dot.style.width = "10px";
			dot.style.height = "10px";
			dot.style.borderRadius = "50%";
			dot.style.background =
				i < idx
					? "var(--interactive-accent)"
					: i === idx
						? "var(--interactive-accent-hover)"
						: "var(--background-modifier-border)";
		}
	}

	// ─── Step: welcome ───

	private renderWelcome(): void {
		const c = this.contentEl;
		c.createEl("h3", { text: "🧠 Bem-vindo ao Atlas" });
		c.createEl("p", {
			text: "Seu segundo cérebro local. Vamos personalizar tudo em ~5 min (sem terminal).",
		});

		const list = c.createEl("ul");
		[
			"👤 Seu perfil profissional (templates + tools customizados)",
			"⏰ Horário de trabalho + briefing matinal",
			"🎯 Suas prioridades de uso",
			"📁 Estrutura de pastas no vault",
			"🤖 Detectar/instalar Ollama (LLM local)",
			"🎨 Color theme",
			"📧 Email + 📱 Telegram + 🗓️ Calendar (opcionais)",
		].forEach((it) => list.createEl("li", { text: it }));

		c.createEl("p", {
			text: "Pode pular passos opcionais. Tudo configurável depois em Settings → Atlas.",
		}).style.opacity = "0.7";

		new Setting(c)
			.addButton((b) => b.setButtonText("Pular tudo").onClick(() => this.finish()))
			.addButton((b) =>
				b
					.setButtonText("Começar →")
					.setCta()
					.onClick(() => this.go("profile"))
			);
	}

	// ─── Step: profile (multi-select de 15 perfis) ───

	private renderProfile(): void {
		const c = this.contentEl;
		c.createEl("h3", { text: "👤 Qual é seu perfil profissional?" });
		c.createEl("p", {
			text: "Selecione 1+ perfis. Atlas adapta templates, ferramentas IA, frameworks e métricas.",
		}).style.fontSize = "12px";

		const selected = new Set<ProfileId>(this.plugin.settings.profile?.ids ?? []);

		for (const cat of PROFILE_CATEGORIES) {
			const catHead = c.createEl("div", { text: cat.label });
			catHead.style.fontSize = "10px";
			catHead.style.fontWeight = "bold";
			catHead.style.opacity = "0.7";
			catHead.style.marginTop = "12px";
			catHead.style.marginBottom = "6px";
			catHead.style.letterSpacing = "0.5px";

			const grid = c.createDiv();
			grid.style.display = "grid";
			grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(180px, 1fr))";
			grid.style.gap = "6px";

			for (const id of cat.ids) {
				const profile = PROFILES.find((p) => p.id === id);
				if (!profile) continue;

				const card = grid.createDiv();
				card.style.padding = "8px 10px";
				card.style.background = "var(--background-secondary)";
				card.style.borderRadius = "6px";
				card.style.cursor = "pointer";
				card.style.border = "2px solid transparent";
				card.style.transition = "border-color 120ms";

				const updateCardStyle = () => {
					if (selected.has(id)) {
						card.style.borderColor = "var(--interactive-accent)";
						card.style.background = "var(--background-modifier-hover)";
					} else {
						card.style.borderColor = "transparent";
						card.style.background = "var(--background-secondary)";
					}
				};
				updateCardStyle();

				const top = card.createDiv();
				top.style.display = "flex";
				top.style.alignItems = "center";
				top.style.gap = "8px";
				top.createEl("span", { text: profile.emoji }).style.fontSize = "18px";
				const nameEl = top.createEl("div", { text: profile.name });
				nameEl.style.fontSize = "12px";
				nameEl.style.fontWeight = "bold";

				const tag = card.createEl("div", { text: profile.tagline });
				tag.style.fontSize = "10px";
				tag.style.opacity = "0.7";
				tag.style.marginTop = "2px";

				card.addEventListener("click", () => {
					if (selected.has(id)) selected.delete(id);
					else selected.add(id);
					updateCardStyle();
				});
			}
		}

		const summary = c.createEl("div");
		summary.style.marginTop = "16px";
		summary.style.padding = "8px";
		summary.style.background = "var(--background-secondary-alt)";
		summary.style.borderRadius = "4px";
		summary.style.fontSize = "11px";
		summary.style.minHeight = "32px";

		const updateSummary = () => {
			if (selected.size === 0) {
				summary.setText("Selecione pelo menos 1 perfil para personalizar Atlas.");
				summary.style.opacity = "0.6";
			} else {
				const merged = mergeProfiles(Array.from(selected));
				summary.setText(
					`✓ ${selected.size} perfil(is) selecionado(s) → ${merged.templates.length} templates, ${merged.tools.length} tools IA, ${merged.frameworks.length} frameworks habilitados.`
				);
				summary.style.opacity = "1";
			}
		};
		updateSummary();

		// Re-render summary on click — simplest: re-render whole step
		const refresh = () => {
			updateSummary();
		};
		c.addEventListener("click", refresh);

		new Setting(c)
			.addButton((b) => b.setButtonText("← Voltar").onClick(() => this.go("welcome")))
			.addButton((b) =>
				b
					.setButtonText("Continuar →")
					.setCta()
					.onClick(async () => {
						if (selected.size === 0) {
							new Notice("Atlas: escolha pelo menos 1 perfil.");
							return;
						}
						this.plugin.settings.profile = {
							...this.plugin.settings.profile,
							ids: Array.from(selected),
						};
						// Apply profile defaults
						const merged = mergeProfiles(Array.from(selected));
						this.plugin.settings.schedules.morningBriefingTime = merged.defaults.briefingTime;
						this.plugin.settings.schedules.eveningReviewTime = merged.defaults.eveningReviewTime;
						this.plugin.settings.schedules.weeklyReportTime = merged.defaults.weeklyTime;
						this.plugin.settings.schedules.weeklyReportDay = dayNameToNum(merged.defaults.weeklyDay);
						this.plugin.settings.notifications.minimumSeverity = merged.defaults.notificationSeverity;
						this.plugin.settings.profile.colorAccent = merged.defaults.colorAccent;
						await this.plugin.saveSettings();
						this.go("workflow");
					})
			);
	}

	// ─── Step: workflow (horário trabalho) ───

	private renderWorkflow(): void {
		const c = this.contentEl;
		c.createEl("h3", { text: "⏰ Seu ritmo de trabalho" });
		c.createEl("p", {
			text: "Quando você quer briefing matinal e evening review? Atlas avisa só nessas janelas.",
		}).style.fontSize = "12px";

		const sched = this.plugin.settings.schedules;

		const morningSetting = new Setting(c)
			.setName("Briefing matinal")
			.setDesc("Resumo do dia: agenda, tasks, alertas");
		morningSetting.addText((t) => {
			t.setPlaceholder("HH:mm")
				.setValue(sched.morningBriefingTime)
				.onChange(async (v) => {
					sched.morningBriefingTime = v;
					await this.plugin.saveSettings();
				});
		});

		const eveningSetting = new Setting(c)
			.setName("Evening review")
			.setDesc("Lembrete de daily log + reflexão");
		eveningSetting.addText((t) => {
			t.setPlaceholder("HH:mm")
				.setValue(sched.eveningReviewTime)
				.onChange(async (v) => {
					sched.eveningReviewTime = v;
					await this.plugin.saveSettings();
				});
		});

		const weeklySetting = new Setting(c)
			.setName("Weekly report")
			.setDesc("Quando Atlas gera draft pra você revisar");
		weeklySetting.addDropdown((d) => {
			d.addOption("0", "Domingo");
			d.addOption("1", "Segunda");
			d.addOption("2", "Terça");
			d.addOption("3", "Quarta");
			d.addOption("4", "Quinta");
			d.addOption("5", "Sexta");
			d.addOption("6", "Sábado");
			d.setValue(String(sched.weeklyReportDay));
			d.onChange(async (v) => {
				sched.weeklyReportDay = Number.parseInt(v, 10);
				await this.plugin.saveSettings();
			});
		});
		weeklySetting.addText((t) => {
			t.setPlaceholder("HH:mm")
				.setValue(sched.weeklyReportTime)
				.onChange(async (v) => {
					sched.weeklyReportTime = v;
					await this.plugin.saveSettings();
				});
		});

		const quietSetting = new Setting(c)
			.setName("Quiet hours")
			.setDesc("Atlas não notifica nesse intervalo");
		quietSetting.addText((t) => {
			t.setPlaceholder("Início HH:mm")
				.setValue(sched.quietHoursStart)
				.onChange(async (v) => {
					sched.quietHoursStart = v;
					await this.plugin.saveSettings();
				});
		});
		quietSetting.addText((t) => {
			t.setPlaceholder("Fim HH:mm")
				.setValue(sched.quietHoursEnd)
				.onChange(async (v) => {
					sched.quietHoursEnd = v;
					await this.plugin.saveSettings();
				});
		});

		new Setting(c)
			.addButton((b) => b.setButtonText("← Voltar").onClick(() => this.go("profile")))
			.addButton((b) =>
				b.setButtonText("Continuar →").setCta().onClick(() => this.go("goals"))
			);
	}

	// ─── Step: goals (primeira tarefa de valor) ───

	private renderGoals(): void {
		const c = this.contentEl;
		c.createEl("h3", { text: "🎯 O que mais te ajudaria primeiro?" });
		c.createEl("p", {
			text: "Atlas vai te guiar nessa task antes de tudo. Pode mudar depois.",
		}).style.fontSize = "12px";

		const goals = [
			{ id: "weekly-report", icon: "📊", label: "Weekly report automático", tour: "weekly-report" },
			{ id: "1on1-prep", icon: "🤝", label: "Preparar 1:1 / coaching", tour: "one-on-one" },
			{ id: "research", icon: "📚", label: "Pesquisa/estudo + flashcards", tour: "flashcards" },
			{ id: "personal", icon: "🌿", label: "Organização pessoal/journaling", tour: "first-steps" },
		];

		for (const g of goals) {
			const card = c.createDiv();
			card.style.padding = "12px 14px";
			card.style.marginBottom = "6px";
			card.style.background = "var(--background-secondary)";
			card.style.borderRadius = "6px";
			card.style.cursor = "pointer";
			card.style.display = "flex";
			card.style.alignItems = "center";
			card.style.gap = "12px";

			const iconEl = card.createEl("span", { text: g.icon });
			iconEl.style.fontSize = "22px";

			const labelEl = card.createEl("div", { text: g.label });
			labelEl.style.fontSize = "13px";
			labelEl.style.fontWeight = "500";

			card.addEventListener("click", async () => {
				// Salva goal + dispara tour após onboarding (em settings.profile como extensão)
				if (!this.plugin.settings.profile) {
					this.plugin.settings.profile = { ids: [] };
				}
				(this.plugin.settings.profile as Record<string, unknown>).initialGoal = g.id;
				await this.plugin.saveSettings();
				this.go("vault");
			});
			card.addEventListener("mouseenter", () => {
				card.style.background = "var(--background-modifier-hover)";
			});
			card.addEventListener("mouseleave", () => {
				card.style.background = "var(--background-secondary)";
			});
		}

		new Setting(c)
			.addButton((b) => b.setButtonText("← Voltar").onClick(() => this.go("workflow")))
			.addButton((b) => b.setButtonText("Pular →").onClick(() => this.go("vault")));
	}

	// ─── Step: color (theme accent) ───

	private renderColor(): void {
		const c = this.contentEl;
		c.createEl("h3", { text: "🎨 Color theme" });
		c.createEl("p", {
			text: "Cor accent do Atlas. Aplica em badges, botões, headers da sidebar.",
		}).style.fontSize = "12px";

		const grid = c.createDiv();
		grid.style.display = "grid";
		grid.style.gridTemplateColumns = "repeat(5, 1fr)";
		grid.style.gap = "10px";
		grid.style.marginBottom = "16px";

		const profile = this.plugin.settings.profile;
		const currentAccent =
			profile?.colorAccent ?? "#6366f1";

		for (const preset of COLOR_PRESETS) {
			const swatch = grid.createDiv();
			swatch.style.height = "70px";
			swatch.style.borderRadius = "8px";
			swatch.style.background = preset.hex;
			swatch.style.cursor = "pointer";
			swatch.style.border = currentAccent === preset.hex ? "3px solid var(--text-normal)" : "3px solid transparent";
			swatch.style.position = "relative";
			swatch.title = preset.label;

			const lbl = swatch.createEl("div", { text: preset.label });
			lbl.style.position = "absolute";
			lbl.style.bottom = "4px";
			lbl.style.left = "8px";
			lbl.style.fontSize = "10px";
			lbl.style.color = "white";
			lbl.style.fontWeight = "bold";
			lbl.style.textShadow = "0 1px 2px rgba(0,0,0,0.5)";

			swatch.addEventListener("click", async () => {
				if (!this.plugin.settings.profile) {
					this.plugin.settings.profile = { ids: [] };
				}
				this.plugin.settings.profile.colorAccent = preset.hex;
				await this.plugin.saveSettings();
				this.go("color"); // re-render to update selection
			});
		}

		c.createEl("p", {
			text: "Pode trocar depois em Settings → Atlas → Profile.",
		}).style.fontSize = "11px";

		new Setting(c)
			.addButton((b) => b.setButtonText("← Voltar").onClick(() => this.go("ollama")))
			.addButton((b) =>
				b.setButtonText("Continuar →").setCta().onClick(() => this.go("email"))
			);
	}

	// ─── Step: calendar (iCal URL opcional) ───

	private renderCalendar(): void {
		const c = this.contentEl;
		c.createEl("h3", { text: "🗓️ Calendar (opcional)" });
		c.createEl("p", {
			text: "Cole URL de iCal (.ics) do Google Calendar / Outlook. Atlas puxa eventos do dia pro Today widget + pré-meeting nudges.",
		}).style.fontSize = "12px";

		const help = c.createEl("details");
		help.createEl("summary", { text: "Como pegar URL do meu calendar?" }).style.fontSize = "11px";
		const helpBody = help.createEl("div");
		helpBody.style.fontSize = "11px";
		helpBody.style.padding = "8px";
		helpBody.style.opacity = "0.85";
		const lines: { strong: string; rest: string }[] = [
			{ strong: "Google Calendar:", rest: ' Settings → Integrate calendar → "Secret address in iCal format"' },
			{ strong: "Outlook:", rest: " Calendar → Share → Publish → ICS link" },
			{ strong: "Apple Calendar:", rest: " Calendar → Share Calendar → Public Calendar" },
		];
		for (const ln of lines) {
			const row = helpBody.createDiv();
			row.createEl("strong", { text: ln.strong });
			row.appendText(ln.rest);
		}

		new Setting(c)
			.setName("URL iCal")
			.setDesc("Opcional. Configurável depois em Settings.")
			.addText((t) => {
				t.setPlaceholder("https://calendar.google.com/calendar/ical/.../basic.ics")
					.setValue(this.plugin.settings.profile?.calendarUrl ?? "")
					.onChange(async (v) => {
						if (!this.plugin.settings.profile) {
							this.plugin.settings.profile = { ids: [] };
						}
						this.plugin.settings.profile.calendarUrl = v.trim();
						await this.plugin.saveSettings();
					});
				t.inputEl.style.width = "100%";
			});

		new Setting(c)
			.addButton((b) => b.setButtonText("← Voltar").onClick(() => this.go("telegram")))
			.addButton((b) =>
				b.setButtonText("Continuar →").setCta().onClick(() => this.go("done"))
			);
	}

	// ─── Step: vault ───

	private renderVault(): void {
		const c = this.contentEl;
		c.createEl("h3", { text: "📁 Estrutura do vault" });

		const isCreated = this.plugin.settings.vaultStructureCreated;
		c.createEl("p", {
			text: isCreated
				? "Pastas já estão criadas. Vou aplicar templates faltantes."
				: "Vou criar 30+ pastas (Daily, Meetings, Projects, People, RAID, etc.) e copiar 17 templates ricos.",
		});

		const log = c.createEl("pre");
		log.style.fontSize = "11px";
		log.style.maxHeight = "150px";
		log.style.overflow = "auto";
		log.style.background = "var(--background-secondary)";
		log.style.padding = "8px";
		log.style.borderRadius = "4px";
		log.style.display = "none";

		new Setting(c).addText((t) => {
			t.setPlaceholder("Seu nome (opcional)")
				.setValue(this.plugin.settings.user.displayName)
				.onChange(async (v) => {
					this.plugin.settings.user.displayName = v;
					await this.plugin.saveSettings();
				});
			t.inputEl.style.width = "100%";
		});

		new Setting(c).addText((t) => {
			t.setPlaceholder("Seu cargo (opcional)")
				.setValue(this.plugin.settings.user.role)
				.onChange(async (v) => {
					this.plugin.settings.user.role = v;
					await this.plugin.saveSettings();
				});
			t.inputEl.style.width = "100%";
		});

		const actions = new Setting(c);
		actions.addButton((b) =>
			b.setButtonText("← Voltar").onClick(() => this.go("goals"))
		);
		actions.addButton((b) =>
			b
				.setButtonText("Criar estrutura + templates")
				.setCta()
				.onClick(async () => {
					b.setDisabled(true);
					b.setButtonText("Criando...");
					log.style.display = "block";
					log.setText("Criando pastas...");
					try {
						await setupVaultStructure(this.plugin);
						log.setText(log.getText() + "\n✓ Pastas OK\nCopiando templates...");
						const r = await applyTemplatesToVault(this.plugin);
						log.setText(
							log.getText() +
								`\n✓ ${r.created} templates criados, ${r.skipped} já existiam`
						);
						setTimeout(() => this.go("ollama"), 800);
					} catch (e) {
						log.setText(`Erro: ${String(e)}`);
						b.setDisabled(false);
						b.setButtonText("Tentar de novo");
					}
				})
		);
		actions.addButton((b) =>
			b.setButtonText("Pular →").onClick(() => this.go("ollama"))
		);
	}

	// ─── Step: ollama ───

	private renderOllama(): void {
		const c = this.contentEl;
		c.createEl("h3", { text: "🤖 Ollama — LLM local" });
		c.createEl("p", {
			text: "Atlas usa Ollama (gratuito, local, privado) para rodar modelos no seu computador. Vamos detectar.",
		});

		// RAM detection block
		const sys = detectSystemInfo();
		const rec = recommendationForProfile(sys.profile);
		this.plugin.settings.onboarding.ramProfile = sys.profile;
		this.plugin.settings.ollama.generationModel = rec.generationModel;
		this.plugin.settings.ollama.smallModel = rec.smallModel;
		this.plugin.settings.performance.reasoningModeAvailable = rec.reasoningModelHeavy;
		this.plugin.settings.performance.visionOptInAvailable = rec.visionAvailable;
		void this.plugin.saveSettings();

		const ramBox = c.createEl("div");
		ramBox.style.padding = "10px";
		ramBox.style.background = "var(--background-secondary)";
		ramBox.style.borderRadius = "6px";
		ramBox.style.marginBottom = "8px";
		ramBox.style.fontSize = "12px";
		const ramLabel = ramBox.createEl("div");
		ramLabel.style.fontWeight = "bold";
		ramLabel.setText(
			`💻 Sistema detectado: ${sys.totalRamGB} GB RAM · ${sys.cpuCount} cores · ${sys.platform}`
		);
		const profileBadge = ramBox.createEl("div");
		profileBadge.style.marginTop = "4px";
		profileBadge.setText(`Perfil: ${rec.profile.toUpperCase()}`);
		profileBadge.style.color =
			rec.profile === "power" ? "#2e7d32" : rec.profile === "balanced" ? "#f57c00" : "#1976d2";
		profileBadge.style.fontWeight = "bold";

		const notes = ramBox.createEl("ul");
		notes.style.fontSize = "11px";
		notes.style.opacity = "0.85";
		notes.style.margin = "4px 0";
		notes.style.paddingLeft = "20px";
		for (const n of rec.notes) {
			notes.createEl("li", { text: n });
		}

		const status = c.createEl("div");
		status.style.padding = "12px";
		status.style.background = "var(--background-secondary)";
		status.style.borderRadius = "6px";
		status.style.marginBottom = "12px";
		status.setText("Verificando Ollama...");

		void this.detectOllama(status);

		c.createEl("p", {
			text: "Se não tiver, baixe em ollama.com (instalador `.dmg` / `.exe` / Linux package). Volte aqui depois.",
		}).style.fontSize = "13px";

		new Setting(c)
			.addButton((b) => b.setButtonText("← Voltar").onClick(() => this.go("vault")))
			.addButton((b) =>
				b
					.setButtonText("Verificar de novo")
					.onClick(() => this.detectOllama(status))
			)
			.addButton((b) =>
				b
					.setButtonText("Próximo →")
					.setCta()
					.onClick(() => this.go("color"))
			);
	}

	private async detectOllama(statusEl: HTMLElement): Promise<void> {
		statusEl.setText("⏳ Detectando Ollama...");
		const ok = await this.plugin.ollama.ping();
		if (!ok) {
			statusEl.setText(
				"❌ Ollama offline. Baixe e instale em https://ollama.com — depois clique 'Verificar de novo'."
			);
			this.plugin.settings.onboarding.ollamaDetected = false;
			void this.plugin.saveSettings();
			return;
		}

		const models = await this.plugin.ollama.listModels();
		this.plugin.settings.onboarding.ollamaDetected = true;
		void this.plugin.saveSettings();

		const wantedModels = [
			this.plugin.settings.ollama.generationModel,
			this.plugin.settings.ollama.embeddingModel,
		];
		const missing = wantedModels.filter(
			(w) => !models.some((m) => m === w || m.startsWith(w.split(":")[0] + ":"))
		);

		if (missing.length === 0) {
			statusEl.setText(`✅ Ollama OK · ${models.length} modelos · qwen2.5 + bge-m3 prontos.`);
			this.plugin.settings.onboarding.modelsDownloaded = true;
			void this.plugin.saveSettings();
			return;
		}

		statusEl.setText(`⚠️ Ollama OK mas faltam modelos: ${missing.join(", ")}`);

		const btn = statusEl.createEl("button", {
			text: `Baixar ${missing.join(" + ")}`,
		});
		btn.style.marginTop = "8px";
		btn.style.padding = "6px 12px";
		btn.addEventListener("click", () => void this.pullModels(missing, statusEl));
	}

	private async pullModels(models: string[], statusEl: HTMLElement): Promise<void> {
		statusEl.empty();
		const log = statusEl.createEl("pre");
		log.style.maxHeight = "200px";
		log.style.overflow = "auto";
		log.style.fontSize = "11px";

		for (const m of models) {
			log.setText(log.getText() + `\nBaixando ${m}...`);
			try {
				await this.plugin.ollama.pullModel(m, (status, pct) => {
					const last = log.getText().split("\n").pop() ?? "";
					if (last.startsWith("Baixando")) {
						const lines = log.getText().split("\n");
						lines[lines.length - 1] = `Baixando ${m}: ${status} ${pct.toFixed(0)}%`;
						log.setText(lines.join("\n"));
					}
				});
				log.setText(log.getText() + `\n✓ ${m} pronto`);
			} catch (e) {
				log.setText(log.getText() + `\n❌ ${m} falhou: ${String(e)}`);
			}
		}
		this.plugin.settings.onboarding.modelsDownloaded = true;
		void this.plugin.saveSettings();
		log.setText(log.getText() + "\n\n✅ Concluído. Clique 'Próximo' para continuar.");
	}

	// ─── Step: email ───

	private renderEmail(): void {
		const c = this.contentEl;
		c.createEl("h3", { text: "📧 Email (opcional)" });
		c.createEl("p", {
			text: "Atlas pode enviar weekly reports e briefings por email. Para Gmail, gere um App Password em myaccount.google.com → Security → 2-step → App Passwords.",
		});

		new Setting(c).setName("Habilitar email").addToggle((t) =>
			t.setValue(this.plugin.settings.email.enabled).onChange(async (v) => {
				this.plugin.settings.email.enabled = v;
				await this.plugin.saveSettings();
			})
		);

		new Setting(c).setName("SMTP host").addText((t) => {
			t.setValue(this.plugin.settings.email.smtpHost)
				.setPlaceholder("smtp.gmail.com")
				.onChange(async (v) => {
					this.plugin.settings.email.smtpHost = v;
					await this.plugin.saveSettings();
				});
			t.inputEl.style.width = "100%";
		});

		new Setting(c).setName("SMTP user (email completo)").addText((t) => {
			t.setValue(this.plugin.settings.email.smtpUser).onChange(async (v) => {
				this.plugin.settings.email.smtpUser = v;
				this.plugin.settings.email.fromAddress = v;
				await this.plugin.saveSettings();
			});
			t.inputEl.style.width = "100%";
		});

		new Setting(c).setName("App Password (nunca em texto claro depois)").addText((t) => {
			t.setPlaceholder("xxxx xxxx xxxx xxxx").onChange(async (v) => {
				if (v) {
					const enc = encryptLight(v.replace(/\s/g, ""), this.app.vault.getName());
					this.plugin.settings.email.smtpPasswordEncrypted = enc;
					await this.plugin.saveSettings();
				}
			});
			t.inputEl.type = "password";
			t.inputEl.style.width = "100%";
		});

		new Setting(c)
			.setName("Destinatários default — weekly report")
			.setDesc("Separe por vírgula.")
			.addTextArea((t) => {
				t.setValue(this.plugin.settings.email.defaultRecipientsWeekly).onChange(
					async (v) => {
						this.plugin.settings.email.defaultRecipientsWeekly = v;
						await this.plugin.saveSettings();
					}
				);
				t.inputEl.style.width = "100%";
			});

		new Setting(c)
			.addButton((b) => b.setButtonText("← Voltar").onClick(() => this.go("color")))
			.addButton((b) =>
				b.setButtonText("Testar SMTP").onClick(async () => {
					new Notice("Atlas: testando...");
					// Trigger via Obsidian internal API (cast required)
					const apiAny = this.app as unknown as { commands?: { executeCommandById?: (id: string) => void } };
					apiAny.commands?.executeCommandById?.("atlas:test-email");
				})
			)
			.addButton((b) =>
				b
					.setButtonText("Próximo →")
					.setCta()
					.onClick(() => this.go("telegram"))
			);
	}

	// ─── Step: telegram ───

	private renderTelegram(): void {
		const c = this.contentEl;
		c.createEl("h3", { text: "📱 Notificações mobile (opcional)" });
		c.createEl("p", {
			text: "Atlas pode enviar push para seu celular via bot Telegram. Setup em 1 minuto:",
		});

		const list = c.createEl("ol");
		list.createEl("li", {
			text: "Abra @BotFather no Telegram → /newbot → escolha nome → guarde o TOKEN",
		});
		list.createEl("li", {
			text: "Mande qualquer mensagem para o bot que você criou",
		});
		list.createEl("li", {
			text: "Acesse https://api.telegram.org/bot<TOKEN>/getUpdates → veja seu chat_id",
		});

		new Setting(c).setName("Habilitar Telegram").addToggle((t) =>
			t.setValue(this.plugin.settings.notifications.telegramEnabled).onChange(async (v) => {
				this.plugin.settings.notifications.telegramEnabled = v;
				await this.plugin.saveSettings();
			})
		);

		new Setting(c).setName("Bot token").addText((t) => {
			t.setValue(this.plugin.settings.notifications.telegramBotToken).onChange(async (v) => {
				this.plugin.settings.notifications.telegramBotToken = v;
				await this.plugin.saveSettings();
			});
			t.inputEl.type = "password";
			t.inputEl.style.width = "100%";
		});

		new Setting(c).setName("Chat ID").addText((t) => {
			t.setValue(this.plugin.settings.notifications.telegramChatId).onChange(async (v) => {
				this.plugin.settings.notifications.telegramChatId = v;
				await this.plugin.saveSettings();
			});
			t.inputEl.style.width = "100%";
		});

		new Setting(c)
			.addButton((b) => b.setButtonText("← Voltar").onClick(() => this.go("email")))
			.addButton((b) =>
				b.setButtonText("Testar").onClick(async () => {
					const r = await this.plugin.notifier.testTelegram();
					new Notice(r.ok ? "Telegram OK ✓" : `Falhou: ${r.error}`);
				})
			)
			.addButton((b) =>
				b
					.setButtonText("Próximo →")
					.setCta()
					.onClick(() => this.go("calendar"))
			);
	}

	// ─── Step: done ───

	private renderDone(): void {
		const c = this.contentEl;
		c.createEl("h3", { text: "✨ Pronto!" });
		c.createEl("p", {
			text: "Atlas está configurado. Aqui estão os atalhos essenciais:",
		});

		const list = c.createEl("ul");
		[
			["Cmd+Shift+A", "Quick Capture (em qualquer app)"],
			["Cmd+Shift+J", "Atlas Chat"],
			["Cmd+Shift+K", "Buscar no vault (hybrid search)"],
			["Cmd+Shift+F", "Focus Mode 90 min"],
			["Status bar", "Click pra alternar Work/Coach mode"],
		].forEach(([k, v]) => {
			const li = list.createEl("li");
			li.createEl("kbd", { text: k });
			li.appendText(` — ${v}`);
		});

		c.createEl("p", {
			text: "Próximos passos sugeridos:",
		});
		const list2 = c.createEl("ol");
		list2.createEl("li", {
			text: "Crie seu primeiro Daily log (Command Palette → 'Atlas: Daily log')",
		});
		list2.createEl("li", {
			text: "Indexe seu vault para alimentar o Knowledge Graph (após ter algumas notas)",
		});
		list2.createEl("li", { text: "Abra o Chat e pergunte qualquer coisa" });

		new Setting(c).addButton((b) =>
			b
				.setButtonText("Concluir 🎉")
				.setCta()
				.onClick(() => this.finish())
		);
	}
}
