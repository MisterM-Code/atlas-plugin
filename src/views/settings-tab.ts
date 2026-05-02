import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type AtlasPlugin from "../../main";
import { setupVaultStructure } from "../commands/setup-vault";

export class AtlasSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: AtlasPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "🧠 Atlas" });
		containerEl.createEl("p", {
			text: "Segundo cérebro local. 100% privado. Roda no Ollama.",
		});

		this.section_user();
		this.section_ollama();
		this.section_schedules();
		this.section_email();
		this.section_notifications();
		this.section_voice();
		this.section_advanced();
	}

	private section_user(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: "👤 Você" });

		new Setting(containerEl)
			.setName("Seu nome")
			.setDesc("Aparece em saudações e assinaturas de email.")
			.addText((t) =>
				t
					.setPlaceholder("Nome")
					.setValue(this.plugin.settings.user.displayName)
					.onChange(async (v) => {
						this.plugin.settings.user.displayName = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Seu cargo")
			.addText((t) =>
				t
					.setPlaceholder("Coordenador de TI")
					.setValue(this.plugin.settings.user.role)
					.onChange(async (v) => {
						this.plugin.settings.user.role = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Nome do time / squad")
			.addText((t) =>
				t
					.setValue(this.plugin.settings.user.teamName)
					.onChange(async (v) => {
						this.plugin.settings.user.teamName = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Estrutura de pastas do vault")
			.setDesc("Cria as pastas do Atlas no seu vault. Seguro rodar mais de uma vez.")
			.addButton((b) =>
				b
					.setButtonText(
						this.plugin.settings.vaultStructureCreated
							? "Reaplicar (cria pastas faltantes)"
							: "Criar agora"
					)
					.setCta()
					.onClick(async () => {
						await setupVaultStructure(this.plugin);
						this.display();
					})
			);
	}

	private section_ollama(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: "🤖 Ollama (LLM local)" });

		new Setting(containerEl)
			.setName("URL")
			.setDesc("Padrão Ollama é http://localhost:11434.")
			.addText((t) =>
				t
					.setValue(this.plugin.settings.ollama.baseUrl)
					.onChange(async (v) => {
						this.plugin.settings.ollama.baseUrl = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Modelo principal (geração)")
			.setDesc("Recomendado: qwen2.5:14b (≥16 GB RAM) ou llama3.2:3b (RAM menor).")
			.addText((t) =>
				t
					.setValue(this.plugin.settings.ollama.generationModel)
					.onChange(async (v) => {
						this.plugin.settings.ollama.generationModel = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Modelo de embeddings")
			.setDesc("bge-m3 é o melhor para PT-BR.")
			.addText((t) =>
				t
					.setValue(this.plugin.settings.ollama.embeddingModel)
					.onChange(async (v) => {
						this.plugin.settings.ollama.embeddingModel = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Testar conexão com Ollama")
			.addButton((b) =>
				b.setButtonText("Testar agora").onClick(async () => {
					const ok = await this.plugin.ollama.ping();
					if (ok) {
						const models = await this.plugin.ollama.listModels();
						new Notice(`Atlas: Ollama OK. Modelos: ${models.length}.`);
					} else {
						new Notice("Atlas: Ollama não respondeu. Está rodando?");
					}
				})
			);
	}

	private section_schedules(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: "⏰ Agendamentos" });

		new Setting(containerEl)
			.setName("Briefing matinal")
			.setDesc("Email + push com agenda do dia.")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.schedules.morningBriefingEnabled)
					.onChange(async (v) => {
						this.plugin.settings.schedules.morningBriefingEnabled = v;
						await this.plugin.saveSettings();
					})
			)
			.addText((t) =>
				t
					.setValue(this.plugin.settings.schedules.morningBriefingTime)
					.setPlaceholder("07:00")
					.onChange(async (v) => {
						this.plugin.settings.schedules.morningBriefingTime = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Evening review")
			.setDesc("Lembrete para fechar daily log.")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.schedules.eveningReviewEnabled)
					.onChange(async (v) => {
						this.plugin.settings.schedules.eveningReviewEnabled = v;
						await this.plugin.saveSettings();
					})
			)
			.addText((t) =>
				t
					.setValue(this.plugin.settings.schedules.eveningReviewTime)
					.onChange(async (v) => {
						this.plugin.settings.schedules.eveningReviewTime = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Weekly report")
			.setDesc("Sexta 16h por padrão.")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.schedules.weeklyReportEnabled)
					.onChange(async (v) => {
						this.plugin.settings.schedules.weeklyReportEnabled = v;
						await this.plugin.saveSettings();
					})
			)
			.addText((t) =>
				t
					.setValue(this.plugin.settings.schedules.weeklyReportTime)
					.setPlaceholder("16:00")
					.onChange(async (v) => {
						this.plugin.settings.schedules.weeklyReportTime = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Quiet hours (não notifica)")
			.addText((t) =>
				t
					.setValue(this.plugin.settings.schedules.quietHoursStart)
					.setPlaceholder("18:00")
					.onChange(async (v) => {
						this.plugin.settings.schedules.quietHoursStart = v;
						await this.plugin.saveSettings();
					})
			)
			.addText((t) =>
				t
					.setValue(this.plugin.settings.schedules.quietHoursEnd)
					.setPlaceholder("07:00")
					.onChange(async (v) => {
						this.plugin.settings.schedules.quietHoursEnd = v;
						await this.plugin.saveSettings();
					})
			);
	}

	private section_email(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: "📧 Email" });
		containerEl.createEl("p", {
			text: "Para Gmail use App Password. Guardado encriptado localmente.",
		});

		new Setting(containerEl)
			.setName("Habilitar email")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.email.enabled)
					.onChange(async (v) => {
						this.plugin.settings.email.enabled = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("SMTP host").addText((t) =>
			t
				.setValue(this.plugin.settings.email.smtpHost)
				.onChange(async (v) => {
					this.plugin.settings.email.smtpHost = v;
					await this.plugin.saveSettings();
				})
		);

		new Setting(containerEl).setName("Usuário").addText((t) =>
			t
				.setValue(this.plugin.settings.email.smtpUser)
				.onChange(async (v) => {
					this.plugin.settings.email.smtpUser = v;
					await this.plugin.saveSettings();
				})
		);

		new Setting(containerEl)
			.setName("Endereço 'From'")
			.setDesc("Costuma ser igual ao usuário SMTP.")
			.addText((t) =>
				t
					.setValue(this.plugin.settings.email.fromAddress)
					.onChange(async (v) => {
						this.plugin.settings.email.fromAddress = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Destinatários default — weekly report")
			.setDesc("Separe múltiplos por vírgula.")
			.addTextArea((t) =>
				t
					.setValue(this.plugin.settings.email.defaultRecipientsWeekly)
					.onChange(async (v) => {
						this.plugin.settings.email.defaultRecipientsWeekly = v;
						await this.plugin.saveSettings();
					})
			);
	}

	private section_notifications(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: "🔔 Notificações" });

		new Setting(containerEl).setName("Desktop").addToggle((t) =>
			t
				.setValue(this.plugin.settings.notifications.desktopEnabled)
				.onChange(async (v) => {
					this.plugin.settings.notifications.desktopEnabled = v;
					await this.plugin.saveSettings();
				})
		);

		new Setting(containerEl)
			.setName("Telegram (push mobile)")
			.setDesc("Crie um bot via @BotFather, cole o token.")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.notifications.telegramEnabled)
					.onChange(async (v) => {
						this.plugin.settings.notifications.telegramEnabled = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("Telegram bot token").addText((t) =>
			t
				.setValue(this.plugin.settings.notifications.telegramBotToken)
				.onChange(async (v) => {
					this.plugin.settings.notifications.telegramBotToken = v;
					await this.plugin.saveSettings();
				})
		);

		new Setting(containerEl).setName("Telegram chat ID").addText((t) =>
			t
				.setValue(this.plugin.settings.notifications.telegramChatId)
				.onChange(async (v) => {
					this.plugin.settings.notifications.telegramChatId = v;
					await this.plugin.saveSettings();
				})
		);
	}

	private section_voice(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: "🎤 Voice (whisper.cpp)" });

		new Setting(containerEl).setName("Habilitar voice capture").addToggle((t) =>
			t
				.setValue(this.plugin.settings.voice.enabled)
				.onChange(async (v) => {
					this.plugin.settings.voice.enabled = v;
					await this.plugin.saveSettings();
				})
		);

		new Setting(containerEl)
			.setName("Caminho do binário whisper.cpp")
			.setDesc("Ex: /opt/homebrew/bin/whisper-cpp")
			.addText((t) =>
				t
					.setValue(this.plugin.settings.voice.whisperBinaryPath)
					.onChange(async (v) => {
						this.plugin.settings.voice.whisperBinaryPath = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Caminho do modelo whisper")
			.addText((t) =>
				t
					.setValue(this.plugin.settings.voice.whisperModelPath)
					.onChange(async (v) => {
						this.plugin.settings.voice.whisperModelPath = v;
						await this.plugin.saveSettings();
					})
			);
	}

	private section_advanced(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: "⚙️ Avançado" });

		new Setting(containerEl)
			.setName("Auto-indexar vault no startup")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.behavior.autoIndexOnStartup)
					.onChange(async (v) => {
						this.plugin.settings.behavior.autoIndexOnStartup = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Extrair Knowledge Graph ao salvar")
			.setDesc("Pode atrasar saves em vaults grandes.")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.behavior.autoExtractKgOnSave)
					.onChange(async (v) => {
						this.plugin.settings.behavior.autoExtractKgOnSave = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Audit log")
			.setDesc("Loga ações em .atlas/audit.jsonl (recomendado).")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.privacy.auditLogEnabled)
					.onChange(async (v) => {
						this.plugin.settings.privacy.auditLogEnabled = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Resetar onboarding")
			.setDesc("Re-executa o wizard de configuração inicial.")
			.addButton((b) =>
				b.setButtonText("Resetar").onClick(async () => {
					this.plugin.settings.onboarding.completed = false;
					this.plugin.settings.onboarding.currentStep = 0;
					await this.plugin.saveSettings();
					new Notice("Atlas: onboarding resetado. Reabra o plugin.");
				})
			);
	}
}
