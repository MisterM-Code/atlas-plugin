import { Plugin, Notice, addIcon, normalizePath } from "obsidian";
import { AtlasSettings, DEFAULT_SETTINGS } from "./src/types";
import { OllamaClient } from "./src/ollama/client";
import { AtlasSettingTab } from "./src/views/settings-tab";
import { openOrCreateDailyLog } from "./src/commands/daily-log";
import { QuickCaptureModal } from "./src/commands/quick-capture";
import { setupVaultStructure } from "./src/commands/setup-vault";
import { indexVaultCommand } from "./src/commands/index-vault";
import { SummarizePersonModal } from "./src/commands/summarize-person";
import { Prepare1on1Modal } from "./src/commands/prepare-1on1";
import { SearchVaultModal } from "./src/commands/search-vault";
import {
	generateWeeklyReportCommand,
	sendCurrentWeeklyCommand,
} from "./src/commands/weekly-report";
import { KGStore } from "./src/kg/store";
import { Embedder } from "./src/retrieval/embedder";
import { Notifier, setFocusMode } from "./src/automation/notify";
import { Scheduler, timeToCron } from "./src/automation/scheduler";
import { AuditLog, AuditEventInput } from "./src/automation/audit-log";
import { BriefingsTool } from "./src/tools/briefings";
import { EmailSender } from "./src/automation/email";
import { decryptLight } from "./src/utils/crypto-light";
import { Memory } from "./src/agent/memory";
import { AtlasChatView, ATLAS_CHAT_VIEW } from "./src/views/chat-view";
import { ReminderWatcher, reminderStatePath } from "./src/automation/reminder-watcher";
import { ProactiveDetector, proactiveStatePath } from "./src/automation/proactive";
import { initializeCoachFolders, toggleCoachMode, getModeLabel } from "./src/coach/coach-mode";
import { FlashcardStore } from "./src/study/flashcard-store";
import {
	generateFlashcardsFromActiveNote,
	ReviewSessionModal,
	exportFlashcardsAsCsv,
	exportFlashcardsAsObsidianSr,
	SocraticModal,
} from "./src/commands/study";
import { PiperTTS } from "./src/automation/tts";
import { OnboardingWizard } from "./src/views/onboarding";
import { applyTemplatesToVault } from "./src/commands/apply-templates";
import { SlashCommandSuggest } from "./src/editor/slash-suggest";
import { openInlineAi } from "./src/editor/inline-ai";
import { HoverCardManager } from "./src/editor/hover-card";
import { MentionSuggest } from "./src/editor/mention-suggest";
import { smartPaste } from "./src/editor/smart-paste";
import { AutoTagger } from "./src/automation/auto-tagger";
import { ActionItemsHubView, ATLAS_HUB_VIEW } from "./src/views/action-items-hub";
import { SmartSuggestionsView, ATLAS_SUGGESTIONS_VIEW } from "./src/views/smart-suggestions";
import { AutoAliaser, AutoAliasingModal } from "./src/automation/auto-aliasing";
import { Reranker } from "./src/retrieval/reranker";
import { ReasoningModal } from "./src/views/reasoning-modal";
import { generateSummaryForActiveNote } from "./src/tools/auto-summary";
import { AtlasTodayView, ATLAS_TODAY_VIEW } from "./src/views/atlas-today";
import { SpotlightModal } from "./src/views/spotlight";
import { SerendipityEngine, serendipityStatePath } from "./src/serendipity/engine";
import { YearInReviewTool } from "./src/tools/year-in-review";
import { TimeCapsuleModal, CapsuleWatcher } from "./src/tools/time-capsule";
import { ContextCollapseTool } from "./src/innovations/context-collapse";
import {
	ManagerReadmeTool,
	PreMortemModal,
	DecisionDiaryTool,
} from "./src/innovations/manager-tools";
import { WorkspaceHealthView, ATLAS_HEALTH_VIEW } from "./src/views/workspace-health";
import { PodcastGeneratorTool } from "./src/innovations/podcast-generator";
import {
	AtlasStatusView,
	ATLAS_STATUS_VIEW,
	pullRecommendedModel,
	OllamaErrorModal,
} from "./src/views/atlas-status";
import { AtlasError } from "./src/automation/error-classifier";
import {
	AtlasMasterSidebarView,
	ATLAS_MASTER_VIEW,
} from "./src/views/master/master-sidebar-view";
import type { TabId } from "./src/views/master/types";
import { TutorialSystem } from "./src/tutorial/tutorial-system";
import { getAllTutorials } from "./src/tutorial/tours";
import { AchievementSystem } from "./src/tutorial/achievements";
import { RuleEngine, DEFAULT_RULES } from "./src/automation/rule-engine";
import { AutoMocGenerator, VaultWizardModal } from "./src/automation/vault-organizer";
import { EntityTreesModal } from "./src/views/entity-trees-modal";
import { SystemDetectorWatcher } from "./src/automation/system-detector";
import { autoLinkSystemsCommand } from "./src/commands/auto-link-systems";
import { rescheduleAllSavedViews } from "./src/views/master/tab-reports-composer";
import { TemplateStore } from "./src/templates/visual-editor/template-store";
import { TemplatePickerModal } from "./src/templates/visual-editor/editor-ui";
import { logger } from "./src/utils/logger";
import { injectGlobalAnimationStyles, confettiBurst } from "./src/ui/animations";
import { SplashScreen } from "./src/ui/splash";

