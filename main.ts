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
import { injectGlobalAnimationStyles } from "./src/ui/animations";
import { SplashScreen } from "./src/ui/splash";
import { applyAtlasTheme, removeAtlasTheme } from "./src/ui/theme-applier";
import { AtlasHUD } from "./src/ui/atlas-hud";

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
	extractionCache?: import("./src/kg/extraction-cache").ExtractionCache;
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
	hud!: AtlasHUD;
	// v0.17 — Cloud AI providers + cost tracking
	providerRouter: import("./src/providers/router").ProviderRouter | null = null;
	// v0.18 — LLMService façade (single entry point for ALL LLM calls)
	llm!: import("./src/providers/llm-service").LLMService;
	lastAtlasError: AtlasError | null = null;
	private capsuleWatcher!: CapsuleWatcher;
	private audit!: AuditLog;
	reminderWatcher!: ReminderWatcher;
	proactive!: ProactiveDetector;
	private statusBar: HTMLElement | null = null;
	private easterEggs: { unmount: () => void } | null = null;

	async onload(): Promise<void> {
		logger.info("Atlas plugin carregando...");
		await this.loadSettings();

		addIcon("atlas-brain", ATLAS_ICON);

		// v0.7 Sprint 12: animations
		injectGlobalAnimationStyles();

		// v0.7.1 P0 fix: Atlas theme aplicado dinamicamente (fix bug "color theme não aplica")
		applyAtlasTheme(this);

		// Core services
		this.ollama = new OllamaClient({
			baseUrl: this.settings.ollama.baseUrl,
			timeout_ms: this.settings.ollama.timeout_ms,
		});

		// v0.7.1 P0 fix: OOM auto-switch — registra hook que recomenda modelo menor
		this.ollama.setOOMFallback({
			recommendSmaller: (currentModel: string) => {
				// Tabela hardcoded de fallback (do maior pro menor)
				const fallbacks: Record<string, string> = {
					"qwen2.5:32b": "qwen2.5:14b",
					"qwen2.5:14b": "qwen2.5:7b-instruct",
					"qwen2.5:7b-instruct": "qwen2.5:1.5b",
					"qwen2.5:1.5b": "qwen2.5:0.5b",
					"qwen2.5-coder:32b": "qwen2.5-coder:14b",
					"qwen2.5-coder:14b": "qwen2.5:7b-instruct",
					"phi4": "phi4-mini",
					"llama3.1:8b-instruct-q4_K_M": "llama3.2:3b",
					"llama3.2:3b": "llama3.2:1b",
				};
				return fallbacks[currentModel] ?? null;
			},
			onSwitch: (from, to) => {
				new Notice(
					`⚠️ Atlas: ${from} estourou RAM. Trocando automaticamente para ${to}...`,
					6000
				);
				this.settings.ollama.generationModel = to;
				void this.saveSettings();
			},
		});

		this.kg = new KGStore(this.app, this.settings.folders.atlas);
		await this.kg.load();

		// v0.47 E5: Extraction cache — skip LLM em re-index quando hash não mudou (~90% cost cut)
		try {
			const { ExtractionCache } = await import("./src/kg/extraction-cache");
			this.extractionCache = new ExtractionCache(this.app, this.settings.folders.atlas);
			await this.extractionCache.load();
		} catch (e) {
			logger.warn("extraction-cache: init failed", { error: String(e) });
		}

		// v0.17 — initialize provider router with cloud API keys + budget
		try {
			const { ProviderRouter } = await import("./src/providers/router");
			const { CostTracker } = await import("./src/providers/cost-tracker");
			const apiKeys: Record<string, string> = {};
			const stored = (this.settings.providers?.apiKeys ?? {}) as Record<string, string | undefined>;
			const map: Record<string, string> = {
				openaiEncrypted: "openai",
				anthropicEncrypted: "anthropic",
				googleEncrypted: "google",
				mistralEncrypted: "mistral",
				xaiEncrypted: "xai",
				openrouterEncrypted: "openrouter",
				groqEncrypted: "groq",
				deepseekEncrypted: "deepseek",
			};
			for (const [field, providerId] of Object.entries(map)) {
				const v = stored[field];
				if (v) apiKeys[providerId] = v;
			}
			const budget = this.settings.providers?.budget ?? { enabled: false, hardCutoff: false, warnAtPct: 0.8 };
			const costTracker = new CostTracker(this.app, budget);
			costTracker.onWarn((pct, kind) => {
				new Notice(`⚠️ Atlas budget ${kind}: ${(pct * 100).toFixed(0)}% consumido.`, 8000);
			});
			this.providerRouter = new ProviderRouter(
				this.app,
				{
					apiKeys: apiKeys as never,
					routing: (this.settings.providers?.routing ?? {}) as never,
					failoverChain: (this.settings.providers?.failoverChain ?? ["ollama"]) as never,
					preferLocalForCheap: this.settings.providers?.preferLocalForCheap ?? true,
				},
				costTracker
			);
			this.providerRouter.attachOllama(this.ollama);
			logger.info("Atlas v0.17: provider router attached", {
				configured: this.providerRouter.listConfiguredProviders(),
			});
		} catch (e) {
			logger.warn("Atlas: provider router falhou ao iniciar", { error: String(e) });
		}

		// v0.18 — LLMService façade (single entry point: cloud-or-ollama auto)
		try {
			const { createLLMService } = await import("./src/providers/llm-service");
			this.llm = createLLMService(this);
			// Wire LLMService into Embedder so all chunk embeddings route via router
			this.embedder.setLLMService(this.llm);

			// v0.18: auto-default embeddings to OpenAI when OpenAI key configured
			// (decisão do user: "Cloud auto se key configurada")
			if (
				this.providerRouter &&
				this.settings.providers?.apiKeys?.openaiEncrypted &&
				!this.settings.providers?.routing?.embedding
			) {
				if (!this.settings.providers.routing) this.settings.providers.routing = {};
				this.settings.providers.routing.embedding = {
					provider: "openai",
					model: "text-embedding-3-small",
				};
				await this.saveSettings();
				this.providerRouter.updateConfig({ routing: this.settings.providers.routing as never });
				logger.info("Atlas v0.18: auto-routed embeddings to OpenAI text-embedding-3-small");
			}

			logger.info("Atlas v0.18: llm service initialized");
		} catch (e) {
			logger.warn("Atlas: LLMService falhou ao iniciar — fallback ollama-only", { error: String(e) });
		}

		// v0.21 Sprint A: silent whisper auto-detect on first-run if not yet configured
		try {
			if (!this.settings.voice.whisperBinaryPath) {
				const { autoDetectWhisper, logDetection } = await import("./src/automation/whisper-detector");
				const detection = await autoDetectWhisper();
				logDetection(detection);
				if (detection.installed && detection.binaryPath) {
					this.settings.voice.whisperBinaryPath = detection.binaryPath;
					if (detection.modelPath && !this.settings.voice.whisperModelPath) {
						this.settings.voice.whisperModelPath = detection.modelPath;
					}
					await this.saveSettings();
					logger.info("Atlas v0.21: whisper.cpp auto-configured silently", {
						binary: detection.binaryPath,
						model: detection.modelPath,
					});
				}
			}
		} catch (e) {
			logger.warn("Atlas: whisper auto-detect falhou", { error: String(e) });
		}

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
			[this.settings.folders.atlas, this.app.vault.configDir, ".trash", "99_Archive"]
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

		// Status bar — v0.8.4: click toggle HUD; right-click toggle coach mode
		this.statusBar = this.addStatusBarItem();
		this.statusBar.addClass("atlas-status");
		this.statusBar.style.cursor = "pointer";
		this.statusBar.title = "Click: toggle HUD · Right-click: toggle coach mode";
		this.statusBar.addEventListener("click", () => this.hud?.toggle());
		this.statusBar.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			void toggleCoachMode(this);
		});
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
					this.app.vault.configDir,
					".trash",
				],
			}
		);
		// v0.22 Sprint H: opt-in cloud (default OFF — auto-tagger roda em cada save = high freq cost risk)
		const allowAutoTaggerCloud = Boolean(this.settings.providers?.allowAutoTaggerCloud);
		if (this.llm) {
			this.autoTagger.configureCloud(allowAutoTaggerCloud, {
				willUseCloud: () => this.llm.willUseCloud("extraction"),
				chat: (msgs, opts) => this.llm.chat(
					msgs as Parameters<typeof this.llm.chat>[0],
					opts as Parameters<typeof this.llm.chat>[1]
				),
			});
		}
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
		// v0.23: wire LLMService for cloud routing opt-in
		if (this.llm) this.serendipity.setLLMService(this.llm);
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

		// v0.45 E3: Course detector watcher (auto-link cursos em notas no save)
		try {
			const cdMod = await import("./src/automation/course-detector");
			const cd = new cdMod.CourseDetectorWatcher(this.app, this);
			cd.start();
		} catch (e) {
			logger.warn("v0.45: CourseDetectorWatcher failed", { error: String(e) });
		}

		// Visual Template Editor store (v0.5 Sprint 9)
		this.templateStore = new TemplateStore(this.app, this.settings.folders.atlas);
		await this.templateStore.load();

		// v0.7.4: HUD floating Jarvis
		this.hud = new AtlasHUD(this);

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
			// v0.7.1 P0 fix: dispara tour AUTOMATICAMENTE baseado em initialGoal
			const initialGoal =
				(this.settings.profile as Record<string, unknown> | undefined)?.initialGoal as string | undefined;
			const goalToTour: Record<string, string> = {
				"weekly-report": "weekly-report",
				"1on1-prep": "one-on-one",
				research: "flashcards",
				personal: "first-steps",
			};
			const tourId = (initialGoal && goalToTour[initialGoal]) ?? "first-steps";
			window.setTimeout(() => {
				try {
					this.startTutorial(tourId);
				} catch {
					new Notice(
						"💡 Atlas: rode 'Atlas: Tour: Primeiros passos' (Cmd+P) quando quiser.",
						10000
					);
				}
			}, 3500);
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

		// v0.11: Easter eggs (Konami code listener)
		try {
			const m = await import("./src/ui/easter-eggs");
			this.easterEggs = new m.EasterEggsListener(this);
			(this.easterEggs as unknown as { mount: () => void }).mount();
		} catch (e) {
			logger.warn("easter-eggs failed to mount", { error: String(e) });
		}

		logger.info("Atlas plugin pronto.");
	}

	async onunload(): Promise<void> {
		logger.info("Atlas plugin descarregando...");
		// v0.44 E1: P0 — flush pending KG saves antes de unmount.
		// Sem isso, debounced timer (1.5s) é cancelado no disable → última edição
		// (ex: criar pessoa) fica só em RAM e perde.
		try {
			await this.kg?.save();
			// v0.47 E5: also flush extraction cache pra preservar reuse cross-session
			await this.extractionCache?.save();
		} catch (e) {
			logger.error("v0.44: failed to flush KG on unload", { error: String(e) });
		}
		this.scheduler?.cancelAll();
		this.hud?.hide();
		this.easterEggs?.unmount();
		removeAtlasTheme();
	}

	async loadSettings(): Promise<void> {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		// v0.7.1: re-apply theme (cor accent pode ter mudado)
		applyAtlasTheme(this);
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

	private webhookServer: { close: () => void } | null = null;

	toggleWebhookReceiver(): void {
		if (this.webhookServer) {
			this.webhookServer.close();
			this.webhookServer = null;
			new Notice("🔌 Atlas: webhook receiver desligado.");
			return;
		}
		void this.startWebhookReceiver();
	}

	private async startWebhookReceiver(): Promise<void> {
		try {
			const http = await import("http");
			const port = 7842;
			const token = "atlas-" + Math.random().toString(36).substring(2, 12);
			const server = http.createServer(async (req, res) => {
				if (req.method !== "POST") {
					res.writeHead(405);
					res.end("Use POST.");
					return;
				}
				const auth = req.headers["authorization"];
				if (auth !== `Bearer ${token}`) {
					res.writeHead(401);
					res.end("Unauthorized. Use Bearer token from Atlas Notice.");
					return;
				}
				let body = "";
				req.on("data", (chunk) => (body += String(chunk)));
				req.on("end", async () => {
					try {
						const data = JSON.parse(body) as {
							title?: string;
							body?: string;
							tag?: string;
							due?: string;
						};
						const date = new Date().toISOString().split("T")[0];
						const slug = (data.title ?? "webhook")
							.substring(0, 50)
							.toLowerCase()
							.replace(/[^a-z0-9]+/g, "-")
							.replace(/^-|-$/g, "");
						const path = normalizePath(`${this.settings.folders.inbox}/${date}-webhook-${slug}.md`);
						const dueLine = data.due ? ` (@${data.due})` : "";
						const tagLine = data.tag ? ` #${data.tag.replace(/^#/, "")}` : "";
						const md = `---
type: webhook-capture
captured_at: ${new Date().toISOString()}
captured_via: webhook
---

# 🔌 ${data.title ?? "Webhook"}

- [ ] ${data.body ?? data.title ?? "—"}${dueLine}${tagLine}
`;
						if (!this.app.vault.getAbstractFileByPath(this.settings.folders.inbox)) {
							await this.app.vault.createFolder(this.settings.folders.inbox);
						}
						await this.app.vault.create(path, md);
						new Notice(`🔌 Atlas: webhook recebido — "${data.title}"`, 6000);
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ ok: true, path }));
					} catch (e) {
						res.writeHead(400);
						res.end(`Erro: ${String(e)}`);
					}
				});
			});
			// v0.19: bind 127.0.0.1 explicitly (não 0.0.0.0) — segurança: só local
			server.listen(port, "127.0.0.1");
			this.webhookServer = { close: () => server.close() };
			// Audit: log webhook activation
			void this.auditLog({ action: "webhook.started", port });
			new Notice(
				`🔌 Atlas webhook ON em 127.0.0.1:${port} (só local).\n\nToken: ${token}\n\nTeste:\ncurl -X POST -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d '{"title":"teste","body":"hello"}' http://localhost:${port}`,
				30000
			);
		} catch (e) {
			new Notice(`Atlas: webhook falhou — ${String(e)}`, 8000);
		}
	}

	showBookmarkletModal(): void {
		// Gera bookmarklet javascript: que captura URL+título+seleção
		const bookmarkletJs =
			`javascript:(function(){var s=window.getSelection().toString();` +
			`var u='obsidian://atlas-capture-url?title='+encodeURIComponent(document.title)+` +
			`'&url='+encodeURIComponent(location.href)+` +
			`(s?'&selection='+encodeURIComponent(s):'');` +
			`window.open(u);})();`;

		// Fallback simples: mostra Notice longo + abre Settings com texto copiável
		const notice = new Notice("", 0);
		notice.messageEl.empty();
		notice.messageEl.style.maxWidth = "560px";

		const head = notice.messageEl.createEl("div", { text: "🔖 Atlas Bookmarklet" });
		head.style.fontWeight = "bold";
		head.style.marginBottom = "8px";

		const desc = notice.messageEl.createEl("div", {
			text: "1) Selecione TODO o código abaixo. 2) Arraste pra barra de favoritos do browser. 3) Em qualquer site, click no bookmark → captura URL no Atlas.",
		});
		desc.style.fontSize = "11px";
		desc.style.marginBottom = "8px";

		const code = notice.messageEl.createEl("textarea");
		code.value = bookmarkletJs;
		code.style.width = "100%";
		code.style.height = "80px";
		code.style.fontSize = "10px";
		code.style.fontFamily = "var(--font-monospace)";
		code.style.padding = "6px";
		code.readOnly = true;
		code.addEventListener("focus", () => code.select());

		const copyBtn = notice.messageEl.createEl("button", { text: "📋 Copiar bookmarklet" });
		copyBtn.style.marginTop = "8px";
		copyBtn.style.fontSize = "11px";
		copyBtn.addEventListener("click", async () => {
			try {
				await navigator.clipboard.writeText(bookmarkletJs);
				copyBtn.setText("✓ Copiado!");
				setTimeout(() => copyBtn.setText("📋 Copiar bookmarklet"), 2000);
			} catch {
				// Fallback se clipboard API não disponível: select + Ctrl+C manual
				code.select();
				copyBtn.setText("Aperte Ctrl/Cmd+C");
			}
		});

		const closeBtn = notice.messageEl.createEl("button", { text: "Fechar" });
		closeBtn.style.marginTop = "8px";
		closeBtn.style.marginLeft = "6px";
		closeBtn.style.fontSize = "11px";
		closeBtn.addEventListener("click", () => notice.hide());
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
			id: "quick-capture",
			name: "Quick capture",
			callback: () => new QuickCaptureModal(this.app, this).open(),
		});

		this.addCommand({
			id: "jarvis",
			name: "🧠 Jarvis (voice + tool calls)",
			callback: async () => {
				const m = await import("./src/ui/jarvis-overlay");
				new m.JarvisOverlay(this.app, this).open();
			},
		});

		this.addCommand({
			id: "compose-email",
			name: "📧 Compose email",
			callback: async () => {
				const m = await import("./src/innovations/compose-email");
				new m.ComposeEmailModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "tone-bifold",
			name: "✍️ Tone Bifold Editor (reescrever em outro tom)",
			callback: async () => {
				const m = await import("./src/innovations/tone-bifold");
				await m.openToneBifoldFromActive(this);
			},
		});

		this.addCommand({
			id: "graph-pruning",
			name: "✂️ Graph Pruning Assistant (saúde do KG)",
			callback: async () => {
				const m = await import("./src/innovations/graph-pruning");
				new m.GraphPruningModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "ghost-mentor",
			name: "👻 Ghost Mentor (Camille/Lara/Pat/Will/Hopper)",
			callback: async () => {
				const m = await import("./src/innovations/ghost-mentor");
				new m.GhostMentorModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "cross-pollination",
			name: "🌸 Cross-Pollination AI (pontes entre áreas)",
			callback: async () => {
				const m = await import("./src/innovations/cross-pollination");
				new m.CrossPollinationModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "anti-procrastination",
			name: "🛑 Anti-Procrastination (quebrar tasks adiadas)",
			callback: async () => {
				const m = await import("./src/innovations/work-rhythm");
				new m.AntiProcrastinationModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "habit-streaks",
			name: "🔥 Habit Streaks (auto-detect dos daily logs)",
			callback: async () => {
				const m = await import("./src/innovations/work-rhythm");
				new m.HabitStreaksModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "future-self-letter",
			name: "🕰️ Future Self Letter (carta selada)",
			callback: async () => {
				const m = await import("./src/innovations/future-self-letter");
				new m.FutureSelfLetterModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "burnout-detector",
			name: "❤️ Burnout Detector (sinais nos daily logs)",
			callback: async () => {
				const m = await import("./src/innovations/wellbeing-detectors");
				new m.BurnoutDetectorModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "capacity-overload",
			name: "⚖️ Capacity Overload Warning (time)",
			callback: async () => {
				const m = await import("./src/innovations/wellbeing-detectors");
				new m.CapacityOverloadModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "promise-tracker",
			name: "🤝 Promise Tracker (extrai commitments)",
			callback: async () => {
				const m = await import("./src/innovations/wellbeing-detectors");
				new m.PromiseTrackerModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "smart-paste",
			name: "📋 Smart Paste (URL/JSON/code intelligent)",
			callback: async () => {
				const m = await import("./src/innovations/smart-paste");
				new m.SmartPasteModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "repeating-theme-alert",
			name: "📡 Repeating Theme Alert (sinal sistêmico)",
			callback: async () => {
				const m = await import("./src/innovations/pattern-detectors");
				new m.RepeatingThemeAlertModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "coachee-plateau",
			name: "🌱 Coachee Plateau Detector",
			callback: async () => {
				const m = await import("./src/innovations/pattern-detectors");
				new m.CoacheePlateauModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "inconsistency-detector",
			name: "⚖️ Inconsistency Detector (LLM)",
			callback: async () => {
				const m = await import("./src/innovations/pattern-detectors");
				new m.InconsistencyDetectorModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "stale-okr-alert",
			name: "🎯 Stale OKR Alert (KRs sem update)",
			callback: async () => {
				const m = await import("./src/innovations/pattern-detectors");
				new m.StaleOkrAlertModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "memory-loop",
			name: "🌀 Memory Loop Visualization",
			callback: async () => {
				const m = await import("./src/innovations/memory-loop");
				new m.MemoryLoopModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "create-reminder",
			name: "🔔 Criar reminder com data",
			callback: async () => {
				const tr = await import("./src/agent/tool-registry");
				const u = await import("./src/ui/prompt-modal");
				const text = await u.promptText(this.app, "Texto do reminder:");
				if (!text) return;
				const datetime = await u.promptText(this.app, "Data/hora (ex: 'amanhã 14h', 'sexta 9h'):");
				if (!datetime) return;
				const r = await tr.executeTool("create_reminder", { text, datetime }, this);
				new Notice(`Atlas: ${r.message}`, 8000);
			},
		});

		this.addCommand({
			id: "create-course",
			name: "📚 Criar curso",
			callback: async () => {
				const tr = await import("./src/agent/tool-registry");
				const u = await import("./src/ui/prompt-modal");
				const name = await u.promptText(this.app, "Nome do curso:");
				if (!name) return;
				const provider = await u.promptText(this.app, "Provider (Coursera/Udemy/livro/etc):");
				const r = await tr.executeTool("create_course", { name, provider: provider || undefined }, this);
				new Notice(`Atlas: ${r.message}`, 8000);
			},
		});

		this.addCommand({
			id: "voice-capture",
			name: "🎙️ Voice capture (gravar + transcrever)",
			callback: async () => {
				const m = await import("./src/automation/voice-input");
				const recording = await m.startVoiceRecording();
				const notice = new Notice("🎙️ Gravando... clique pra parar.", 0);
				notice.messageEl.addEventListener("click", async () => {
					notice.hide();
					const result = await recording.stop();
					if (result?.tempFile) {
						try {
							const text = await m.transcribeAudio(result.tempFile, {
								whisperBinaryPath: this.settings.voice?.whisperBinaryPath ?? "",
								whisperModelPath: this.settings.voice?.whisperModelPath ?? "",
								language: this.settings.voice?.language ?? "pt",
							});
							const tr = await import("./src/agent/tool-registry");
							const r = await tr.executeTool("create_action_item", { text }, this);
							new Notice(`🎙️ "${text.substring(0, 40)}…" → ${r.message}`, 8000);
						} catch (e) {
							new Notice(`Atlas: voice falhou — ${String(e)}`, 8000);
						}
					}
				});
			},
		});

		this.addCommand({
			id: "daily-log",
			name: "Daily log (criar/abrir hoje)",
			callback: () => openOrCreateDailyLog(this),
		});

		this.addCommand({
			id: "setup-vault",
			name: "Setup: criar estrutura de pastas no vault",
			callback: () => setupVaultStructure(this),
		});

		this.addCommand({
			id: "test-ollama",
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
			id: "index-vault",
			name: "Indexar vault (extrai KG)",
			callback: () => indexVaultCommand(this),
		});

		this.addCommand({
			id: "summarize-person",
			name: "Resumir pessoa",
			callback: () => new SummarizePersonModal(this.app, this).open(),
		});

		this.addCommand({
			id: "prepare-1on1",
			name: "Preparar próximo 1:1",
			callback: () => new Prepare1on1Modal(this.app, this).open(),
		});

		this.addCommand({
			id: "search-vault",
			name: "Buscar no vault (hybrid)",
			callback: () => new SearchVaultModal(this.app, this).open(),
		});

		this.addCommand({
			id: "show-kg-stats",
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
			id: "weekly-now",
			name: "Gerar weekly report agora",
			callback: () => generateWeeklyReportCommand(this),
		});

		this.addCommand({
			id: "send-weekly",
			name: "Enviar weekly report (nota ativa)",
			callback: () => sendCurrentWeeklyCommand(this),
		});

		this.addCommand({
			id: "morning-briefing-now",
			name: "Briefing matinal (gerar agora)",
			callback: () => this.runMorningBriefing(),
		});

		this.addCommand({
			id: "evening-review-now",
			name: "Evening review (gerar agora)",
			callback: () => this.runEveningReview(),
		});

		this.addCommand({
			id: "focus-mode",
			name: "Focus mode 90 min",
			callback: () => setFocusMode(90),
		});

		this.addCommand({
			id: "test-telegram",
			name: "Testar notificação Telegram",
			callback: async () => {
				const r = await this.notifier.testTelegram();
				new Notice(
					r.ok ? "Atlas: Telegram OK." : `Atlas: falhou — ${r.error ?? "erro"}`
				);
			},
		});

		this.addCommand({
			id: "test-email",
			name: "Testar SMTP",
			callback: () => this.testEmail(),
		});

		this.addCommand({
			id: "open-chat",
			name: "Abrir chat",
			callback: () => this.activateMasterTab("chat"),
		});

		// ─── v0.4 SPRINT 2: Master Sidebar commands ───

		this.addCommand({
			id: "master-open",
			name: "Abrir Atlas (sidebar unificada)",
			callback: () => this.activateMasterTab("today"),
		});

		this.addCommand({
			id: "master-today",
			name: "Master Sidebar → Today",
			callback: () => this.activateMasterTab("today"),
		});

		this.addCommand({
			id: "master-knowledge",
			name: "Master Sidebar → Knowledge (cards de pessoas/projetos/temas)",
			callback: () => this.activateMasterTab("knowledge"),
		});

		this.addCommand({
			id: "master-systems",
			name: "Master Sidebar → 🖥️ Sistemas (CRUD)",
			callback: () => this.activateMasterTab("systems"),
		});

		this.addCommand({
			id: "master-products",
			name: "Master Sidebar → 📦 Produtos (CRUD)",
			callback: () => this.activateMasterTab("products"),
		});

		this.addCommand({
			id: "master-roles",
			name: "Master Sidebar → 🎓 Cargos (CRUD)",
			callback: () => this.activateMasterTab("roles"),
		});

		this.addCommand({
			id: "master-reports-composer",
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
			id: "master-reports-templates",
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
			id: "add-system",
			name: "+ Novo Sistema",
			callback: async () => {
				const m = await import("./src/views/master/tab-systems");
				m.renderSystemEditForm(this, null);
			},
		});

		this.addCommand({
			id: "add-product",
			name: "+ Novo Produto",
			callback: async () => {
				const m = await import("./src/views/master/tab-products");
				m.renderProductEditForm(this, null);
			},
		});

		this.addCommand({
			id: "add-role",
			name: "+ Novo Cargo",
			callback: async () => {
				const m = await import("./src/views/master/tab-roles");
				m.renderRoleEditForm(this, null);
			},
		});

		this.addCommand({
			id: "add-person",
			name: "+ Nova Pessoa",
			callback: async () => {
				const m = await import("./src/views/master/person-form");
				m.renderPersonEditForm(this, null);
			},
		});

		// ─── v0.5 Sprint 7: System detection ───

		this.addCommand({
			id: "auto-link-systems",
			name: "🔗 Auto-link sistemas mencionados na nota ativa",
			callback: () => autoLinkSystemsCommand(this),
		});

		this.addCommand({
			id: "scan-systems-now",
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
			id: "scan-systems-vault",
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

		// ─── v0.7.7: LGPD Right-to-be-forgotten ───

		this.addCommand({
			id: "forget-person",
			name: "🗑️ Right-to-be-forgotten (apagar pessoa do KG)",
			callback: async () => {
				const people = this.kg.listPeople();
				if (people.length === 0) {
					new Notice("Atlas: KG vazio.");
					return;
				}
				// v0.19: Obsidian-compliant — use promptText + confirmAsync (no window.prompt/confirm)
				const { promptText } = await import("./src/ui/prompt-modal");
				const { confirmAsync } = await import("./src/ui/confirm-modal");

				const name = await promptText(
					this.app,
					"⚠️ LGPD Right-to-be-forgotten — nome EXATO da pessoa para deletar:"
				);
				if (!name) return;
				const person = this.kg.findPersonByName(name);
				if (!person) {
					new Notice(`Atlas: "${name}" não encontrado.`);
					return;
				}
				const sessionsCountPreview = this.kg.listSessionsByPerson(person.id).length;
				const confirm2 = await confirmAsync(
					this.app,
					`Você está prestes a apagar PERMANENTEMENTE:\n\n• ${person.name} do Knowledge Graph\n• ${sessionsCountPreview} sessões vinculadas\n• Action items + commitments + themes relacionados\n\nNotas em 06_People/ NÃO são apagadas (faça manual se quiser).\n\nEsta ação NÃO pode ser desfeita.`,
					{ title: "🗑️ LGPD — Confirmar destruição", yesLabel: "Apagar tudo", noLabel: "Cancelar", danger: true }
				);
				if (!confirm2) return;

				// Cascade delete
				const sessionsCount = this.kg.data.sessions.filter((s) => s.personId === person.id).length;
				this.kg.data.sessions = this.kg.data.sessions.filter((s) => s.personId !== person.id);
				const aiCount = this.kg.data.actionItems.filter((a) => a.ownerId === person.id).length;
				this.kg.data.actionItems = this.kg.data.actionItems.filter((a) => a.ownerId !== person.id);
				const cmCount = this.kg.data.commitments.filter(
					(c) => c.madeBy === person.id || c.madeTo === person.id
				).length;
				this.kg.data.commitments = this.kg.data.commitments.filter(
					(c) => c.madeBy !== person.id && c.madeTo !== person.id
				);
				// Themes: remove personId from personIds; delete theme if 0 left
				let themesUpdated = 0;
				this.kg.data.themes = this.kg.data.themes
					.map((t) => ({ ...t, personIds: t.personIds.filter((pid) => pid !== person.id) }))
					.filter((t) => {
						if (t.personIds.length === 0) {
							themesUpdated++;
							return false;
						}
						return true;
					});
				this.kg.deletePerson(person.id);
				await this.kg.save();
				await this.auditLog({
					action: "lgpd.right-to-be-forgotten",
					personName: person.name,
					personId: person.id,
					sessions: sessionsCount,
					actionItems: aiCount,
					commitments: cmCount,
					themesPurged: themesUpdated,
				});
				new Notice(
					`✓ Atlas: "${person.name}" + dependências apagadas. Sessions: ${sessionsCount}, Actions: ${aiCount}, Commitments: ${cmCount}, Themes purgados: ${themesUpdated}.`,
					12000
				);
			},
		});

		// ─── v0.7.7: Webhook receiver (Express-lite via Node http) ───

		this.addCommand({
			id: "webhook-toggle",
			name: "🔌 Webhook receiver: toggle (localhost:7842)",
			callback: () => this.toggleWebhookReceiver(),
		});

		// ─── v0.7.4: Voice Jarvis ───

		this.addCommand({
			id: "hud-toggle",
			name: "🧠 HUD: toggle (Cmd+Shift+H)",
			callback: () => this.hud.toggle(),
		});

		this.addCommand({
			id: "voice-record-cmd",
			name: "🎙️ Falar com Atlas (gravar voz + transcrever + dispatch comando)",
			callback: () => {
				if (!this.hud.isVisible()) this.hud.show();
				new Notice("🎙️ Atlas: HUD aberto. Click no botão 🎙️ pra começar gravar.", 6000);
			},
		});

		// ─── v0.8.3: Vision ───
		this.addCommand({
			id: "vision",
			name: "👁️ Vision: analisar imagem (whiteboard/OCR/diagrama/tabela)",
			callback: async () => {
				const m = await import("./src/innovations/vision");
				new m.VisionModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "templates-picker",
			name: "📐 Templates Atlas (escolher / usar / editar)",
			callback: () => new TemplatePickerModal(this.app, this).open(),
		});

		this.addCommand({
			id: "templates-reset",
			name: "Templates: resetar para defaults (Daily/1:1/Coaching/Weekly)",
			callback: async () => {
				// v0.19: Obsidian-compliant — confirmAsync substitui global confirm()
				const { confirmAsync } = await import("./src/ui/confirm-modal");
				const ok = await confirmAsync(
					this.app,
					"Descartar templates customizados e voltar aos defaults? Você perde quaisquer edições visuais feitas.",
					{ title: "Reset templates", yesLabel: "Resetar", noLabel: "Manter customizados", danger: true }
				);
				if (!ok) return;
				this.templateStore.resetToDefaults();
				await this.templateStore.save();
				new Notice("Atlas: templates resetados.");
			},
		});

		this.addCommand({
			id: "master-reports",
			name: "Master Sidebar → Reports (timeline)",
			callback: () => this.activateMasterTab("reports"),
		});

		// ─── v0.6 Sprint 10b: Lab tab ───

		this.addCommand({
			id: "master-lab",
			name: "Master Sidebar → 🧪 Lab (Tools IA / Serendipity / Capsules / Tree)",
			callback: () => this.activateMasterTab("lab"),
		});

		this.addCommand({
			id: "master-lab-tools",
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
			id: "master-lab-serendipity",
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
			id: "master-lab-tree",
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
			id: "master-automations",
			name: "Master Sidebar → 🤖 Auto (Tagger / Aliaser / Rules / Atlas Percebeu)",
			callback: () => this.activateMasterTab("automations"),
		});

		this.addCommand({
			id: "master-auto-rules",
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
			id: "architecture-diagram",
			name: "🏗️ Architecture Diagram (Mermaid C4)",
			callback: async () => {
				const m = await import("./src/innovations/ti-tools");
				new m.ArchitectureDiagramModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "adr-generator",
			name: "📜 ADR Generator (Architecture Decision Record)",
			callback: async () => {
				const m = await import("./src/innovations/ti-tools");
				new m.AdrGeneratorModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "tech-debt-scanner",
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
			id: "runbook-generator",
			name: "🚑 Runbook Generator",
			callback: async () => {
				const m = await import("./src/innovations/ti-tools");
				new m.RunbookGeneratorModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "postmortem-builder",
			name: "🚨 Postmortem Builder (blameless RCA 5-whys)",
			callback: async () => {
				const m = await import("./src/innovations/ti-tools");
				new m.PostmortemBuilderModal(this.app, this).open();
			},
		});

		// ─── v0.7 Sprint 15: Integrations ───

		this.addCommand({
			id: "ical-sync-now",
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
			id: "bookmarklet-show",
			name: "🔖 Bookmarklet: mostrar código pra arrastar pra browser",
			callback: () => this.showBookmarkletModal(),
		});

		// v0.50.1: Vision OCR — analisar imagem do vault (whiteboard / screenshot / handwritten)
		this.addCommand({
			id: "vision-analyze",
			name: "👁️ Vision: analisar imagem (OCR / table / diagram)",
			callback: async () => {
				// Find image files in vault
				const images = this.app.vault.getFiles().filter((f) =>
					/\.(png|jpg|jpeg|webp|gif)$/i.test(f.path)
				);
				if (images.length === 0) {
					new Notice("Atlas: nenhuma imagem no vault. Cole/arraste uma imagem primeiro.", 6000);
					return;
				}

				// Use FuzzySuggestModal pra picker
				const { FuzzySuggestModal } = await import("obsidian");
				class ImagePicker extends FuzzySuggestModal<{ path: string; basename: string }> {
					constructor(app: ObsidianApp, public onPick: (path: string) => void) {
						super(app);
						this.setPlaceholder("Escolha imagem pra analisar...");
					}
					getItems(): { path: string; basename: string }[] {
						return images.map((f) => ({ path: f.path, basename: f.basename }));
					}
					getItemText(item: { path: string; basename: string }): string {
						return item.basename;
					}
					onChooseItem(item: { path: string; basename: string }): void {
						this.onPick(item.path);
					}
				}

				const taskKinds = [
					{ id: "describe" as const, label: "Descrever conteúdo" },
					{ id: "ocr" as const, label: "OCR (extrair texto)" },
					{ id: "table" as const, label: "Extrair tabela markdown" },
					{ id: "diagram" as const, label: "Diagrama → Mermaid" },
					{ id: "summarize" as const, label: "Resumir imagem" },
				];

				new ImagePicker(this.app, async (path: string) => {
					// Pick taskKind
					class TaskKindPicker extends FuzzySuggestModal<typeof taskKinds[number]> {
						constructor(app: ObsidianApp, public onPick: (k: typeof taskKinds[number]) => void) {
							super(app);
							this.setPlaceholder("Tipo de análise...");
						}
						getItems(): typeof taskKinds[number][] {
							return [...taskKinds];
						}
						getItemText(item: typeof taskKinds[number]): string {
							return item.label;
						}
						onChooseItem(item: typeof taskKinds[number]): void {
							this.onPick(item);
						}
					}
					new TaskKindPicker(this.app, async (kind) => {
						const notice = new Notice(`Atlas Vision: analisando ${kind.label}...`, 0);
						try {
							const m = await import("./src/innovations/vision");
							const tool = new m.VisionTool(this.app, this);
							// Resolve absolute path via vault adapter
							const adapter = this.app.vault.adapter as unknown as {
								getResourcePath?: (p: string) => string;
								getFullPath?: (p: string) => string;
								basePath?: string;
							};
							const fullPath = adapter.getFullPath?.(path) ?? `${adapter.basePath}/${path}`;
							const result = await tool.run(fullPath, { taskKind: kind.id });
							notice.hide();

							// Insert in active note OR create new note
							const activeFile = this.app.workspace.getActiveFile();
							const insertion = `\n\n## 👁️ Vision (${kind.label})\n*Source: ${path}*\n\n${result}\n`;
							if (activeFile) {
								const editor = this.app.workspace.activeEditor?.editor;
								if (editor) {
									const cursor = editor.getCursor();
									editor.replaceRange(insertion, cursor);
									new Notice(`Atlas Vision: ${kind.label} inserido na nota ativa.`);
								} else {
									await this.app.vault.append(activeFile, insertion);
									new Notice(`Atlas Vision: ${kind.label} appended.`);
								}
							} else {
								// No active note → create new note
								const slug = path.split("/").pop()?.replace(/\.[a-z]+$/i, "") ?? "vision";
								const date = new Date().toISOString().split("T")[0];
								const newPath = `${this.settings.folders.inbox}/${date}-vision-${slug}.md`;
								if (!this.app.vault.getAbstractFileByPath(this.settings.folders.inbox)) {
									await this.app.vault.createFolder(this.settings.folders.inbox);
								}
								await this.app.vault.create(newPath, `# Vision Analysis — ${slug}\n${insertion}`);
								const f = this.app.vault.getAbstractFileByPath(newPath);
								if (f && "stat" in f) {
									await this.app.workspace.getLeaf().openFile(f as never);
								}
							}
						} catch (e) {
							notice.hide();
							new Notice(`Atlas Vision falhou: ${String(e)}`, 10000);
						}
					}).open();
				}).open();
			},
		});

		// v0.50.1: criar stubs pré-meeting pra eventos do iCal cacheados
		this.addCommand({
			id: "ical-create-stubs",
			name: "🗓️ iCal: criar stubs de notas pra próximos compromissos (24h)",
			callback: async () => {
				const url = this.settings.profile?.calendarUrl;
				if (!url) {
					new Notice(
						"Atlas: configure URL .ics em Settings → Atlas → Profile → Calendar URL.",
						8000
					);
					return;
				}
				const notice = new Notice("Atlas: criando stubs...", 0);
				try {
					const m = await import("./src/integrations/ical");
					const ical = new m.IcalClient(this.app, this.settings.folders.atlas);
					// Garante que cache existe
					await ical.fetchAndCache(url);
					const created = await ical.createStubsForUpcoming(
						this.settings.folders.meetings,
						24,
						(attendee: string): string | null => {
							const p = this.kg.findPersonByName(attendee);
							return p?.name ?? null;
						}
					);
					notice.hide();
					if (created.length === 0) {
						new Notice("Atlas: nenhum stub novo (eventos já têm notas).");
					} else {
						new Notice(`Atlas: ${created.length} stubs criados em ${this.settings.folders.meetings}.`);
					}
				} catch (e) {
					notice.hide();
					new Notice(`Atlas: erro — ${String(e)}`, 8000);
				}
			},
		});

		this.addCommand({
			id: "capacity-planner",
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
			id: "master-auto-percebeu",
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
			id: "master-study",
			name: "Master Sidebar → Study (flashcards + papers)",
			callback: () => this.activateMasterTab("study"),
		});

		this.addCommand({
			id: "master-status",
			name: "Master Sidebar → Status (Ollama + RAM)",
			callback: () => this.activateMasterTab("status"),
		});

		this.addCommand({
			id: "master-suggest",
			name: "Master Sidebar → Smart Suggestions",
			callback: () => this.activateMasterTab("suggest"),
		});

		// ─── v0.4 Sprint 3: Tutorial + Achievement commands ───

		this.addCommand({
			id: "tour-first-steps",
			name: "Tour: Primeiros passos (recomendado começar aqui)",
			callback: () => this.startTutorial("first-steps"),
		});

		this.addCommand({
			id: "tour-1on1",
			name: "Tour: Como rodar seu primeiro 1:1",
			callback: () => this.startTutorial("one-on-one"),
		});

		this.addCommand({
			id: "tour-weekly",
			name: "Tour: Como gerar weekly report automático",
			callback: () => this.startTutorial("weekly-report"),
		});

		this.addCommand({
			id: "tour-flashcards",
			name: "Tour: Spaced repetition + flashcards",
			callback: () => this.startTutorial("flashcards"),
		});

		this.addCommand({
			id: "tour-kg",
			name: "Tour: Como o Knowledge Graph funciona",
			callback: () => this.startTutorial("knowledge-graph"),
		});

		this.addCommand({
			id: "tours-list",
			name: "Tours disponíveis (escolher)",
			callback: () => this.showTourPicker(),
		});

		this.addCommand({
			id: "achievements",
			name: "🏆 Achievements & XP",
			callback: () => this.showAchievements(),
		});

		// ─── v0.4 Sprint 4: Auto-organização ───

		this.addCommand({
			id: "vault-wizard",
			name: "🧹 Vault Wizard (cleanup multi-step)",
			callback: () => new VaultWizardModal(this.app, this).open(),
		});

		this.addCommand({
			id: "rules-evaluate-active",
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
			id: "rules-apply-active",
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
			id: "moc-folder",
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
			id: "tree-people",
			name: "🌳 Árvore de Pessoas",
			callback: () => new EntityTreesModal(this.app, this, "people").open(),
		});

		this.addCommand({
			id: "tree-projects",
			name: "🌳 Árvore de Projetos",
			callback: () => new EntityTreesModal(this.app, this, "projects").open(),
		});

		this.addCommand({
			id: "tree-themes",
			name: "🌳 Árvore de Temas",
			callback: () => new EntityTreesModal(this.app, this, "themes").open(),
		});

		this.addCommand({
			id: "moc-tag",
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
			id: "scan-reminders",
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
			id: "proactive-check",
			name: "Detecção proativa: rodar agora",
			callback: () => this.runProactiveCheck(),
		});

		this.addCommand({
			id: "toggle-coach-mode",
			name: "Alternar Coach Mode ↔ Work Mode",
			callback: () => toggleCoachMode(this),
		});

		this.addCommand({
			id: "flashcards-from-note",
			name: "Estudo: gerar flashcards desta nota",
			callback: () => generateFlashcardsFromActiveNote(this),
		});

		this.addCommand({
			id: "flashcards-review",
			name: "Estudo: sessão de spaced repetition (revisar)",
			callback: () => new ReviewSessionModal(this.app, this).open(),
		});

		this.addCommand({
			id: "flashcards-export-anki",
			name: "Estudo: exportar flashcards para Anki (TSV)",
			callback: () => exportFlashcardsAsCsv(this),
		});

		this.addCommand({
			id: "flashcards-export-sr",
			name: "Estudo: exportar para Obsidian Spaced Repetition (.md)",
			callback: () => exportFlashcardsAsObsidianSr(this),
		});

		this.addCommand({
			id: "flashcards-stats",
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
			id: "socratic",
			name: "Estudo: Feynman check (perguntas socráticas)",
			callback: () => new SocraticModal(this.app, this).open(),
		});

		this.addCommand({
			id: "onboarding",
			name: "Onboarding wizard (rodar de novo)",
			callback: () => new OnboardingWizard(this.app, this).open(),
		});

		this.addCommand({
			id: "inline-ai",
			name: "Inline AI (reescrever / resumir / explicar / traduzir)",
			callback: () => openInlineAi(this),
		});

		this.addCommand({
			id: "smart-paste",
			name: "Smart paste (URL → metadata, JSON → format, code → fenced)",
			callback: () => smartPaste(this),
		});

		this.addCommand({
			id: "open-hub",
			name: "Action Items Hub (abrir)",
			callback: () => this.activateMasterTab("hub"),
		});

		this.addCommand({
			id: "open-suggestions",
			name: "Smart suggestions sidebar (abrir)",
			callback: () => this.activateMasterTab("suggest"),
		});

		this.addCommand({
			id: "tag-active-note",
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
			id: "find-aliases",
			name: "Auto-aliasing: detectar duplicatas no KG",
			callback: () => new AutoAliasingModal(this.app, this.autoAliaser).open(),
		});

		this.addCommand({
			id: "reasoning",
			name: "Pense comigo (CoT — decisões / RCA / planning)",
			callback: () => new ReasoningModal(this.app, this).open(),
		});

		this.addCommand({
			id: "auto-summary",
			name: "Auto-summary: TLDR no topo da nota ativa",
			callback: () => generateSummaryForActiveNote(this),
		});

		this.addCommand({
			id: "toggle-reranker",
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
			id: "spotlight",
			name: "Spotlight (busca + ações universais)",
			callback: () => new SpotlightModal(this.app, this).open(),
		});

		this.addCommand({
			id: "open-today",
			name: "Today (dashboard)",
			callback: () => this.activateMasterTab("today"),
		});

		this.addCommand({
			id: "serendipity-now",
			name: "Serendipity: mostrar nota antiga relevante agora",
			callback: () => this.serendipity.tick(),
		});

		this.addCommand({
			id: "year-in-review",
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
			id: "time-capsule",
			name: "Time Capsule: criar cápsula que abre no futuro",
			callback: () => new TimeCapsuleModal(this.app, this).open(),
		});

		this.addCommand({
			id: "check-capsules",
			name: "Time Capsule: verificar entregas do dia",
			callback: () => this.capsuleWatcher.checkDeliveries(),
		});

		// ─── v0.3 INNOVATIONS ───

		this.addCommand({
			id: "context-collapse",
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
			id: "manager-readme",
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
			id: "premortem-oracle",
			name: "Pre-mortem Oracle (prever falhas de novo projeto)",
			callback: () => new PreMortemModal(this.app, this).open(),
		});

		this.addCommand({
			id: "decision-diary",
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
			id: "workspace-health",
			name: "Workspace Health dashboard (abrir)",
			callback: () => this.activateMasterTab("health"),
		});

		this.addCommand({
			id: "podcast-generator",
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
			id: "status-panel",
			name: "Status panel (RAM + Ollama + modelos)",
			callback: () => this.activateMasterTab("status"),
		});

		this.addCommand({
			id: "pull-recommended-model",
			name: "Pull qwen2.5:7b (modelo leve recomendado)",
			callback: () => pullRecommendedModel(this),
		});

		this.addCommand({
			id: "restart-ollama",
			name: "Como reiniciar Ollama (instruções)",
			callback: () => {
				new Notice(
					"Atlas: Para reiniciar o Ollama, feche o app Ollama e abra de novo. Ou no terminal: `pkill ollama && ollama serve`.",
					12000
				);
			},
		});

		this.addCommand({
			id: "show-error-help",
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
			id: "apply-templates",
			name: "Aplicar templates no vault",
			callback: () => applyTemplatesToVault(this),
		});

		this.addCommand({
			id: "tts-selection",
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

		// v0.44 E2: New 1:1 — cria página markdown com template + brief auto
		this.addCommand({
			id: "new-1on1",
			name: "🤝 Novo 1:1 (cria página)",
			callback: async () => {
				const m = await import("./src/commands/new-1on1");
				new m.New1on1Modal(this.app, this).open();
			},
		});

		// v0.44 E3: Switch chat routing to Ollama (used by cloud error actions)
		this.addCommand({
			id: "switch-to-ollama",
			name: "🤖 Trocar chat pra Ollama (local)",
			callback: async () => {
				if (!this.settings.providers) {
					this.settings.providers = {
						apiKeys: {},
						routing: {},
						failoverChain: ["ollama"],
						budget: { enabled: false, monthlyUSD: 20, dailyUSD: 2, hardCutoff: false, warnAtPct: 0.8 },
					};
				}
				this.settings.providers.routing = {
					...(this.settings.providers.routing ?? {}),
					chat: { provider: "ollama", model: this.settings.ollama.generationModel },
				};
				await this.saveSettings();
				this.providerRouter?.updateConfig({
					routing: this.settings.providers.routing as never,
				});
				new Notice(`✓ Atlas: chat agora via Ollama local (${this.settings.ollama.generationModel})`, 6000);
			},
		});

		// v0.44 E1: KG backup/restore commands
		this.addCommand({
			id: "export-kg-backup",
			name: "📦 Export KG backup (manual)",
			callback: async () => {
				try {
					const path = await this.kg.exportBackup();
					new Notice(`✅ Backup salvo em ${path}`, 8000);
				} catch (e) {
					new Notice(`Atlas: erro no backup — ${String(e)}`, 10000);
				}
			},
		});

		this.addCommand({
			id: "import-kg-backup",
			name: "♻️ Restore KG from backup",
			callback: async () => {
				const folder = `${this.settings.folders.atlas}/backups`;
				const files = this.app.vault
					.getFiles()
					.filter((f) => f.path.startsWith(folder + "/") && f.name.endsWith(".json"))
					.sort((a, b) => b.stat.mtime - a.stat.mtime);
				if (files.length === 0) {
					new Notice(`Atlas: nenhum backup em ${folder}`, 6000);
					return;
				}
				const { confirmAsync } = await import("./src/ui/confirm-modal");
				const newest = files[0];
				const ok = await confirmAsync(
					this.app,
					`Restaurar KG de ${newest.path}? Substitui dados atuais.`,
					{ title: "♻️ Restore KG", yesLabel: "Restaurar", danger: true }
				);
				if (!ok) return;
				try {
					await this.kg.importBackup(newest.path);
					new Notice(`✅ KG restaurado. Recarregue Atlas pra ver UI atualizada.`, 10000);
				} catch (e) {
					new Notice(`Atlas: erro restore — ${String(e)}`, 10000);
				}
			},
		});
	}

	updateStatusBar(): void {
		if (!this.statusBar) return;
		// v0.7.2: status bar rico com indicador Ollama pulsante
		this.statusBar.empty();
		this.statusBar.style.display = "flex";
		this.statusBar.style.alignItems = "center";
		this.statusBar.style.gap = "4px";

		// Bolinha Ollama (verde=up, vermelho=down, laranja=thinking)
		const indicator = this.statusBar.createSpan();
		indicator.addClass("atlas-statusbar-indicator");
		// Default verde (assume up); ping async pra atualizar
		this.statusBar.createSpan({ text: "🧠 Atlas" });

		// Coach mode badge
		const modeLabel = getModeLabel();
		if (modeLabel) {
			this.statusBar.createSpan({ text: ` · ${modeLabel}` });
		}

		// Cards due badge
		const stats = this.flashcards?.stats();
		const due = stats?.due ?? 0;
		if (due > 0) {
			this.statusBar.createSpan({ text: ` · 🃏 ${due}` });
		}

		// Async Ollama ping para atualizar indicator
		void this.ollama.ping().then((up) => {
			if (!up) {
				indicator.addClass("atlas-status-down");
			} else {
				indicator.removeClass("atlas-status-down");
				indicator.removeClass("atlas-status-thinking");
			}
		});
	}

	/** v0.7.2: marca status bar como "thinking" (durante LLM streaming). */
	setStatusBarThinking(thinking: boolean): void {
		if (!this.statusBar) return;
		const indicator = this.statusBar.querySelector(".atlas-statusbar-indicator") as HTMLElement | null;
		if (!indicator) return;
		if (thinking) indicator.addClass("atlas-status-thinking");
		else indicator.removeClass("atlas-status-thinking");
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

		// v0.44 E1: KG backup semanal aos domingos 03h (rolling 4 backups)
		this.scheduler.schedule({
			id: "kg-backup-weekly",
			cronExpression: "0 3 * * 0", // domingos 03:00
			description: "Backup semanal do KG",
			handler: async () => {
				try {
					const path = await this.kg.exportBackup();
					logger.info("KG weekly backup created", { path });
				} catch (e) {
					logger.warn("KG weekly backup failed", { error: String(e) });
				}
			},
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
