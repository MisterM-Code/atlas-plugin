import { App, Modal, Notice, Setting } from "obsidian";
import type AtlasPlugin from "../../main";
import { setupVaultStructure } from "../commands/setup-vault";
import { applyTemplatesToVault } from "../commands/apply-templates";
import { encryptLight } from "../utils/crypto-light";
import { detectSystemInfo, recommendationForProfile } from "../utils/system-info";
import { applyResponsiveModal } from "../ui/modal-helpers";
import { PROFILES, PROFILE_CATEGORIES, ProfileId, mergeProfiles } from "../profiles/registry";

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
		// v0.16: open Tabs Tour modal — overview de todas as 17 funcionalidades
		if (!this.plugin.settings.onboarding.tabsTourSeen) {
			setTimeout(async () => {
				try {
					const m = await import("../ui/tabs-tour-modal");
					new m.TabsTourModal(this.plugin.app, this.plugin).open();
				} catch {
					// silent fallback if module fails to load
				}
			}, 600);
		}
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
		const wrap = this.contentEl.createDiv({ cls: "atlas-onboarding-header" });
		wrap.createEl("h2", { text: "🧠 Atlas — Setup" });

		const dots = wrap.createDiv({ cls: "atlas-onboarding-progress-dots" });
		const total = STEPS.length - 1; // skip "done"
		const idx = STEPS.indexOf(this.step);
		for (let i = 0; i < total; i++) {
			let cls = "atlas-onboarding-progress-dot";
			if (i < idx) cls += " is-done";
			else if (i === idx) cls += " is-current";
			dots.createDiv({ cls });
		}
	}

	// ─── Step: welcome ───

	private renderWelcome(): void {
		const c = this.contentEl;
		c.addClass("atlas-onboarding-welcome-v2");

		c.createEl("h2", {
			cls: "atlas-onboarding-welcome-title",
			text: "🌌 Bem-vindo ao Atlas",
		});
		c.createEl("p", {
			cls: "atlas-onboarding-welcome-tagline",
			text: "Seu segundo cérebro local. Ele captura, conecta, lembra, executa. Você fala, ele faz.",
		});

		// v0.45: Capabilities showcase — 4 cards com exemplos real
		const showcaseTitle = c.createEl("div", {
			cls: "atlas-onboarding-showcase-title",
			text: "✨ O QUE ATLAS FAZ",
		});
		void showcaseTitle;

		const grid = c.createDiv({ cls: "atlas-onboarding-showcase-grid" });

		const cards = [
			{
				emoji: "💬",
				title: "Comandos rápidos",
				desc: "Chat ou voz pegando contexto",
				examples: [
					'"PIX com problema" → linka ao Sistema PIX',
					'"Miguel faltou hoje" → action item',
					'"lembrar reunião sexta 14h"',
				],
			},
			{
				emoji: "📊",
				title: "Relatórios automáticos",
				desc: "Agrega vault inteiro",
				examples: [
					'"gere relatório de todos 1:1 com Miguel"',
					'"email sobre sistemas da semana"',
					'"year in review" → spotify-wrapped',
				],
			},
			{
				emoji: "🤖",
				title: "Multi-agent IA",
				desc: "Local grátis ou cloud premium",
				examples: [
					"Researcher (KG + vault search)",
					"Writer (relatórios markdown)",
					"Reasoning (CoT — DACI/RAID)",
				],
			},
			{
				emoji: "🎙️",
				title: "Voz natural (Jarvis)",
				desc: "Cmd+Shift+J abre Jarvis",
				examples: [
					'"Atlas, criar pessoa João"',
					'"Atlas, próximo um a um"',
					'"Atlas, daily log"',
				],
			},
		];

		for (const card of cards) {
			const cardEl = grid.createDiv({ cls: "atlas-onboarding-showcase-card" });
			const top = cardEl.createDiv({ cls: "atlas-onboarding-showcase-card-top" });
			top.createSpan({
				cls: "atlas-onboarding-showcase-emoji",
				text: card.emoji,
			});
			const wrap = top.createDiv();
			wrap.createDiv({
				cls: "atlas-onboarding-showcase-title-text",
				text: card.title,
			});
			wrap.createDiv({
				cls: "atlas-onboarding-showcase-desc",
				text: card.desc,
			});
			const list = cardEl.createEl("ul", { cls: "atlas-onboarding-showcase-list" });
			for (const ex of card.examples) {
				list.createEl("li", { text: ex });
			}
		}

		// Token economy promise
		const tokenBadge = c.createDiv({ cls: "atlas-onboarding-token-badge" });
		tokenBadge.createSpan({ text: "💰 " });
		tokenBadge.createSpan({
			cls: "atlas-onboarding-token-badge-bold",
			text: "80% das ações = $0",
		});
		tokenBadge.createSpan({
			text: " (heurística + KG). IA só pra extração nova, relatórios e disambiguation.",
		});

		// Setup steps preview
		const stepsList = c.createDiv({ cls: "atlas-onboarding-steps-preview" });
		stepsList.createDiv({
			cls: "atlas-onboarding-steps-preview-title",
			text: "Configurar em ~5 min:",
		});
		const stepsUl = stepsList.createEl("ul");
		[
			"👤 Perfil profissional (15 templates curados)",
			"⏰ Horário de trabalho + briefings",
			"📁 Estrutura de pastas no vault",
			"🤖 Ollama (LLM local) — detecta/instala",
			"📧 Email + 📱 Telegram + 🗓️ Calendar (opcionais)",
		].forEach((it) => stepsUl.createEl("li", { text: it }));

		c.createEl("p", {
			text: "Pode pular qualquer passo. Tudo configurável depois em Settings → Atlas.",
			cls: "atlas-onboarding-hint",
		});

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
			cls: "atlas-onboarding-section-desc",
		});

		const selected = new Set<ProfileId>(this.plugin.settings.profile?.ids ?? []);

		for (const cat of PROFILE_CATEGORIES) {
			c.createEl("div", { cls: "atlas-onboarding-cat-head", text: cat.label });
			const grid = c.createDiv({ cls: "atlas-onboarding-grid" });

			for (const id of cat.ids) {
				const profile = PROFILES.find((p) => p.id === id);
				if (!profile) continue;

				const card = grid.createDiv({ cls: "atlas-onboarding-card" });

				const updateCardStyle = () => {
					if (selected.has(id)) card.addClass("is-selected");
					else card.removeClass("is-selected");
				};
				updateCardStyle();

				const top = card.createDiv({ cls: "atlas-onboarding-card-top" });
				top.createEl("span", { cls: "atlas-onboarding-card-emoji", text: profile.emoji });
				top.createEl("div", { cls: "atlas-onboarding-card-name", text: profile.name });

				card.createEl("div", { cls: "atlas-onboarding-card-tag", text: profile.tagline });

				card.addEventListener("click", () => {
					if (selected.has(id)) selected.delete(id);
					else selected.add(id);
					updateCardStyle();
				});
			}
		}

		const summary = c.createEl("div", { cls: "atlas-onboarding-summary" });

		const updateSummary = () => {
			if (selected.size === 0) {
				summary.setText("Selecione pelo menos 1 perfil para personalizar Atlas.");
				summary.addClass("is-empty");
			} else {
				summary.removeClass("is-empty");
				const merged = mergeProfiles(Array.from(selected));
				summary.setText(
					`✓ ${selected.size} perfil(is) selecionado(s) → ${merged.templates.length} templates, ${merged.tools.length} tools IA, ${merged.frameworks.length} frameworks habilitados.`
				);
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
			cls: "atlas-onboarding-section-desc",
		});

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
			cls: "atlas-onboarding-section-desc",
		});

		const goals = [
			{ id: "weekly-report", icon: "📊", label: "Weekly report automático", tour: "weekly-report" },
			{ id: "1on1-prep", icon: "🤝", label: "Preparar 1:1 / coaching", tour: "one-on-one" },
			{ id: "research", icon: "📚", label: "Pesquisa/estudo + flashcards", tour: "flashcards" },
			{ id: "personal", icon: "🌿", label: "Organização pessoal/journaling", tour: "first-steps" },
		];

		for (const g of goals) {
			const card = c.createDiv({ cls: "atlas-onboarding-goal-row" });
			card.createEl("span", { cls: "atlas-onboarding-goal-row-icon", text: g.icon });
			card.createEl("div", { cls: "atlas-onboarding-goal-row-label", text: g.label });

			card.addEventListener("click", async () => {
				// Salva goal + dispara tour após onboarding (em settings.profile como extensão)
				if (!this.plugin.settings.profile) {
					this.plugin.settings.profile = { ids: [] };
				}
				(this.plugin.settings.profile as Record<string, unknown>).initialGoal = g.id;
				await this.plugin.saveSettings();
				this.go("vault");
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
			cls: "atlas-onboarding-section-desc",
		});

		const grid = c.createDiv({ cls: "atlas-onboarding-color-grid" });

		const profile = this.plugin.settings.profile;
		const currentAccent = profile?.colorAccent ?? "#6366f1";

		for (const preset of COLOR_PRESETS) {
			const isSelected = currentAccent === preset.hex;
			const swatch = grid.createDiv({
				cls: isSelected
					? "atlas-onboarding-color-tile is-selected"
					: "atlas-onboarding-color-tile",
			});
			swatch.style.setProperty("background", preset.hex);
			swatch.title = preset.label;

			swatch.createEl("div", { cls: "atlas-onboarding-color-label", text: preset.label });

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
			cls: "atlas-onboarding-hint-small",
		});

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
			cls: "atlas-onboarding-section-desc",
		});

		const help = c.createEl("details");
		help.createEl("summary", { cls: "atlas-onboarding-help-summary", text: "Como pegar URL do meu calendar?" });
		const helpBody = help.createEl("div", { cls: "atlas-onboarding-help-body" });
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
				t.inputEl.addClass("atlas-onboarding-input-full");
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

		const log = c.createEl("pre", { cls: "atlas-onboarding-log" });

		new Setting(c).addText((t) => {
			t.setPlaceholder("Seu nome (opcional)")
				.setValue(this.plugin.settings.user.displayName)
				.onChange(async (v) => {
					this.plugin.settings.user.displayName = v;
					await this.plugin.saveSettings();
				});
			t.inputEl.addClass("atlas-onboarding-input-full");
		});

		new Setting(c).addText((t) => {
			t.setPlaceholder("Seu cargo (opcional)")
				.setValue(this.plugin.settings.user.role)
				.onChange(async (v) => {
					this.plugin.settings.user.role = v;
					await this.plugin.saveSettings();
				});
			t.inputEl.addClass("atlas-onboarding-input-full");
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
					log.addClass("is-shown");
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

		const ramBox = c.createEl("div", { cls: "atlas-onboarding-ram-box" });
		ramBox.createEl("div", {
			cls: "atlas-onboarding-ram-label",
			text: `💻 Sistema detectado: ${sys.totalRamGB} GB RAM · ${sys.cpuCount} cores · ${sys.platform}`,
		});
		ramBox.createEl("div", {
			cls: `atlas-onboarding-ram-profile is-${rec.profile}`,
			text: `Perfil: ${rec.profile.toUpperCase()}`,
		});

		const notes = ramBox.createEl("ul", { cls: "atlas-onboarding-ram-notes" });
		for (const n of rec.notes) {
			notes.createEl("li", { text: n });
		}

		const status = c.createEl("div", { cls: "atlas-onboarding-ollama-status" });
		status.setText("Verificando Ollama...");

		void this.detectOllama(status);

		c.createEl("p", {
			text: "Se não tiver, baixe em ollama.com (instalador `.dmg` / `.exe` / Linux package). Volte aqui depois.",
			cls: "atlas-onboarding-ollama-hint",
		});

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
			cls: "atlas-onboarding-ollama-pull-btn",
			text: `Baixar ${missing.join(" + ")}`,
		});
		btn.addEventListener("click", () => void this.pullModels(missing, statusEl));
	}

	private async pullModels(models: string[], statusEl: HTMLElement): Promise<void> {
		statusEl.empty();
		const log = statusEl.createEl("pre", { cls: "atlas-onboarding-pull-log" });

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
			t.inputEl.addClass("atlas-onboarding-input-full");
		});

		new Setting(c).setName("SMTP user (email completo)").addText((t) => {
			t.setValue(this.plugin.settings.email.smtpUser).onChange(async (v) => {
				this.plugin.settings.email.smtpUser = v;
				this.plugin.settings.email.fromAddress = v;
				await this.plugin.saveSettings();
			});
			t.inputEl.addClass("atlas-onboarding-input-full");
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
			t.inputEl.addClass("atlas-onboarding-input-full");
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
				t.inputEl.addClass("atlas-onboarding-input-full");
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
			t.inputEl.addClass("atlas-onboarding-input-full");
		});

		new Setting(c).setName("Chat ID").addText((t) => {
			t.setValue(this.plugin.settings.notifications.telegramChatId).onChange(async (v) => {
				this.plugin.settings.notifications.telegramChatId = v;
				await this.plugin.saveSettings();
			});
			t.inputEl.addClass("atlas-onboarding-input-full");
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