const ATLAS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><circle cx="50" cy="50" r="38"/><path d="M50 12 L50 88 M12 50 L88 50 M22 22 L78 78 M78 22 L22 78"/></svg>`;

function parseNumeric(v: unknown): number | null {
	if (typeof v === "number") return v;
	if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim())) return parseFloat(v);
	return null;
}

import { Modal as ObsidianModal, Setting as ObsidianSetting, App as ObsidianApp } from "obsidian";

async function promptInput(app: ObsidianApp, label: string): Promise<string | null> {
	return new Promise((resolve) => {
		class P extends ObsidianModal {
			value: string = "";
			onOpen(): void {
				const { contentEl } = this;
				contentEl.empty();
				contentEl.createEl("h3", { text: label });
				const inp = contentEl.createEl("input", { type: "text" }) as HTMLInputElement;
				inp.style.width = "100%";
				inp.style.padding = "8px";
				inp.focus();
				inp.addEventListener("keydown", (e) => {
					if (e.key === "Enter") {
						resolve(inp.value || null);
						this.close();
					}
					if (e.key === "Escape") {
						resolve(null);
						this.close();
					}
				});
				new ObsidianSetting(contentEl)
					.addButton((b) =>
						b.setButtonText("Cancelar").onClick(() => {
							resolve(null);
							this.close();
						})
					)
					.addButton((b) =>
						b
							.setButtonText("OK")
							.setCta()
							.onClick(() => {
								resolve(inp.value || null);
								this.close();
							})
					);
			}
			onClose(): void {
				this.contentEl.empty();
			}
		}
		new P(app).open();
	});
}

async function pickFromList(app: ObsidianApp, title: string, items: string[]): Promise<string | null> {
	return new Promise((resolve) => {
		class Picker extends ObsidianModal {
			selected: string | null = null;
			onOpen(): void {
				const { contentEl } = this;
				contentEl.empty();
				contentEl.createEl("h3", { text: title });
				const select = contentEl.createEl("select") as HTMLSelectElement;
				select.style.width = "100%";
				select.style.padding = "8px";
				select.style.fontSize = "13px";
				const placeholder = select.createEl("option", { text: "— escolha —", value: "" });
				placeholder.disabled = true;
				placeholder.selected = true;
				for (const it of items) {
					select.createEl("option", { text: it, value: it });
				}
				new ObsidianSetting(contentEl)
					.addButton((b) =>
						b.setButtonText("Cancelar").onClick(() => {
							resolve(null);
							this.close();
						})
					)
					.addButton((b) =>
						b
							.setButtonText("OK")
							.setCta()
							.onClick(() => {
								this.selected = select.value || null;
								resolve(this.selected);
								this.close();
							})
					);
			}
			onClose(): void {
				this.contentEl.empty();
			}
		}
		new Picker(app).open();
	});
}

export default class AtlasPlugin extends Plugin {
	settings!: AtlasSettings;
	ollama!: OllamaClient;
	kg!: KGStore;
	embedder!: Embedder;
	notifier!: Notifier;
	scheduler!: Scheduler;
	memory!: Memory;
	flashcards!: FlashcardStore;
	tts!: PiperTTS;
	autoTagger!: AutoTagger;
	autoAliaser!: AutoAliaser;
	reranker!: Reranker;
	serendipity!: SerendipityEngine;
	tutorialSystem!: TutorialSystem;
	achievements!: AchievementSystem;
	ruleEngine!: RuleEngine;
	systemDetectorWatcher!: SystemDetectorWatcher;
	templateStore!: TemplateStore;
	lastAtlasError: AtlasError | null = null;
	private capsuleWatcher!: CapsuleWatcher;
	private audit!: AuditLog;
	private reminderWatcher!: ReminderWatcher;
	proactive!: ProactiveDetector;
	private statusBar: HTMLElement | null = null;

	async onload(): Promise<void> {
		logger.info("Atlas plugin carregando...");
		await this.loadSettings();

		addIcon("atlas-brain", ATLAS_ICON);

		// v0.7 Sprint 12: animations
		injectGlobalAnimationStyles();

		// Core services
		this.ollama = new OllamaClient({
			baseUrl: this.settings.ollama.baseUrl,
			timeout_ms: this.settings.ollama.timeout_ms,
		});

		this.kg = new KGStore(this.app, this.settings.folders.atlas);
		await this.kg.load();

		this.embedder = new Embedder(
			this.app,
			this.ollama,
			this.settings.ollama.embeddingModel,
			normalizePath(`${this.settings.folders.atlas}/embeddings.json`)
		);
		await this.embedder.load();

		this.notifier = new Notifier({
			desktopEnabled: this.settings.notifications.desktopEnabled,
			telegramEnabled: this.settings.notifications.telegramEnabled,
			telegramBotToken: this.settings.notifications.telegramBotToken,
			telegramChatId: this.settings.notifications.telegramChatId,
			minimumSeverity: this.settings.notifications.minimumSeverity,
			quietHoursStart: this.settings.schedules.quietHoursStart,
			quietHoursEnd: this.settings.schedules.quietHoursEnd,
		});

		this.scheduler = new Scheduler();
		this.audit = new AuditLog(this.app, this.settings.folders.atlas);

		this.memory = new Memory(this.app, this.settings.folders.atlas);
		await this.memory.load();

		this.reminderWatcher = new ReminderWatcher(
			this.app,
			this.notifier,
			reminderStatePath(this.settings.folders.atlas),
			[this.settings.folders.atlas, ".obsidian", ".trash", "99_Archive"]
		);
		await this.reminderWatcher.load();

		this.proactive = new ProactiveDetector(
			this.app,
			this.kg,
			this.notifier,
			proactiveStatePath(this.settings.folders.atlas),
			{ meetings: this.settings.folders.meetings }
		);
		await this.proactive.load();

		this.flashcards = new FlashcardStore(this.app, this.settings.folders.atlas);
		await this.flashcards.load();

		this.tts = new PiperTTS({
			binaryPath: this.settings.voice.whisperBinaryPath, // reuse field; voice section will get its own
			modelPath: this.settings.voice.whisperModelPath,
			language: this.settings.voice.language,
		});

		// Coach scope init
		await initializeCoachFolders(this);

		// Status bar
		this.statusBar = this.addStatusBarItem();
		this.statusBar.addClass("atlas-status");
		this.statusBar.style.cursor = "pointer";
		this.statusBar.addEventListener("click", () => void toggleCoachMode(this));
		this.updateStatusBar();

		// Register chat view
		this.registerView(ATLAS_CHAT_VIEW, (leaf) => new AtlasChatView(leaf, this));

		// Register Action Items Hub view
		this.registerView(ATLAS_HUB_VIEW, (leaf) => new ActionItemsHubView(leaf, this));

		// Register Smart Suggestions view
		this.registerView(ATLAS_SUGGESTIONS_VIEW, (leaf) => new SmartSuggestionsView(leaf, this));

		// Register slash command suggester
		this.registerEditorSuggest(new SlashCommandSuggest(this.app, this));

		// Register @mention suggester (people / themes / projects do KG)
		this.registerEditorSuggest(new MentionSuggest(this.app, this));

		// Hover card sobre [[Pessoa]]
		new HoverCardManager(this).register();

		// Auto-tagger (debounced em save)
		this.autoTagger = new AutoTagger(
			this.app,
			this.ollama,
			this.settings.ollama.smallModel,
			{
				debounceMs: 30000, // 30s after last edit
				maxFileSize: 50_000, // skip huge files
				excludeFolders: [
					this.settings.folders.atlas,
					"99_Archive",
					".obsidian",
					".trash",
				],
			}
		);
		this.autoTagger.register((cleanup) => this.register(cleanup));

		// Auto-aliaser (manual via comando)
		this.autoAliaser = new AutoAliaser(
			this.app,
			this.kg,
			this.embedder,
			this.settings.ollama.embeddingModel
		);

		// Reranker (load on-demand para 8 GB)
		this.reranker = new Reranker(
			this.ollama,
			this.settings.ollama.rerankerModel,
			this.settings.ollama.smallModel
		);

		// Serendipity Engine
		this.serendipity = new SerendipityEngine(
			this.app,
			this.notifier,
			this.ollama,
			this.settings.ollama.smallModel,
			serendipityStatePath(this.settings.folders.atlas)
		);
		await this.serendipity.load();

		// Time Capsule watcher
		this.capsuleWatcher = new CapsuleWatcher(this);

		// Register Atlas Today view
		this.registerView(ATLAS_TODAY_VIEW, (leaf) => new AtlasTodayView(leaf, this));

		// Register Workspace Health view (v0.3)
		this.registerView(ATLAS_HEALTH_VIEW, (leaf) => new WorkspaceHealthView(leaf, this));

		// Register Atlas Status view (v0.4)
		this.registerView(ATLAS_STATUS_VIEW, (leaf) => new AtlasStatusView(leaf, this));

		// Register Atlas Master Sidebar (v0.4 Sprint 2 — UNIFIED UI)
		this.registerView(ATLAS_MASTER_VIEW, (leaf) => new AtlasMasterSidebarView(leaf, this));

		// Tutorial + XP (v0.4 Sprint 3)
		this.tutorialSystem = new TutorialSystem(this.app, this);
		this.achievements = new AchievementSystem();
		this.achievements.gain("plugin-loaded", 0);

		// Rule engine (v0.4 Sprint 4)
		if (!this.settings.rules) {
			this.settings.rules = DEFAULT_RULES;
			await this.saveSettings();
		}
		this.ruleEngine = new RuleEngine(this.app, this);

		// System detector watcher (v0.5 Sprint 7)
		this.systemDetectorWatcher = new SystemDetectorWatcher(this);
		this.systemDetectorWatcher.register((cleanup) => this.register(cleanup));

		// Visual Template Editor store (v0.5 Sprint 9)
		this.templateStore = new TemplateStore(this.app, this.settings.folders.atlas);
		await this.templateStore.load();

		// Saved views schedule (v0.5 Sprint 8) — re-agenda jobs ao iniciar
		try {
			rescheduleAllSavedViews(this);
		} catch (e) {
			logger.warn("saved-views reschedule falhou", { error: String(e) });
		}

		// Ribbon — Atlas Master Sidebar (todas features unificadas)
		this.addRibbonIcon("atlas-brain", "Atlas — abrir sidebar", () => {
			void this.activateMasterTab("today");
		});

		// Ribbon secundário: quick capture rápido
		this.addRibbonIcon("zap", "Atlas Quick Capture", () => {
			new QuickCaptureModal(this.app, this).open();
		});

		this.registerCommands();
		this.applySchedules();

		this.addSettingTab(new AtlasSettingTab(this.app, this));

		// First-run: splash 5s then onboarding wizard
		if (!this.settings.onboarding.completed) {
			const showSplash = !this.settings.onboarding.splashSeen;
			window.setTimeout(async () => {
				if (showSplash) {
					const splash = new SplashScreen(this);
					await splash.show();
					this.settings.onboarding.splashSeen = true;
					await this.saveSettings();
				}
				new OnboardingWizard(this.app, this).open();
			}, 600);
		} else if (!this.tutorialSystem.hasCompleted("first-steps") && !this.tutorialSystem.hasSkipped("first-steps")) {
			// Onboarding já feito mas tour não — sugerir
			window.setTimeout(() => {
				new Notice(
					"💡 Atlas: comece com o tour 'Primeiros passos' (2 min). Use Cmd+P → 'Atlas: Tour: Primeiros passos'.",
					12000
				);
			}, 3000);
		}

		// Custom URL handler for atlas:// links
		this.registerObsidianProtocolHandler("atlas-send-weekly", async (params) => {
			void params; // could route by param
			await sendCurrentWeeklyCommand(this);
		});

		// v0.7 Sprint 15: bookmarklet handler — captura URL via 1-click bookmark
		this.registerObsidianProtocolHandler("atlas-capture-url", async (params) => {
			const title = params.title ?? "Link";
			const url = params.url ?? "";
			const selection = params.selection ?? "";
			const date = new Date().toISOString().split("T")[0];
			const inboxFolder = this.settings.folders.inbox;
			const slug = (title || "captura")
				.substring(0, 60)
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-|-$/g, "");
			const path = normalizePath(`${inboxFolder}/${date}-${slug}.md`);

			if (!this.app.vault.getAbstractFileByPath(inboxFolder)) {
				try {
					await this.app.vault.createFolder(inboxFolder);
				} catch {
					// race
				}
			}

			const md = `---
type: capture
captured_at: ${new Date().toISOString()}
source_url: ${JSON.stringify(url)}
captured_by: atlas-bookmarklet
---

# 📎 ${title}

**URL:** [${url}](${url})

${selection ? `## Highlight\n\n> ${selection.replace(/\n/g, "\n> ")}\n` : ""}

## Notas

`;
			try {
				const f = await this.app.vault.create(path, md);
				new Notice(`Atlas: capturado "${title.substring(0, 40)}".`);
				await this.app.workspace.getLeaf().openFile(f);
			} catch (e) {
				new Notice(`Atlas: erro ao capturar — ${String(e)}`, 8000);
			}
		});

		logger.info("Atlas plugin pronto.");
	}

	onunload(): void {
		logger.info("Atlas plugin descarregando...");
		this.scheduler?.cancelAll();
	}

	async loadSettings(): Promise<void> {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		// Refresh dependent services
		this.notifier?.updateConfig({
			desktopEnabled: this.settings.notifications.desktopEnabled,
			telegramEnabled: this.settings.notifications.telegramEnabled,
			telegramBotToken: this.settings.notifications.telegramBotToken,
			telegramChatId: this.settings.notifications.telegramChatId,
			minimumSeverity: this.settings.notifications.minimumSeverity,
			quietHoursStart: this.settings.schedules.quietHoursStart,
			quietHoursEnd: this.settings.schedules.quietHoursEnd,
		});
		this.tts?.updateConfig({
			binaryPath: this.settings.voice.whisperBinaryPath,
			modelPath: this.settings.voice.whisperModelPath,
			language: this.settings.voice.language,
		});
		this.applySchedules();
		this.updateStatusBar();
	}

	async auditLog(event: AuditEventInput): Promise<void> {
		if (!this.settings.privacy.auditLogEnabled) return;
		await this.audit.append(event);
	}

	/**
	 * Mostra erro Atlas como Modal humanizado em vez de stack trace.
	 * Use sempre que pegar erro do Ollama em comandos.
	 */
	presentError(e: unknown): void {
		const ae =
			e instanceof AtlasError
				? e
				: ({ humanMessage: String(e), code: "unknown", message: String(e), actions: [], original: e } as unknown as AtlasError);
		this.lastAtlasError = ae;
		new OllamaErrorModal(this.app, this, ae).open();
	}

	/** Helper para tracker de XP — usado por tutoriais e features. */
	gainXp(eventId: string, xp: number): void {
		this.achievements?.gain(eventId, xp);
	}

	startTutorial(id: string): void {
		const tours = getAllTutorials(this);
		const tour = tours.find((t) => t.id === id);
		if (!tour) {
			new Notice(`Atlas: tour "${id}" não encontrado.`);
			return;
		}
		void this.tutorialSystem.start(tour);
	}

	showTourPicker(): void {
		const tours = getAllTutorials(this);
		const list = this.tutorialSystem.listAvailable();
		const items = list
			.map((entry) => {
				const status =
					entry.status === "completed" ? "✅" : entry.status === "skipped" ? "⏭️" : "🆕";
				return `${status} **${entry.tutorial.name}** (${entry.tutorial.estimatedMinutes} min)\n  ${entry.tutorial.description}`;
			})
			.join("\n\n");
		void tours;
		const helpText =
			items +
			"\n\nUse `Cmd+P → Atlas: Tour: ...` para iniciar um tour.";
		new Notice(helpText, 15000);
	}

	showBookmarkletModal(): void {
		// Gera bookmarklet javascript: que captura URL+título+seleção
		const bookmarkletJs =
			`javascript:(function(){var s=window.getSelection().toString();` +
			`var u='obsidian://atlas-capture-url?title='+encodeURIComponent(document.title)+` +
			`'&url='+encodeURIComponent(location.href)+` +
			`(s?'&selection='+encodeURIComponent(s):'');` +
			`window.open(u);})();`;

		const Modal = (window as unknown as { require?: unknown; Modal?: typeof import("obsidian").Modal }).Modal ?? require("obsidian").Modal;
		// Fallback simples: mostra Notice longo + abre Settings com texto copiável
		const notice = new Notice("", 0);
		notice.noticeEl.empty();
		notice.noticeEl.style.maxWidth = "560px";

		const head = notice.noticeEl.createEl("div", { text: "🔖 Atlas Bookmarklet" });
		head.style.fontWeight = "bold";
		head.style.marginBottom = "8px";

		const desc = notice.noticeEl.createEl("div", {
			text: "1) Selecione TODO o código abaixo. 2) Arraste pra barra de favoritos do browser. 3) Em qualquer site, click no bookmark → captura URL no Atlas.",
		});
		desc.style.fontSize = "11px";
		desc.style.marginBottom = "8px";

		const code = notice.noticeEl.createEl("textarea");
		code.value = bookmarkletJs;
		code.style.width = "100%";
		code.style.height = "80px";
		code.style.fontSize = "10px";
		code.style.fontFamily = "var(--font-monospace)";
		code.style.padding = "6px";
		code.readOnly = true;
		code.addEventListener("focus", () => code.select());

		const copyBtn = notice.noticeEl.createEl("button", { text: "📋 Copiar bookmarklet" });
		copyBtn.style.marginTop = "8px";
		copyBtn.style.fontSize = "11px";
		copyBtn.addEventListener("click", async () => {
			try {
				await navigator.clipboard.writeText(bookmarkletJs);
				copyBtn.setText("✓ Copiado!");
				setTimeout(() => copyBtn.setText("📋 Copiar bookmarklet"), 2000);
			} catch {
				code.select();
				document.execCommand("copy");
				copyBtn.setText("✓ Copiado!");
			}
		});

		const closeBtn = notice.noticeEl.createEl("button", { text: "Fechar" });
		closeBtn.style.marginTop = "8px";
		closeBtn.style.marginLeft = "6px";
		closeBtn.style.fontSize = "11px";
		closeBtn.addEventListener("click", () => notice.hide());

		void Modal; // keep import
	}

	showAchievements(): void {
		const progress = this.achievements.getProgress();
		const all = this.achievements.getAllAchievements();
		const unlocked = all.filter((a) => a.unlocked).length;
		const lines: string[] = [];
		lines.push(
			`🏆 Level ${progress.level} · ${progress.xp} XP · próximo nível em ${progress.nextLevelXp - progress.xp} XP`
		);
		lines.push(`✨ ${unlocked}/${all.length} achievements desbloqueados`);
		lines.push("");
		for (const a of all) {
			const prefix = a.unlocked ? a.def.icon : "🔒";
			lines.push(`${prefix} ${a.def.title} — ${a.def.description} (+${a.def.xp} XP)`);
		}
		new Notice(lines.join("\n"), 20000);
	}

	// ─────────────────────────────────────────────────────────────

	private registerCommands(): void {
		this.addCommand({
			id: "atlas-quick-capture",
			name: "Quick capture",
			hotkeys: [{ modifiers: ["Mod", "Shift"], key: "a" }],
			callback: () => new QuickCaptureModal(this.app, this).open(),
		});

		this.addCommand({
			id: "atlas-daily-log",
			name: "Daily log (criar/abrir hoje)",
			callback: () => openOrCreateDailyLog(this),
		});

		this.addCommand({
			id: "atlas-setup-vault",
			name: "Setup: criar estrutura de pastas no vault",
			callback: () => setupVaultStructure(this),
		});

		this.addCommand({
			id: "atlas-test-ollama",
			name: "Testar Ollama",
			callback: async () => {
				const ok = await this.ollama.ping();
				if (ok) {
					const models = await this.ollama.listModels();
					new Notice(`Atlas: Ollama OK · ${models.length} modelos.`);
				} else {
					new Notice("Atlas: Ollama offline. Inicie ollama.com.");
				}
			},
		});

		this.addCommand({
			id: "atlas-index-vault",
			name: "Indexar vault (extrai KG)",
			callback: () => indexVaultCommand(this),
		});

		this.addCommand({
			id: "atlas-summarize-person",
			name: "Resumir pessoa",
			callback: () => new SummarizePersonModal(this.app, this).open(),
		});

		this.addCommand({
			id: "atlas-prepare-1on1",
			name: "Preparar próximo 1:1",
			callback: () => new Prepare1on1Modal(this.app, this).open(),
		});

		this.addCommand({
			id: "atlas-search-vault",
			name: "Buscar no vault (hybrid)",
			hotkeys: [{ modifiers: ["Mod", "Shift"], key: "k" }],
			callback: () => new SearchVaultModal(this.app, this).open(),
		});

		this.addCommand({
			id: "atlas-show-kg-stats",
			name: "Knowledge Graph: estatísticas",
			callback: () => {
				const d = this.kg.data;
				new Notice(
					`Atlas KG:\n${d.people.length} pessoas\n${d.sessions.length} sessões\n${d.actionItems.length} actions\n${d.commitments.length} commitments\n${d.themes.length} temas`,
					10000
				);
			},
		});

		this.addCommand({
			id: "atlas-weekly-now",
			name: "Gerar weekly report agora",
			callback: () => generateWeeklyReportCommand(this),
		});

		this.addCommand({
			id: "atlas-send-weekly",
			name: "Enviar weekly report (nota ativa)",
			callback: () => sendCurrentWeeklyCommand(this),
		});

		this.addCommand({
			id: "atlas-morning-briefing-now",
			name: "Briefing matinal (gerar agora)",
			callback: () => this.runMorningBriefing(),
		});

		this.addCommand({
			id: "atlas-evening-review-now",
			name: "Evening review (gerar agora)",
			callback: () => this.runEveningReview(),
		});

		this.addCommand({
			id: "atlas-focus-mode",
			name: "Focus mode 90 min",
			hotkeys: [{ modifiers: ["Mod", "Shift"], key: "f" }],
			callback: () => setFocusMode(90),
		});

		this.addCommand({
			id: "atlas-test-telegram",
			name: "Testar notificação Telegram",
			callback: async () => {
				const r = await this.notifier.testTelegram();
				new Notice(
					r.ok ? "Atlas: Telegram OK." : `Atlas: falhou — ${r.error ?? "erro"}`
				);
			},
		});

		this.addCommand({
			id: "atlas-test-email",
			name: "Testar SMTP",
			callback: () => this.testEmail(),
		});

		this.addCommand({
			id: "atlas-open-chat",
			name: "Abrir chat",
			hotkeys: [{ modifiers: ["Mod", "Shift"], key: "j" }],
			callback: () => this.activateMasterTab("chat"),
		});

		// ─── v0.4 SPRINT 2: Master Sidebar commands ───

		this.addCommand({
			id: "atlas-master-open",
			name: "Abrir Atlas (sidebar unificada)",
			hotkeys: [{ modifiers: ["Mod", "Shift"], key: "o" }],
			callback: () => this.activateMasterTab("today"),
		});

		this.addCommand({
			id: "atlas-master-today",
			name: "Master Sidebar → Today",
			callback: () => this.activateMasterTab("today"),
		});

		this.addCommand({
			id: "atlas-master-knowledge",
			name: "Master Sidebar → Knowledge (cards de pessoas/projetos/temas)",
			callback: () => this.activateMasterTab("knowledge"),
		});

		this.addCommand({
			id: "atlas-master-systems",
			name: "Master Sidebar → 🖥️ Sistemas (CRUD)",
			callback: () => this.activateMasterTab("systems"),
		});

		this.addCommand({
			id: "atlas-master-products",
			name: "Master Sidebar → 📦 Produtos (CRUD)",
			callback: () => this.activateMasterTab("products"),
		});

		this.addCommand({
			id: "atlas-master-roles",
			name: "Master Sidebar → 🎓 Cargos (CRUD)",
			callback: () => this.activateMasterTab("roles"),
		});

		this.addCommand({
			id: "atlas-master-reports-composer",
			name: "Master Sidebar → 📊 Reports Composer (filtros multi-dim)",
			callback: () => {
				try {
					window.localStorage.setItem("atlas-reports-subtab", "composer");
				} catch {
					// ignore
				}
				void this.activateMasterTab("reports");
			},
		});

		this.addCommand({
			id: "atlas-master-reports-templates",
			name: "Master Sidebar → 📐 Reports Templates (editor visual)",
			callback: () => {
				try {
					window.localStorage.setItem("atlas-reports-subtab", "templates");
				} catch {
					// ignore
				}
				void this.activateMasterTab("reports");
			},
		});

		// Quick-add direto via Command Palette
		this.addCommand({
			id: "atlas-add-system",
			name: "+ Novo Sistema",
			callback: async () => {
				const m = await import("./src/views/master/tab-systems");
				m.renderSystemEditForm(this, null);
			},
		});

		this.addCommand({
			id: "atlas-add-product",
			name: "+ Novo Produto",
			callback: async () => {
				const m = await import("./src/views/master/tab-products");
				m.renderProductEditForm(this, null);
			},
		});

		this.addCommand({
			id: "atlas-add-role",
			name: "+ Novo Cargo",
			callback: async () => {
				const m = await import("./src/views/master/tab-roles");
				m.renderRoleEditForm(this, null);
			},
		});

		this.addCommand({
			id: "atlas-add-person",
			name: "+ Nova Pessoa",
			callback: async () => {
				const m = await import("./src/views/master/person-form");
				m.renderPersonEditForm(this, null);
			},
		});

		// ─── v0.5 Sprint 7: System detection ───

		this.addCommand({
			id: "atlas-auto-link-systems",
			name: "🔗 Auto-link sistemas mencionados na nota ativa",
			callback: () => autoLinkSystemsCommand(this),
		});

		this.addCommand({
			id: "atlas-scan-systems-now",
			name: "Sistemas: escanear nota ativa agora (sem debounce)",
			callback: async () => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					new Notice("Atlas: abra uma nota.");
					return;
				}
				const r = await this.systemDetectorWatcher.scanNow(file);
				if (r.added.length > 0) {
					new Notice(
						`🖥️ Atlas: ${r.added.length} sistema(s) detectados: ${r.added.join(", ")}`,
						6000
					);
				} else {
					new Notice("Atlas: nenhum sistema novo detectado.");
				}
			},
		});

		this.addCommand({
			id: "atlas-scan-systems-vault",
			name: "Sistemas: escanear vault inteiro (batch)",
			callback: async () => {
				const all = this.app.vault.getMarkdownFiles();
				const detector = this.systemDetectorWatcher.core;
				const notice = new Notice("Atlas: escaneando vault...", 0);
				let totalAdded = 0;
				let filesChanged = 0;
				let processed = 0;
				for (const f of all) {
					processed++;
					if (processed % 20 === 0) {
						notice.setMessage(`Atlas: ${processed}/${all.length} notas...`);
					}
					try {
						const r = await detector.passiveScan(f);
						if (r.changed) {
							filesChanged++;
							totalAdded += r.added.length;
						}
					} catch {
						// continue
					}
				}
				notice.hide();
				new Notice(
					`Atlas: ${filesChanged} notas atualizadas com ${totalAdded} menções de sistemas.`,
					8000
				);
			},
		});

		// ─── v0.5 Sprint 9: Visual Template Editor ───

		this.addCommand({
			id: "atlas-templates-picker",
			name: "📐 Templates Atlas (escolher / usar / editar)",
			callback: () => new TemplatePickerModal(this.app, this).open(),
		});

		this.addCommand({
			id: "atlas-templates-reset",
			name: "Templates: resetar para defaults (Daily/1:1/Coaching/Weekly)",
			callback: async () => {
				if (!confirm("Atlas: descartar templates customizados e voltar aos defaults?")) return;
				this.templateStore.resetToDefaults();
				await this.templateStore.save();
				new Notice("Atlas: templates resetados.");
			},
		});

		this.addCommand({
			id: "atlas-master-reports",
			name: "Master Sidebar → Reports (timeline)",
			callback: () => this.activateMasterTab("reports"),
		});

		// ─── v0.6 Sprint 10b: Lab tab ───

		this.addCommand({
			id: "atlas-master-lab",
			name: "Master Sidebar → 🧪 Lab (Tools IA / Serendipity / Capsules / Tree)",
			callback: () => this.activateMasterTab("lab"),
		});

		this.addCommand({
			id: "atlas-master-lab-tools",
			name: "Master Sidebar → 🛠️ Lab: Tools IA",
			callback: () => {
				try {
					window.localStorage.setItem("atlas-lab-subtab", "tools-ia");
				} catch {
					// ignore
				}
				void this.activateMasterTab("lab");
			},
		});

		this.addCommand({
			id: "atlas-master-lab-serendipity",
			name: "Master Sidebar → 💡 Lab: Serendipity feed",
			callback: () => {
				try {
					window.localStorage.setItem("atlas-lab-subtab", "serendipity");
				} catch {
					// ignore
				}
				void this.activateMasterTab("lab");
			},
		});

		this.addCommand({
			id: "atlas-master-lab-tree",
			name: "Master Sidebar → 🌳 Lab: Entity Tree (KG)",
			callback: () => {
				try {
					window.localStorage.setItem("atlas-lab-subtab", "tree");
				} catch {
					// ignore
				}
				void this.activateMasterTab("lab");
			},
		});

		// ─── v0.6 Sprint 10d: Automations tab ───

		this.addCommand({
			id: "atlas-master-automations",
			name: "Master Sidebar → 🤖 Auto (Tagger / Aliaser / Rules / Atlas Percebeu)",
			callback: () => this.activateMasterTab("automations"),
		});

		this.addCommand({
			id: "atlas-master-auto-rules",
			name: "Master Sidebar → 📋 Auto: Rules engine (toggle / aplicar)",
			callback: () => {
				try {
					window.localStorage.setItem("atlas-auto-subtab", "rules");
				} catch {
					// ignore
				}
				void this.activateMasterTab("automations");
			},
		});

		// ─── v0.7 Sprint 18: TI Tools IA ───

		this.addCommand({
			id: "atlas-architecture-diagram",
			name: "🏗️ Architecture Diagram (Mermaid C4)",
			callback: async () => {
				const m = await import("./src/innovations/ti-tools");
				new m.ArchitectureDiagramModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "atlas-adr-generator",
			name: "📜 ADR Generator (Architecture Decision Record)",
			callback: async () => {
				const m = await import("./src/innovations/ti-tools");
				new m.AdrGeneratorModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "atlas-tech-debt-scanner",
			name: "💸 Tech Debt Scanner (escaneia vault)",
			callback: async () => {
				const m = await import("./src/innovations/ti-tools");
				const tool = new m.TechDebtScannerTool(this.app, this);
				const r = await tool.run();
				if (r?.notePath) {
					const f = this.app.vault.getAbstractFileByPath(r.notePath);
					if (f && "stat" in f) {
						await this.app.workspace.getLeaf().openFile(f as never);
					}
				}
			},
		});

		this.addCommand({
			id: "atlas-runbook-generator",
			name: "🚑 Runbook Generator",
			callback: async () => {
				const m = await import("./src/innovations/ti-tools");
				new m.RunbookGeneratorModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "atlas-postmortem-builder",
			name: "🚨 Postmortem Builder (blameless RCA 5-whys)",
			callback: async () => {
				const m = await import("./src/innovations/ti-tools");
				new m.PostmortemBuilderModal(this.app, this).open();
			},
		});

		// ─── v0.7 Sprint 15: Integrations ───

		this.addCommand({
			id: "atlas-ical-sync-now",
			name: "🗓️ iCal: sincronizar calendar agora",
			callback: async () => {
				const url = this.settings.profile?.calendarUrl;
				if (!url) {
					new Notice(
						"Atlas: configure URL .ics em Settings → Atlas → Profile → Calendar URL.",
						8000
					);
					return;
				}
				const notice = new Notice("Atlas: buscando calendar...", 0);
				try {
					const m = await import("./src/integrations/ical");
					const ical = new m.IcalClient(this.app, this.settings.folders.atlas);
					const events = await ical.fetchAndCache(url);
					notice.hide();
					new Notice(`Atlas: ${events.length} eventos sincronizados.`);
				} catch (e) {
					notice.hide();
					new Notice(`Atlas: erro — ${String(e)}`, 8000);
				}
			},
		});

		this.addCommand({
			id: "atlas-bookmarklet-show",
			name: "🔖 Bookmarklet: mostrar código pra arrastar pra browser",
			callback: () => this.showBookmarkletModal(),
		});

		this.addCommand({
			id: "atlas-capacity-planner",
			name: "👥 Capacity Planner (analise carga do time)",
			callback: async () => {
				const m = await import("./src/innovations/ti-tools");
				const tool = new m.CapacityPlannerTool(this.app, this);
				const r = await tool.run();
				if (r) {
					const f = this.app.vault.getAbstractFileByPath(r.notePath);
					if (f && "stat" in f) {
						await this.app.workspace.getLeaf().openFile(f as never);
					}
				}
			},
		});

		this.addCommand({
			id: "atlas-master-auto-percebeu",
			name: "Master Sidebar → 📡 Auto: Atlas Percebeu (proactive feed)",
			callback: () => {
				try {
					window.localStorage.setItem("atlas-auto-subtab", "proactive");
				} catch {
					// ignore
				}
				void this.activateMasterTab("automations");
			},
		});

		this.addCommand({
			id: "atlas-master-study",
			name: "Master Sidebar → Study (flashcards + papers)",
			callback: () => this.activateMasterTab("study"),
		});

		this.addCommand({
			id: "atlas-master-status",
			name: "Master Sidebar → Status (Ollama + RAM)",
			callback: () => this.activateMasterTab("status"),
		});

		this.addCommand({
			id: "atlas-master-suggest",
			name: "Master Sidebar → Smart Suggestions",
			callback: () => this.activateMasterTab("suggest"),
		});

		// ─── v0.4 Sprint 3: Tutorial + Achievement commands ───

		this.addCommand({
			id: "atlas-tour-first-steps",
			name: "Tour: Primeiros passos (recomendado começar aqui)",
			callback: () => this.startTutorial("first-steps"),
		});

		this.addCommand({
			id: "atlas-tour-1on1",
			name: "Tour: Como rodar seu primeiro 1:1",
			callback: () => this.startTutorial("one-on-one"),
		});

		this.addCommand({
			id: "atlas-tour-weekly",
			name: "Tour: Como gerar weekly report automático",
			callback: () => this.startTutorial("weekly-report"),
		});

		this.addCommand({
			id: "atlas-tour-flashcards",
			name: "Tour: Spaced repetition + flashcards",
			callback: () => this.startTutorial("flashcards"),
		});

		this.addCommand({
			id: "atlas-tour-kg",
			name: "Tour: Como o Knowledge Graph funciona",
			callback: () => this.startTutorial("knowledge-graph"),
		});

		this.addCommand({
			id: "atlas-tours-list",
			name: "Tours disponíveis (escolher)",
			callback: () => this.showTourPicker(),
		});

		this.addCommand({
			id: "atlas-achievements",
			name: "🏆 Achievements & XP",
			callback: () => this.showAchievements(),
		});

		// ─── v0.4 Sprint 4: Auto-organização ───

		this.addCommand({
			id: "atlas-vault-wizard",
			name: "🧹 Vault Wizard (cleanup multi-step)",
			callback: () => new VaultWizardModal(this.app, this).open(),
		});

		this.addCommand({
			id: "atlas-rules-evaluate-active",
			name: "Rules: avaliar nota ativa (preview)",
			callback: async () => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					new Notice("Atlas: abra uma nota.");
					return;
				}
				const matches = await this.ruleEngine.evaluate(file);
				if (matches.length === 0) {
					new Notice("Atlas: nenhuma rule match para esta nota.");
					return;
				}
				const lines = matches.map((m) => `• ${m.rule.name}: ${m.preview}`);
				new Notice(`Atlas rules:\n${lines.join("\n")}`, 12000);
			},
		});

		this.addCommand({
			id: "atlas-rules-apply-active",
			name: "Rules: aplicar agora na nota ativa",
			callback: async () => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					new Notice("Atlas: abra uma nota.");
					return;
				}
				const matches = await this.ruleEngine.evaluate(file);
				if (matches.length === 0) {
					new Notice("Atlas: nenhuma rule match.");
					return;
				}
				const r = await this.ruleEngine.applyAll(matches);
				new Notice(`Atlas: ${r.applied} aplicadas, ${r.failed} falharam.`);
			},
		});

		this.addCommand({
			id: "atlas-moc-folder",
			name: "Gerar MoC para pasta atual",
			callback: async () => {
				const file = this.app.workspace.getActiveFile();
				const folder = file?.parent?.path ?? "";
				if (!folder) {
					new Notice("Atlas: abra uma nota dentro de uma pasta.");
					return;
				}
				const gen = new AutoMocGenerator(this.app, this);
				try {
					const r = await gen.generate({
						source: { kind: "folder", path: folder },
						groupBy: "type",
					});
					const f = this.app.vault.getAbstractFileByPath(r.notePath);
					if (f && "stat" in f) {
						await this.app.workspace.getLeaf().openFile(f as never);
					}
				} catch (e) {
					new Notice(`Atlas: ${String(e)}`);
				}
			},
		});

		// ─── v0.4 Sprint 5: Entity Trees ───

		this.addCommand({
			id: "atlas-tree-people",
			name: "🌳 Árvore de Pessoas",
			callback: () => new EntityTreesModal(this.app, this, "people").open(),
		});

		this.addCommand({
			id: "atlas-tree-projects",
			name: "🌳 Árvore de Projetos",
			callback: () => new EntityTreesModal(this.app, this, "projects").open(),
		});

		this.addCommand({
			id: "atlas-tree-themes",
			name: "🌳 Árvore de Temas",
			callback: () => new EntityTreesModal(this.app, this, "themes").open(),
		});

		this.addCommand({
			id: "atlas-moc-tag",
			name: "Gerar MoC para tag (pergunta qual)",
			callback: async () => {
				const tag = await promptInput(this.app, "Tag (sem #):");
				if (!tag) return;
				const gen = new AutoMocGenerator(this.app, this);
				try {
					const r = await gen.generate({
						source: { kind: "tag", tag: tag.replace(/^#+/, "") },
						groupBy: "type",
					});
					const f = this.app.vault.getAbstractFileByPath(r.notePath);
					if (f && "stat" in f) {
						await this.app.workspace.getLeaf().openFile(f as never);
					}
				} catch (e) {
					new Notice(`Atlas: ${String(e)}`);
				}
			},
		});

		this.addCommand({
			id: "atlas-scan-reminders",
			name: "Reminders: escanear vault agora",
			callback: async () => {
				await this.reminderWatcher.tick(15);
				const upcoming = await this.reminderWatcher.listUpcoming(7);
				const overdue = await this.reminderWatcher.listOverdue();
				new Notice(
					`Atlas: ${upcoming.length} próximas (7d), ${overdue.length} atrasadas.`,
					8000
				);
			},
		});

		this.addCommand({
			id: "atlas-proactive-check",
			name: "Detecção proativa: rodar agora",
			callback: () => this.runProactiveCheck(),
		});

		this.addCommand({
			id: "atlas-toggle-coach-mode",
			name: "Alternar Coach Mode ↔ Work Mode",
			callback: () => toggleCoachMode(this),
		});

		this.addCommand({
			id: "atlas-flashcards-from-note",
			name: "Estudo: gerar flashcards desta nota",
			callback: () => generateFlashcardsFromActiveNote(this),
		});

		this.addCommand({
			id: "atlas-flashcards-review",
			name: "Estudo: sessão de spaced repetition (revisar)",
			callback: () => new ReviewSessionModal(this.app, this).open(),
		});

		this.addCommand({
			id: "atlas-flashcards-export-anki",
			name: "Estudo: exportar flashcards para Anki (TSV)",
			callback: () => exportFlashcardsAsCsv(this),
		});

		this.addCommand({
			id: "atlas-flashcards-export-sr",
			name: "Estudo: exportar para Obsidian Spaced Repetition (.md)",
			callback: () => exportFlashcardsAsObsidianSr(this),
		});

		this.addCommand({
			id: "atlas-flashcards-stats",
			name: "Estudo: estatísticas do deck",
			callback: () => {
				const s = this.flashcards.stats();
				new Notice(
					`Atlas Flashcards:\nTotal: ${s.total}\nDevido: ${s.due}\nNovos: ${s.new}\nReview: ${s.review}\nLearning: ${s.learning}`,
					10000
				);
			},
		});

		this.addCommand({
			id: "atlas-socratic",
			name: "Estudo: Feynman check (perguntas socráticas)",
			callback: () => new SocraticModal(this.app, this).open(),
		});

		this.addCommand({
			id: "atlas-onboarding",
			name: "Onboarding wizard (rodar de novo)",
			callback: () => new OnboardingWizard(this.app, this).open(),
		});

		this.addCommand({
			id: "atlas-inline-ai",
			name: "Inline AI (reescrever / resumir / explicar / traduzir)",
			hotkeys: [{ modifiers: ["Mod", "Shift"], key: "i" }],
			callback: () => openInlineAi(this),
		});

		this.addCommand({
			id: "atlas-smart-paste",
			name: "Smart paste (URL → metadata, JSON → format, code → fenced)",
			hotkeys: [{ modifiers: ["Mod", "Shift"], key: "v" }],
			callback: () => smartPaste(this),
		});

		this.addCommand({
			id: "atlas-open-hub",
			name: "Action Items Hub (abrir)",
			callback: () => this.activateMasterTab("hub"),
		});

		this.addCommand({
			id: "atlas-open-suggestions",
			name: "Smart suggestions sidebar (abrir)",
			callback: () => this.activateMasterTab("suggest"),
		});

		this.addCommand({
			id: "atlas-tag-active-note",
			name: "Auto-tag: aplicar agora na nota ativa",
			callback: async () => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					new Notice("Atlas: abra uma nota primeiro.");
					return;
				}
				new Notice("Atlas: gerando tags...");
				await this.autoTagger.tagFileNow(file);
			},
		});

		this.addCommand({
			id: "atlas-find-aliases",
			name: "Auto-aliasing: detectar duplicatas no KG",
			callback: () => new AutoAliasingModal(this.app, this.autoAliaser).open(),
		});

		this.addCommand({
			id: "atlas-reasoning",
			name: "Pense comigo (CoT — decisões / RCA / planning)",
			hotkeys: [{ modifiers: ["Mod", "Shift"], key: "r" }],
			callback: () => new ReasoningModal(this.app, this).open(),
		});

		this.addCommand({
			id: "atlas-auto-summary",
			name: "Auto-summary: TLDR no topo da nota ativa",
			callback: () => generateSummaryForActiveNote(this),
		});

		this.addCommand({
			id: "atlas-toggle-reranker",
			name: "Reranker: alternar ON/OFF",
			callback: async () => {
				this.settings.performance.rerankerEnabled =
					!this.settings.performance.rerankerEnabled;
				await this.saveSettings();
				new Notice(
					`Atlas reranker: ${this.settings.performance.rerankerEnabled ? "ON" : "OFF"}`
				);
			},
		});

		this.addCommand({
			id: "atlas-spotlight",
			name: "Atlas Spotlight (busca + ações universais)",
			hotkeys: [{ modifiers: ["Mod"], key: "k" }],
			callback: () => new SpotlightModal(this.app, this).open(),
		});

		this.addCommand({
			id: "atlas-open-today",
			name: "Atlas Today (dashboard)",
			callback: () => this.activateMasterTab("today"),
		});

		this.addCommand({
			id: "atlas-serendipity-now",
			name: "Serendipity: mostrar nota antiga relevante agora",
			callback: () => this.serendipity.tick(),
		});

		this.addCommand({
			id: "atlas-year-in-review",
			name: "Year in Review (Atlas Wrapped)",
			callback: async () => {
				const notice = new Notice("Atlas: gerando Year in Review...", 0);
				try {
					const tool = new YearInReviewTool(this.app, this);
					const r = await tool.generate();
					notice.hide();
					const file = this.app.vault.getAbstractFileByPath(r.notePath);
					if (file && "stat" in file) {
						await this.app.workspace.getLeaf().openFile(file as never);
					}
					new Notice("Atlas: Year in Review pronto!");
				} catch (e) {
					notice.hide();
					new Notice(`Atlas: erro — ${String(e)}`, 8000);
				}
			},
		});

		this.addCommand({
			id: "atlas-time-capsule",
			name: "Time Capsule: criar cápsula que abre no futuro",
			callback: () => new TimeCapsuleModal(this.app, this).open(),
		});

		this.addCommand({
			id: "atlas-check-capsules",
			name: "Time Capsule: verificar entregas do dia",
			callback: () => this.capsuleWatcher.checkDeliveries(),
		});

		// ─── v0.3 INNOVATIONS ───

		this.addCommand({
			id: "atlas-context-collapse",
			name: "Context Collapse: insight unificador sobre uma pessoa",
			callback: async () => {
				const people = this.kg.listPeople();
				if (people.length === 0) {
					new Notice("Atlas: KG vazio. Indexe o vault primeiro.");
					return;
				}
				const person = await pickFromList(
					this.app,
					"Pessoa para Context Collapse:",
					people.map((p) => p.name)
				);
				if (!person) return;
				const tool = new ContextCollapseTool(this.app, this);
				const result = await tool.run({ personName: person });
				if (result) {
					const f = this.app.vault.getAbstractFileByPath(result.notePath);
					if (f && "stat" in f) {
						await this.app.workspace.getLeaf().openFile(f as never);
					}
					new Notice(`Atlas: Context Collapse pronto.`);
				}
			},
		});

		this.addCommand({
			id: "atlas-manager-readme",
			name: "Manager README (auto-gerar a partir do histórico)",
			callback: async () => {
				const tool = new ManagerReadmeTool(this.app, this);
				const r = await tool.generate();
				if (r) {
					const f = this.app.vault.getAbstractFileByPath(r.notePath);
					if (f && "stat" in f) {
						await this.app.workspace.getLeaf().openFile(f as never);
					}
					new Notice("Atlas: Manager README gerado. Revise antes de compartilhar.");
				}
			},
		});

		this.addCommand({
			id: "atlas-premortem-oracle",
			name: "Pre-mortem Oracle (prever falhas de novo projeto)",
			callback: () => new PreMortemModal(this.app, this).open(),
		});

		this.addCommand({
			id: "atlas-decision-diary",
			name: "Decision Diary do mês (compilar decisões)",
			callback: async () => {
				const now = new Date();
				const tool = new DecisionDiaryTool(this.app, this);
				const path = await tool.generateForMonth(now.getFullYear(), now.getMonth() + 1);
				const f = this.app.vault.getAbstractFileByPath(path);
				if (f && "stat" in f) {
					await this.app.workspace.getLeaf().openFile(f as never);
				}
				new Notice("Atlas: Decision Diary gerado.");
			},
		});

		this.addCommand({
			id: "atlas-workspace-health",
			name: "Workspace Health dashboard (abrir)",
			callback: () => this.activateMasterTab("health"),
		});

		this.addCommand({
			id: "atlas-podcast-generator",
			name: "Podcast: gerar áudio NPR-style do weekly ativo",
			callback: async () => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					new Notice("Atlas: abra um weekly report primeiro.");
					return;
				}
				const tool = new PodcastGeneratorTool(this.app, this);
				const r = await tool.generateFromWeekly(file.path);
				if (r) {
					const f = this.app.vault.getAbstractFileByPath(r.scriptPath);
					if (f && "stat" in f) {
						await this.app.workspace.getLeaf().openFile(f as never);
					}
				}
			},
		});

		// ─── v0.4 BUG FIX commands ───

		this.addCommand({
			id: "atlas-status-panel",
			name: "Atlas Status Panel (RAM + Ollama + modelos)",
			hotkeys: [{ modifiers: ["Mod", "Shift"], key: "s" }],
			callback: () => this.activateMasterTab("status"),
		});

		this.addCommand({
			id: "atlas-pull-recommended-model",
			name: "Pull qwen2.5:7b (modelo leve recomendado)",
			callback: () => pullRecommendedModel(this),
		});

		this.addCommand({
			id: "atlas-restart-ollama",
			name: "Como reiniciar Ollama (instruções)",
			callback: () => {
				new Notice(
					"Atlas: Para reiniciar o Ollama, feche o app Ollama e abra de novo. Ou no terminal: `pkill ollama && ollama serve`.",
					12000
				);
			},
		});

		this.addCommand({
			id: "atlas-show-error-help",
			name: "Diagnóstico: ajuda com último erro",
			callback: async () => {
				const last = this.lastAtlasError;
				if (!last) {
					new Notice("Atlas: nenhum erro registrado.");
					return;
				}
				new OllamaErrorModal(this.app, this, last).open();
			},
		});

		this.addCommand({
			id: "atlas-apply-templates",
			name: "Aplicar templates no vault",
			callback: () => applyTemplatesToVault(this),
		});

		this.addCommand({
			id: "atlas-tts-selection",
			name: "Voz: ler seleção em voz alta (Piper TTS)",
			editorCallback: async (editor) => {
				const text = editor.getSelection() || editor.getValue().substring(0, 2000);
				if (!this.tts.configured) {
					new Notice("Atlas: Piper TTS não configurado. Settings → Atlas → Voice.");
					return;
				}
				try {
					await this.tts.speakNow(text);
				} catch (e) {
					new Notice(`Atlas TTS: ${String(e)}`, 10000);
				}
			},
		});
	}

	updateStatusBar(): void {
		if (!this.statusBar) return;
		const stats = this.flashcards?.stats();
		const due = stats?.due ?? 0;
		const dueLabel = due > 0 ? ` · 🃏 ${due}` : "";
		this.statusBar.setText(`${getModeLabel()}${dueLabel}`);
	}

	async activateChatView(): Promise<void> {
		await this.activateMasterTab("chat");
	}

	async activateView(viewType: string): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(viewType)[0];
		if (!leaf) {
			const right = workspace.getRightLeaf(false);
			if (!right) {
				new Notice("Atlas: não foi possível abrir painel à direita.");
				return;
			}
			await right.setViewState({ type: viewType, active: true });
			leaf = right;
		}
		workspace.revealLeaf(leaf);
	}

	/**
	 * Abre Master Sidebar e ativa a tab pedida. Cria leaf se não existir.
	 */
	async activateMasterTab(tabId: TabId): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(ATLAS_MASTER_VIEW)[0];
		if (!leaf) {
			const right = workspace.getRightLeaf(false);
			if (!right) {
				new Notice("Atlas: não foi possível abrir painel à direita.");
				return;
			}
			await right.setViewState({ type: ATLAS_MASTER_VIEW, active: true });
			leaf = right;
		}
		workspace.revealLeaf(leaf);
		const view = leaf.view;
		if (view instanceof AtlasMasterSidebarView) {
			await view.activateTab(tabId);
		}
	}

	private async runProactiveCheck(): Promise<void> {
		try {
			await this.proactive.checkUpcomingMeetings(
				this.settings.behavior.minutesBeforeMeetingNotification
			);
			await this.proactive.checkEmergingPatterns();
			await this.proactive.checkInactivePeople();
			await this.proactive.checkOverdueCommitments();
		} catch (e) {
			logger.warn("proactive check falhou", { error: String(e) });
		}
	}

	private async runMorningBriefing(): Promise<void> {
		const tool = new BriefingsTool(this.app, this.kg, {
			daily: this.settings.folders.daily,
			meetings: this.settings.folders.meetings,
			raid: this.settings.folders.raid,
		});
		const { markdown, html, data } = await tool.morningBriefing();

		const sentence = `${data.dateLabel}: ${data.meetingsToday.length} reuniões, ${data.tasksDueToday.length} tasks, ${data.overdueTasksCount > 0 ? data.overdueTasksCount + " atrasadas, " : ""}${data.openCommitmentsCount} commitments.`;

		await this.notifier.notify({
			title: "🌅 Atlas Briefing",
			message: sentence,
			severity: data.openCriticalRisks.length > 0 ? "high" : "medium",
			channels: ["inAppNotice", "desktop", "telegram"],
		});

		// Save markdown to vault for later viewing
		const date = new Date().toISOString().split("T")[0];
		const path = normalizePath(`${this.settings.folders.atlas}/briefings/morning-${date}.md`);
		await this.writeBriefingNote(path, markdown);

		// Optionally email
		if (
			this.settings.email.enabled &&
			this.settings.email.smtpUser &&
			this.settings.email.fromAddress
		) {
			await this.emailBriefing("Briefing Matinal — " + data.dateLabel, html);
		}
	}

	private async runEveningReview(): Promise<void> {
		const tool = new BriefingsTool(this.app, this.kg, {
			daily: this.settings.folders.daily,
			meetings: this.settings.folders.meetings,
			raid: this.settings.folders.raid,
		});
		const { markdown, data } = await tool.eveningReview();

		const sentence = `Hoje: ${data.tasksDueToday.length} tasks dia, ${data.overdueTasksCount} atrasadas. Daily log?`;

		await this.notifier.notify({
			title: "🌇 Atlas",
			message: sentence,
			severity: "low",
			channels: ["inAppNotice", "desktop"],
		});

		const date = new Date().toISOString().split("T")[0];
		const path = normalizePath(`${this.settings.folders.atlas}/briefings/evening-${date}.md`);
		await this.writeBriefingNote(path, markdown);
	}

	private async writeBriefingNote(path: string, content: string): Promise<void> {
		const dir = path.split("/").slice(0, -1).join("/");
		if (!this.app.vault.getAbstractFileByPath(dir)) {
			try {
				await this.app.vault.createFolder(dir);
			} catch {
				// already exists race condition
			}
		}
		const existing = this.app.vault.getAbstractFileByPath(path);
		try {
			if (existing && "stat" in existing) {
				await this.app.vault.modify(existing as never, content);
			} else {
				await this.app.vault.create(path, content);
			}
		} catch (e) {
			logger.warn("briefing: write falhou", { path, error: String(e) });
		}
	}

	private async emailBriefing(subject: string, html: string): Promise<void> {
		const cfg = this.settings.email;
		const password = decryptLight(cfg.smtpPasswordEncrypted, this.app.vault.getName());
		if (!password) return;

		const recipients = cfg.fromAddress
			.split(/[,;\n]+/)
			.map((s) => s.trim())
			.filter(Boolean);
		if (recipients.length === 0) return;

		const sender = new EmailSender({
			host: cfg.smtpHost,
			port: cfg.smtpPort,
			secure: cfg.smtpSecure,
			user: cfg.smtpUser,
			password,
			fromAddress: cfg.fromAddress,
			fromName: cfg.fromName,
		});

		try {
			await sender.send({ to: recipients, subject, html });
			await this.auditLog({ action: "briefing.emailed", subject, to: recipients });
		} catch (e) {
			logger.warn("briefing email falhou", { error: String(e) });
		}
	}

	private async testEmail(): Promise<void> {
		const cfg = this.settings.email;
		if (!cfg.enabled) {
			new Notice("Atlas: email desabilitado.");
			return;
		}
		const password = decryptLight(cfg.smtpPasswordEncrypted, this.app.vault.getName());
		if (!password) {
			new Notice("Atlas: configure SMTP password primeiro.");
			return;
		}

		const sender = new EmailSender({
			host: cfg.smtpHost,
			port: cfg.smtpPort,
			secure: cfg.smtpSecure,
			user: cfg.smtpUser,
			password,
			fromAddress: cfg.fromAddress,
			fromName: cfg.fromName,
		});

		const r = await sender.verify();
		if (r.ok) {
			new Notice("Atlas: SMTP OK ✓");
		} else {
			new Notice(`Atlas: SMTP falhou — ${r.error}`, 12000);
		}
	}

	// ─────────────────────────────────────────────────────────────

	private applySchedules(): void {
		this.scheduler.cancelAll();

		const s = this.settings.schedules;

		if (s.morningBriefingEnabled) {
			try {
				this.scheduler.schedule({
					id: "morning-briefing",
					cronExpression: timeToCron(s.morningBriefingTime),
					description: "Briefing matinal",
					handler: () => this.runMorningBriefing(),
				});
			} catch (e) {
				logger.warn("schedule morning falhou", { error: String(e) });
			}
		}

		if (s.eveningReviewEnabled) {
			try {
				this.scheduler.schedule({
					id: "evening-review",
					cronExpression: timeToCron(s.eveningReviewTime),
					description: "Evening review",
					handler: () => this.runEveningReview(),
				});
			} catch (e) {
				logger.warn("schedule evening falhou", { error: String(e) });
			}
		}

		if (s.weeklyReportEnabled) {
			try {
				this.scheduler.schedule({
					id: "weekly-report",
					cronExpression: timeToCron(s.weeklyReportTime, s.weeklyReportDay),
					description: "Weekly report",
					handler: () => generateWeeklyReportCommand(this),
				});
			} catch (e) {
				logger.warn("schedule weekly falhou", { error: String(e) });
			}
		}

		// Hourly task watcher: detect overdue tasks (KG) and notify
		this.scheduler.schedule({
			id: "task-watcher",
			cronExpression: "0 9,14 * * *", // 9h and 14h
			description: "Watcher: tasks vencidas (KG)",
			handler: () => this.runTaskWatcher(),
		});

		// Reminder watcher: every 5 min check (@datetime) markers
		this.scheduler.schedule({
			id: "reminder-tick",
			cronExpression: "*/5 * * * *",
			description: "Tick: reminders @datetime",
			handler: () => this.reminderWatcher.tick(15),
		});

		// Proactive detection: pre-meeting (every 5 min)
		this.scheduler.schedule({
			id: "proactive-meetings",
			cronExpression: "*/5 * * * *",
			description: "Pre-meeting nudge",
			handler: () =>
				this.proactive.checkUpcomingMeetings(
					this.settings.behavior.minutesBeforeMeetingNotification
				),
		});

		// Proactive: patterns + inactive + overdue commitments (daily 9h)
		this.scheduler.schedule({
			id: "proactive-daily",
			cronExpression: "0 9 * * *",
			description: "Detecção diária: padrões, inatividade, commitments",
			handler: async () => {
				await this.proactive.checkEmergingPatterns();
				await this.proactive.checkInactivePeople();
				await this.proactive.checkOverdueCommitments();
				await this.checkBurnoutSignal();
			},
		});

		// Serendipity: 3×/dia (10h, 14h, 19h)
		this.scheduler.schedule({
			id: "serendipity",
			cronExpression: "0 10,14,19 * * *",
			description: "Serendipity: nota antiga relevante",
			handler: () => this.serendipity.tick(),
		});

		// Capsule deliveries: daily 9h
		this.scheduler.schedule({
			id: "capsule-watcher",
			cronExpression: "0 9 * * *",
			description: "Time capsule: verifica entregas",
			handler: () => this.capsuleWatcher.checkDeliveries(),
		});

		// Year in Review: 31 de dezembro 18h
		this.scheduler.schedule({
			id: "year-in-review-trigger",
			cronExpression: "0 18 31 12 *",
			description: "Year in Review trigger",
			handler: async () => {
				await this.notifier.notify({
					title: "🎉 Atlas Wrapped chegou!",
					message: "Seu Year in Review está pronto. Click pra ver.",
					severity: "high",
					channels: ["inAppNotice", "desktop", "telegram"],
				});
				const tool = new YearInReviewTool(this.app, this);
				await tool.generate();
			},
		});

		logger.info(`schedules ativos: ${this.scheduler.listJobs().join(", ")}`);
	}

	/**
	 * Burnout detector: 3+ daily logs com mood/energy baixo nos últimos 5 dias.
	 */
	private async checkBurnoutSignal(): Promise<void> {
		const dailyFolder = this.settings.folders.daily;
		const lowDays: string[] = [];

		for (let i = 0; i < 7; i++) {
			const d = new Date(Date.now() - i * 86_400_000);
			const yyyy = d.getFullYear();
			const mm = String(d.getMonth() + 1).padStart(2, "0");
			const dd = String(d.getDate()).padStart(2, "0");
			const path = `${dailyFolder}/${yyyy}/${mm}/${yyyy}-${mm}-${dd}.md`;
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!file || !("stat" in file)) continue;
			const cache = this.app.metadataCache.getFileCache(file as never);
			const fm = cache?.frontmatter ?? {};
			const moodVal = parseNumeric(fm.mood);
			const energyVal = parseNumeric(fm.energy);
			if (
				(moodVal !== null && moodVal <= 2) ||
				(energyVal !== null && energyVal <= 2)
			) {
				lowDays.push(`${yyyy}-${mm}-${dd}`);
			}
		}

		if (lowDays.length >= 3) {
			await this.notifier.notify({
				title: "🩺 Atlas — sinal de cuidado",
				message: `${lowDays.length} dias com mood/energy baixos nos últimos 7. Pausa hoje?`,
				severity: "high",
				channels: ["inAppNotice", "desktop"],
			});
		}
	}

	private async runTaskWatcher(): Promise<void> {
		const today = new Date().toISOString().split("T")[0];
		const overdue = this.kg.data.actionItems.filter(
			(a) =>
				a.status !== "completed" &&
				a.status !== "cancelled" &&
				a.dueDate &&
				a.dueDate < today
		);
		if (overdue.length === 0) return;

		await this.notifier.notify({
			title: "📋 Atlas",
			message: `${overdue.length} tasks atrasadas. Revisar?`,
			severity: overdue.length > 5 ? "high" : "medium",
			channels: ["inAppNotice", "desktop"],
		});
	}
}
