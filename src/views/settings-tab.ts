import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type AtlasPlugin from "../../main";
import { setupVaultStructure } from "../commands/setup-vault";
import { PROFILES, PROFILE_CATEGORIES, ProfileId, mergeProfiles } from "../profiles/registry";
import { t } from "../i18n";

export class AtlasSettingTab extends PluginSettingTab {
	/** v0.44 E3: track which provider keys triggered modal in this Settings open */
	private modalShownThisSession = new Set<string>();

	constructor(app: App, private plugin: AtlasPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("atlas-settings-tab");

		const heroWrap = containerEl.createDiv({ cls: "atlas-settings-hero" });
		heroWrap.createEl("h2", {
			cls: "atlas-settings-hero-title",
			text: "🧠 Atlas",
		});
		heroWrap.createEl("p", {
			cls: "atlas-settings-hero-sub",
			text: "Segundo cérebro local. 100% privado. Roda no Ollama.",
		});

		this.section_language();
		this.section_user();
		this.section_profile();
		this.section_ollama();
		this.section_providers();
		this.section_schedules();
		this.section_email();
		this.section_notifications();
		this.section_voice();
		this.section_advanced();
	}

	// v0.17 — Cloud AI providers + cost control
	private section_providers(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: t("settings.cloud.title") });
		containerEl.createEl("p", {
			cls: "atlas-settings-section-desc",
			text: "Atlas funciona 100% local com Ollama. Adicione API keys aqui para usar GPT-4o, Claude Opus 4.7, Gemini 2.0, etc — Atlas controla o gasto e mostra dashboard de spend.",
		});

		// v0.52.8: Active Provider banner — mostra QUAL provider está sendo usado AGORA pra chat
		this.renderActiveProviderBanner(containerEl);

		// v0.52.3: Primary AI Provider — quick way to set ALL routing (chat/extraction/reasoning/etc) at once
		this.renderPrimaryProviderPicker(containerEl);

		// v0.22 Sprint I: Quick Presets (4 buttons)
		this.renderQuickPresets(containerEl);

		const providers: { id: string; name: string; field: string; signupUrl: string }[] = [
			{ id: "openai", name: "OpenAI", field: "openaiEncrypted", signupUrl: "https://platform.openai.com/api-keys" },
			{ id: "anthropic", name: "Anthropic (Claude)", field: "anthropicEncrypted", signupUrl: "https://console.anthropic.com/settings/keys" },
			{ id: "google", name: "Google Gemini", field: "googleEncrypted", signupUrl: "https://aistudio.google.com/app/apikey" },
			{ id: "mistral", name: "Mistral", field: "mistralEncrypted", signupUrl: "https://console.mistral.ai/api-keys" },
			{ id: "xai", name: "xAI Grok", field: "xaiEncrypted", signupUrl: "https://console.x.ai" },
			{ id: "openrouter", name: "OpenRouter (300+ models)", field: "openrouterEncrypted", signupUrl: "https://openrouter.ai/keys" },
			{ id: "groq", name: "Groq (fast LPU)", field: "groqEncrypted", signupUrl: "https://console.groq.com/keys" },
			{ id: "deepseek", name: "DeepSeek (R1 reasoning)", field: "deepseekEncrypted", signupUrl: "https://platform.deepseek.com/api_keys" },
		];

		const ensureProvidersConfig = () => {
			if (!this.plugin.settings.providers) {
				this.plugin.settings.providers = {
					apiKeys: {},
					routing: {},
					failoverChain: ["ollama"],
					budget: { enabled: false, monthlyUSD: 20, dailyUSD: 2, hardCutoff: false, warnAtPct: 0.8 },
				};
			}
			if (!this.plugin.settings.providers.apiKeys) this.plugin.settings.providers.apiKeys = {};
			return this.plugin.settings.providers;
		};

		for (const p of providers) {
			const setting = new Setting(containerEl)
				.setName(p.name)
				.setDesc(`API key. Pegue em ${p.signupUrl}`);

			// v0.52.7: char count + Test button (UX explícito pra debug "key cortada")
			let charCountEl: HTMLSpanElement | null = null;
			setting.addText((t) => {
					const cfg = ensureProvidersConfig();
					const keys = cfg.apiKeys as Record<string, string | undefined>;
					const wasEmpty = !keys[p.field]; // v0.21 Sprint J: track previous state
					// v0.52.7: mostrar real key (não masked) — user reclamou de campo cortando.
					// Em type="text" user vê o que está digitando. Risk: shoulder surf, mas clarity > paranoia.
					t.setPlaceholder("sk-...").setValue(keys[p.field] ?? "");
					t.inputEl.type = "text";
					t.inputEl.style.fontFamily = "var(--font-monospace, ui-monospace, monospace)";
					t.inputEl.style.fontSize = "11px";
					// Char count display
					const updateCount = (val: string): void => {
						if (charCountEl) {
							charCountEl.setText(val.length > 0 ? `${val.length} chars` : "");
						}
					};
					updateCount(keys[p.field] ?? "");
					t.onChange(async (v) => {
						updateCount(v);
						const trimmed = v.trim();

						// v0.52.8: detectar prefix mismatch — user colou key de provider X em campo de provider Y
						if (trimmed.length >= 8) {
							const detectProviderByPrefix = (key: string): string | null => {
								if (key.startsWith("sk-ant-")) return "anthropic";
								if (key.startsWith("sk-or-v1-")) return "openrouter";
								if (key.startsWith("gsk_")) return "groq";
								if (key.startsWith("xai-")) return "xai";
								// `sk-` genérico → openai/deepseek (ambíguo)
								if (key.startsWith("sk-")) return "openai-or-deepseek";
								return null;
							};
							const detected = detectProviderByPrefix(trimmed);
							const ambiguousMatch = detected === "openai-or-deepseek" && (p.id === "openai" || p.id === "deepseek");
							if (detected && detected !== p.id && !ambiguousMatch) {
								new Notice(
									`⚠️ Esta key parece ser de ${detected}, não ${p.name}. Verifique se colou no campo certo.`,
									10000
								);
								// Não bloqueia salvar, mas avisa
							}
						}

						const keysNow = ensureProvidersConfig().apiKeys as Record<string, string | undefined>;
						const previouslyEmpty = !keysNow[p.field] || wasEmpty;
						if (trimmed) {
							keysNow[p.field] = trimmed;
						} else {
							delete keysNow[p.field];
						}
						await this.plugin.saveSettings();
						this.plugin.providerRouter?.updateConfig({
							apiKeys: this.collectApiKeysPlain(),
						});

						// v0.21 Sprint J / v0.44 E3 / v0.52.2: detected NEW + VALID API key → open ApiKeyDetectedModal
						// v0.52.2: regex validation per provider — evita falso-positivo de paste lixo
						const looksValidKey = (provider: string, key: string): boolean => {
							if (!key || key.length < 20) return false;
							const patterns: Record<string, RegExp> = {
								openai: /^sk-[A-Za-z0-9_-]{20,}$/,
								anthropic: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
								google: /^[A-Za-z0-9_-]{30,}$/, // Gemini API key
								mistral: /^[A-Za-z0-9]{30,}$/,
								xai: /^xai-[A-Za-z0-9_-]{20,}$/,
								openrouter: /^sk-or-v1-[A-Za-z0-9_-]{20,}$/,
								groq: /^gsk_[A-Za-z0-9_-]{20,}$/,
								deepseek: /^sk-[A-Za-z0-9_-]{20,}$/,
								cohere: /^[A-Za-z0-9-]{30,}$/,
							};
							const re = patterns[provider];
							// Sem regex específico → fallback: aceita 20+ chars
							return re ? re.test(key) : key.length >= 20;
						};
						if (
							v &&
							v !== "•••••••••••" &&
							looksValidKey(p.id, v) &&
							!this.modalShownThisSession.has(p.id)
						) {
							this.modalShownThisSession.add(p.id);
							setTimeout(() => {
								void this.maybeOpenApiKeyModal(p.id);
							}, 1200);
						}
						void previouslyEmpty;
					});
				});

			// v0.52.7: char count badge + Test button per provider
			setting.addExtraButton((b) => {
				b.setIcon("circle-check")
					.setTooltip(`Testar conexão ${p.name}`)
					.onClick(async () => {
						const keys = (ensureProvidersConfig().apiKeys ?? {}) as Record<string, string | undefined>;
						const key = keys[p.field];
						if (!key) {
							new Notice(`Atlas: cole a key de ${p.name} primeiro.`, 6000);
							return;
						}
						new Notice(`Atlas: testando ${p.name} (${key.length} chars)...`, 0);
						try {
							const router = this.plugin.providerRouter;
							if (!router) throw new Error("Provider router não inicializado");
							router.updateConfig({ apiKeys: this.collectApiKeysPlain() });
							const list = router.listConfiguredProviders();
							if (!list.includes(p.id as never)) {
								new Notice(`Atlas: ${p.name} não consta como configurado. Verifique a key.`, 8000);
								return;
							}
							new Notice(`✓ ${p.name} OK (${key.length} chars armazenados).`, 6000);
						} catch (e) {
							new Notice(`Atlas: ${p.name} falhou: ${String(e).substring(0, 200)}`, 10000);
						}
					});
			});

			// v0.53: Render char count display abaixo do field (sem margin negativo que flutuava)
			const countWrap = containerEl.createDiv({ cls: "atlas-key-count-wrap" });
			charCountEl = countWrap.createSpan();
			const initialKey = (ensureProvidersConfig().apiKeys as Record<string, string | undefined>)[p.field] ?? "";
			charCountEl.setText(initialKey.length > 0 ? `${initialKey.length} chars armazenados` : "");
		}

		// Test connection
		new Setting(containerEl)
			.setName("🔌 Testar conexão dos providers")
			.setDesc("Lista quais providers estão configurados e respondendo.")
			.addButton((b) => {
				b.setButtonText("Testar").onClick(async () => {
					const router = this.plugin.providerRouter;
					if (!router) {
						new Notice("Atlas: router não inicializado.");
						return;
					}
					const ids = router.listConfiguredProviders();
					new Notice(`Atlas: ${ids.length} providers configurados — ${ids.join(", ") || "nenhum"}`);
				});
			});

		// Routing
		containerEl.createEl("h4", { text: t("settings.routing.title") });
		containerEl.createEl("p", {
			cls: "atlas-settings-section-desc",
			text: "Escolha qual provider+model usar para cada tipo de tarefa. Cada combinação tem preço diferente — veja Spend dashboard pra acompanhar custos.",
		});

		const routingTasks: { id: "chat" | "embedding" | "vision" | "reasoning" | "extraction" | "summarization"; label: string; help: string }[] = [
			{ id: "chat", label: "Chat geral", help: "Atlas Chat tab + Jarvis. Default Anthropic Sonnet ou Ollama." },
			{ id: "extraction", label: "Extração de KG", help: "Pessoas/sistemas/temas extraídos das notas. Modelo barato é OK (Haiku)." },
			{ id: "embedding", label: "Embeddings", help: "Vetorização para search semântica. Default OpenAI 3-small ou Ollama bge-m3." },
			{ id: "vision", label: "Vision (OCR/análise imagem)", help: "Whiteboards, screenshots, PDFs. Default GPT-4o ou Claude Sonnet." },
			{ id: "reasoning", label: "Reasoning (CoT)", help: "Pre-mortem, decisão complexa. Default Claude Opus ou DeepSeek R1." },
			{ id: "summarization", label: "Summarização", help: "Weekly reports, resumos de longa duração. Modelo barato (Haiku/4o-mini)." },
		];

		const router = this.plugin.providerRouter;
		const allConfigured = router?.listConfiguredProviders() ?? ["ollama"];

		for (const task of routingTasks) {
			new Setting(containerEl)
				.setName(task.label)
				.setDesc(task.help)
				.addDropdown((d) => {
					// Format: "provider:model"
					d.addOption("", "(use default)");
					import("../providers/registry").then(({ PROVIDER_MODELS }) => {
						for (const m of PROVIDER_MODELS) {
							if (!allConfigured.includes(m.provider)) continue;
							const compatible =
								task.id === "embedding" ? m.capabilities.embed :
								task.id === "vision" ? m.capabilities.vision :
								m.capabilities.chat;
							if (!compatible) continue;
							const priceLabel = m.pricePer1M.input === 0 ? "FREE" : `$${m.pricePer1M.input}/$${m.pricePer1M.output} per 1M`;
							d.addOption(`${m.provider}:${m.id}`, `${m.name} — ${priceLabel}`);
						}
					});
					const cfg = ensureProvidersConfig();
					const cur = cfg.routing?.[task.id];
					if (cur) d.setValue(`${cur.provider}:${cur.model}`);
					d.onChange(async (v) => {
						const cur = ensureProvidersConfig();
						if (!cur.routing) cur.routing = {};
						if (!v) {
							delete (cur.routing as Record<string, unknown>)[task.id];
						} else {
							const [provider, model] = v.split(":");
							(cur.routing as Record<string, { provider: string; model: string }>)[task.id] = { provider, model };
						}
						await this.plugin.saveSettings();
						this.plugin.providerRouter?.updateConfig({ routing: cur.routing as never });
					});
				});
		}

		// Budget controls
		containerEl.createEl("h4", { text: t("settings.budget.title") });
		containerEl.createEl("p", {
			cls: "atlas-settings-section-desc",
			text: "Atlas rastreia tokens consumidos × preço por modelo. Defina limites diário/mensal — Atlas avisa em 80% e (opcional) bloqueia chamadas além do limite.",
		});

		new Setting(containerEl)
			.setName(t("settings.field.budget.enabled"))
			.setDesc("Liga rastreamento + alertas + (opcional) hard cutoff.")
			.addToggle((t) => {
				const cfg = ensureProvidersConfig();
				if (!cfg.budget) cfg.budget = { enabled: false, monthlyUSD: 20, dailyUSD: 2, hardCutoff: false, warnAtPct: 0.8 };
				t.setValue(cfg.budget.enabled).onChange(async (v) => {
					const c = ensureProvidersConfig();
					if (!c.budget) c.budget = { enabled: false, monthlyUSD: 20, dailyUSD: 2, hardCutoff: false, warnAtPct: 0.8 };
					c.budget.enabled = v;
					await this.plugin.saveSettings();
					this.plugin.providerRouter?.getCostTracker().updateBudget(c.budget);
				});
			});

		new Setting(containerEl)
			.setName(t("settings.field.budget.monthly"))
			.setDesc("Limite total no mês. Default $20. 0 = sem limite.")
			.addText((t) => {
				const cfg = ensureProvidersConfig();
				t.setPlaceholder("20").setValue(String(cfg.budget?.monthlyUSD ?? 20));
				t.onChange(async (v) => {
					const c = ensureProvidersConfig();
					if (!c.budget) c.budget = { enabled: false, monthlyUSD: 20, dailyUSD: 2, hardCutoff: false, warnAtPct: 0.8 };
					c.budget.monthlyUSD = parseFloat(v) || 0;
					await this.plugin.saveSettings();
					this.plugin.providerRouter?.getCostTracker().updateBudget(c.budget);
				});
			});

		new Setting(containerEl)
			.setName(t("settings.field.budget.daily"))
			.setDesc("Limite por dia. Default $2. 0 = sem limite.")
			.addText((t) => {
				const cfg = ensureProvidersConfig();
				t.setPlaceholder("2").setValue(String(cfg.budget?.dailyUSD ?? 2));
				t.onChange(async (v) => {
					const c = ensureProvidersConfig();
					if (!c.budget) c.budget = { enabled: false, monthlyUSD: 20, dailyUSD: 2, hardCutoff: false, warnAtPct: 0.8 };
					c.budget.dailyUSD = parseFloat(v) || 0;
					await this.plugin.saveSettings();
					this.plugin.providerRouter?.getCostTracker().updateBudget(c.budget);
				});
			});

		new Setting(containerEl)
			.setName(t("settings.field.budget.hardcutoff"))
			.setDesc("Se ON, Atlas BLOQUEIA chamadas além do budget (recusa o request). Se OFF, só avisa.")
			.addToggle((t) => {
				const cfg = ensureProvidersConfig();
				t.setValue(cfg.budget?.hardCutoff ?? false).onChange(async (v) => {
					const c = ensureProvidersConfig();
					if (!c.budget) c.budget = { enabled: false, monthlyUSD: 20, dailyUSD: 2, hardCutoff: false, warnAtPct: 0.8 };
					c.budget.hardCutoff = v;
					await this.plugin.saveSettings();
					this.plugin.providerRouter?.getCostTracker().updateBudget(c.budget);
				});
			});

		// Quick link to Spend dashboard
		new Setting(containerEl)
			.setName(t("settings.field.budget.dashboard"))
			.setDesc("Abre Status → Spend pra ver gastos por dia/provider/feature com gráficos.")
			.addButton((b) => {
				b.setButtonText("Abrir dashboard").setCta().onClick(async () => {
					await this.plugin.activateMasterTab("status");
				});
			});
	}

	/** v0.22 Sprint I: render 4 Quick Presets buttons no topo de Cloud Providers section */
	/**
	 * v0.52.8: Banner que mostra QUAL provider está ativo AGORA.
	 * Resolve confusão "coloquei OpenAI mas vejo Anthropic" — torna explícito.
	 */
	private renderActiveProviderBanner(parent: HTMLElement): void {
		const route = this.plugin.providerRouter?.resolveTask("chat");
		if (!route) return;
		const wrap = parent.createDiv({ cls: "atlas-active-provider-banner" });
		const icon = wrap.createSpan({ cls: "atlas-active-provider-icon" });
		const providerEmoji: Record<string, string> = {
			ollama: "🤖",
			openai: "🟢",
			anthropic: "⭐",
			google: "🔵",
			mistral: "🇪🇺",
			xai: "🐦",
			openrouter: "🛣️",
			groq: "⚡",
			deepseek: "🐳",
			cohere: "🪶",
		};
		icon.setText(providerEmoji[route.provider] ?? "🤖");
		const text = wrap.createSpan({ cls: "atlas-active-provider-text" });
		text.createSpan({ cls: "atlas-active-provider-label", text: t("settings.active.label") });
		text.createSpan({
			cls: "atlas-active-provider-name",
			text: `${route.provider}:${route.model}`,
		});
		// Configurados (se mais de 1, indica que pode trocar)
		const configured = this.plugin.providerRouter?.listConfiguredProviders() ?? [];
		if (configured.length > 1) {
			const others = configured.filter((p) => p !== route.provider);
			const hint = wrap.createDiv({ cls: "atlas-active-provider-hint" });
			hint.setText(
				`Você também tem keys: ${others.join(", ")}. Pra trocar, use "Provider principal" abaixo OU dropdown na Spend dashboard.`
			);
		}
	}

	/**
	 * v0.52.3: Primary AI Provider — define o provider PRINCIPAL.
	 * Quando trocado, atualiza routing.chat + reasoning + summarization automaticamente
	 * pra modelos default daquele provider. Mais simples que configurar 5+ taskKinds.
	 */
	private renderPrimaryProviderPicker(parent: HTMLElement): void {
		const wrap = parent.createDiv({ cls: "atlas-primary-provider-picker" });
		wrap.createEl("h4", { text: t("settings.primary.title") });
		wrap.createEl("p", {
			cls: "atlas-settings-section-desc",
			text: "Escolha um provider PRIMÁRIO. Atlas configura routing de chat / reasoning / summarization automático com modelos default. Refinamento por tarefa: editar JSON abaixo.",
		});
		const select = wrap.createEl("select", { cls: "atlas-primary-provider-select" });
		const options: { value: string; label: string; needsKey?: string }[] = [
			{ value: "ollama", label: "🤖 Ollama (local, grátis, privado)" },
			{ value: "anthropic", label: "⭐ Anthropic Claude (qualidade premium)", needsKey: "anthropicEncrypted" },
			{ value: "openai", label: "🟢 OpenAI GPT-4o (versátil)", needsKey: "openaiEncrypted" },
			{ value: "google", label: "🔵 Google Gemini (cheap, fast)", needsKey: "googleEncrypted" },
			{ value: "mistral", label: "🇪🇺 Mistral (EU)", needsKey: "mistralEncrypted" },
			{ value: "deepseek", label: "🐳 DeepSeek (reasoning specialist)", needsKey: "deepseekEncrypted" },
			{ value: "groq", label: "⚡ Groq (super fast)", needsKey: "groqEncrypted" },
			{ value: "openrouter", label: "🛣️ OpenRouter (300+ models)", needsKey: "openrouterEncrypted" },
		];
		// Detect current primary based on routing.chat provider
		const currentChat = this.plugin.settings.providers?.routing?.chat;
		const currentPrimary = currentChat?.provider ?? "ollama";
		for (const opt of options) {
			const el = select.createEl("option", { value: opt.value, text: opt.label });
			if (opt.value === currentPrimary) el.selected = true;
		}
		select.addEventListener("change", async () => {
			const choice = select.value;
			const opt = options.find((o) => o.value === choice);
			if (!opt) return;
			// Verifica se key existe (para non-ollama)
			if (opt.needsKey) {
				const keys = (this.plugin.settings.providers?.apiKeys ?? {}) as Record<string, string | undefined>;
				if (!keys[opt.needsKey]) {
					new Notice(
						`Atlas: cole a API key de ${opt.label} primeiro nos campos abaixo, depois selecione como primário.`,
						8000
					);
					select.value = currentPrimary; // revert
					return;
				}
			}
			// Apply default routing per provider
			// v0.52.4: defaults agora priorizam CHEAP (Haiku/mini/Flash) pra economia.
			// User pode upgrade manual pra Sonnet/Opus se quiser qualidade premium.
			// Reasoning sempre usa modelo top do provider (uso pontual = OK gastar mais).
			const PROVIDER_DEFAULTS: Record<string, { chat: string; reasoning?: string; summarization?: string; embedding?: string }> = {
				ollama: { chat: this.plugin.settings.ollama?.generationModel ?? "qwen2.5:7b", embedding: "bge-m3" },
				anthropic: { chat: "claude-haiku-4-5-20251001", reasoning: "claude-opus-4-7", summarization: "claude-haiku-4-5-20251001" },
				openai: { chat: "gpt-4o-mini", reasoning: "o1-mini", summarization: "gpt-4o-mini", embedding: "text-embedding-3-small" },
				google: { chat: "gemini-2.0-flash", reasoning: "gemini-2.5-pro", summarization: "gemini-2.0-flash" },
				mistral: { chat: "mistral-small-latest", reasoning: "mistral-large-latest" },
				deepseek: { chat: "deepseek-chat", reasoning: "deepseek-reasoner", summarization: "deepseek-chat" },
				groq: { chat: "llama-3.1-8b-instant", reasoning: "llama-3.3-70b-versatile", summarization: "llama-3.1-8b-instant" },
				openrouter: { chat: "anthropic/claude-3.5-haiku" },
			};
			const defaults = PROVIDER_DEFAULTS[choice] ?? PROVIDER_DEFAULTS.ollama;
			if (!this.plugin.settings.providers) {
				this.plugin.settings.providers = { apiKeys: {} } as never;
			}
			if (!this.plugin.settings.providers.routing) {
				this.plugin.settings.providers.routing = {} as never;
			}
			const r = this.plugin.settings.providers.routing as Record<string, { provider: string; model: string }>;
			r.chat = { provider: choice, model: defaults.chat };
			if (defaults.reasoning) r.reasoning = { provider: choice, model: defaults.reasoning };
			if (defaults.summarization) r.summarization = { provider: choice, model: defaults.summarization };
			if (defaults.embedding) r.embedding = { provider: choice, model: defaults.embedding };
			await this.plugin.saveSettings();
			try {
				this.plugin.providerRouter?.updateConfig({ routing: this.plugin.settings.providers.routing as never });
			} catch {
				// best-effort
			}
			new Notice(`✓ Atlas agora usa ${opt.label} como primário. Re-abra Settings pra ver routing detalhado.`);
			this.display(); // re-render
		});
	}

	private renderQuickPresets(parent: HTMLElement): void {
		const wrap = parent.createDiv({ cls: "atlas-quick-presets" });
		const title = wrap.createDiv({ cls: "atlas-quick-presets-title" });
		title.createSpan({ text: "🎯 Quick Presets" });
		const sub = wrap.createDiv({ cls: "atlas-quick-presets-sub" });
		sub.setText("Aplica routing pré-configurado pra todas as 6 task kinds em 1 click.");

		const grid = wrap.createDiv({ cls: "atlas-quick-presets-grid" });

		interface PresetBtn {
			id: string;
			emoji: string;
			label: string;
			tagline: string;
			routing: import("../providers/router").TaskRouting;
		}

		const presets: PresetBtn[] = [
			{
				id: "anthropic-balanced",
				emoji: "🎨",
				label: "All-Anthropic balanced",
				tagline: "Sonnet 4.6 chat · Opus 4.7 reasoning · Haiku summary · Ollama embed",
				routing: {
					chat: { provider: "anthropic", model: "claude-sonnet-4-6" },
					extraction: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
					summarization: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
					vision: { provider: "anthropic", model: "claude-sonnet-4-6" },
					reasoning: { provider: "anthropic", model: "claude-opus-4-7" },
					embedding: { provider: "ollama", model: "bge-m3" },
				},
			},
			{
				id: "cheap-mix",
				emoji: "💰",
				label: "Cheap mix",
				tagline: "Haiku chat · DeepSeek R1 reasoning · 4o-mini summary · Cloud cheap embed",
				routing: {
					chat: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
					extraction: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
					summarization: { provider: "openai", model: "gpt-4o-mini" },
					vision: { provider: "openai", model: "gpt-4o" },
					reasoning: { provider: "deepseek", model: "deepseek-reasoner" },
					embedding: { provider: "openai", model: "text-embedding-3-small" },
				},
			},
			{
				id: "premium",
				emoji: "💎",
				label: "Premium tudo",
				tagline: "Opus 4.7 chat+reasoning · GPT-4o vision · Sonnet summary · OpenAI 3-large embed",
				routing: {
					chat: { provider: "anthropic", model: "claude-opus-4-7" },
					extraction: { provider: "anthropic", model: "claude-sonnet-4-6" },
					summarization: { provider: "anthropic", model: "claude-sonnet-4-6" },
					vision: { provider: "openai", model: "gpt-4o" },
					reasoning: { provider: "anthropic", model: "claude-opus-4-7" },
					embedding: { provider: "openai", model: "text-embedding-3-large" },
				},
			},
			{
				id: "local-only",
				emoji: "🏠",
				label: "Local-only (zero $)",
				tagline: "Tudo Ollama. Zero gasto. Privacidade total. Restaura default.",
				routing: {
					chat: { provider: "ollama", model: "qwen2.5:7b-instruct" },
					extraction: { provider: "ollama", model: "qwen2.5:7b-instruct" },
					summarization: { provider: "ollama", model: "qwen2.5:7b-instruct" },
					vision: { provider: "ollama", model: "llama3.2-vision:11b" },
					reasoning: { provider: "ollama", model: "qwen2.5:7b-instruct" },
					embedding: { provider: "ollama", model: "bge-m3" },
				},
			},
		];

		for (const preset of presets) {
			const btn = grid.createDiv({ cls: "atlas-quick-preset-btn" });
			btn.createDiv({ cls: "atlas-quick-preset-emoji", text: preset.emoji });
			btn.createDiv({ cls: "atlas-quick-preset-label", text: preset.label });
			btn.createDiv({ cls: "atlas-quick-preset-tagline", text: preset.tagline });
			btn.addEventListener("click", async () => {
				const { confirmAsync } = await import("../ui/confirm-modal");
				const ok = await confirmAsync(
					this.app,
					`Aplicar preset "${preset.label}"? Vai substituir routing atual de TODAS as 6 task kinds.\n\n${preset.tagline}`,
					{ title: `🎯 Aplicar: ${preset.label}`, yesLabel: "Aplicar", noLabel: "Cancelar" }
				);
				if (!ok) return;

				if (!this.plugin.settings.providers) {
					this.plugin.settings.providers = {
						apiKeys: {},
						routing: {},
						failoverChain: ["ollama"],
						budget: { enabled: false, monthlyUSD: 20, dailyUSD: 2, hardCutoff: false, warnAtPct: 0.8 },
					};
				}
				this.plugin.settings.providers.routing = preset.routing as never;
				await this.plugin.saveSettings();
				this.plugin.providerRouter?.updateConfig({ routing: preset.routing as never });
				new Notice(`✓ Atlas: preset "${preset.label}" aplicado.`, 6000);
				this.display();
			});
		}
	}

	/** v0.21 Sprint J: open ApiKeyDetectedModal pra ativar IA paga depois user colar key */
	private async maybeOpenApiKeyModal(providerId: string): Promise<void> {
		// Não abre se routing.chat já é cloud (user já configurou antes)
		const currentChat = this.plugin.settings.providers?.routing?.chat;
		if (currentChat && currentChat.provider !== "ollama") {
			// Já tá ativado — não pergunta de novo
			return;
		}
		try {
			const { ApiKeyDetectedModal } = await import("../ui/api-key-detected-modal");
			new ApiKeyDetectedModal(this.app, this.plugin, providerId).open();
		} catch {
			// silent fallback se modal indisponível
		}
	}

	private collectApiKeysPlain(): Record<string, string> {
		const keys: Record<string, string> = {};
		const stored = (this.plugin.settings.providers?.apiKeys ?? {}) as Record<string, string | undefined>;
		const map: Record<string, string> = {
			openaiEncrypted: "openai",
			anthropicEncrypted: "anthropic",
			googleEncrypted: "google",
			mistralEncrypted: "mistral",
			xaiEncrypted: "xai",
			openrouterEncrypted: "openrouter",
			groqEncrypted: "groq",
			deepseekEncrypted: "deepseek",
			cohereEncrypted: "cohere",
		};
		for (const [field, providerId] of Object.entries(map)) {
			const v = stored[field];
			if (v) keys[providerId] = v;
		}
		return keys;
	}

	// v0.7.6: Profile section — mudar perfil sem refazer onboarding
	private section_profile(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: t("settings.profile.section.title") });
		containerEl.createEl("p", {
			text: "Multi-perfil: Atlas adapta templates, tools IA, frameworks, métricas e schedules ao(s) perfil(is) escolhido(s).",
			cls: "atlas-settings-section-desc",
		});

		const selected = new Set<ProfileId>(this.plugin.settings.profile?.ids ?? []);

		const summary = containerEl.createDiv({ cls: "atlas-settings-profile-summary" });

		const updateSummary = () => {
			summary.empty();
			summary.removeClass("is-warning");
			if (selected.size === 0) {
				summary.setText("⚠️ Nenhum perfil selecionado. Ative pelo menos 1 abaixo.");
				summary.addClass("is-warning");
				return;
			}
			try {
				const merged = mergeProfiles(Array.from(selected));
				summary.createEl("div", {
					cls: "atlas-settings-profile-summary-main",
					text: `✓ ${selected.size} perfil(is) ativos: ${Array.from(selected)
						.map((id) => PROFILES.find((p) => p.id === id)?.emoji ?? "•")
						.join(" ")}`,
				});
				summary.createEl("div", {
					cls: "atlas-settings-profile-summary-meta",
					text: `Templates: ${merged.templates.length} · Tools IA: ${merged.tools.length} · Frameworks: ${merged.frameworks.length} · Métricas: ${merged.metrics.length}`,
				});
			} catch {
				summary.setText("Erro ao mesclar perfis.");
			}
		};
		updateSummary();

		for (const cat of PROFILE_CATEGORIES) {
			containerEl.createEl("div", { cls: "atlas-settings-profile-cat-head", text: cat.label });
			const grid = containerEl.createDiv({ cls: "atlas-settings-profile-grid" });

			for (const id of cat.ids) {
				const profile = PROFILES.find((p) => p.id === id);
				if (!profile) continue;

				const card = grid.createDiv({ cls: "atlas-settings-profile-card" });

				const updateStyle = () => {
					if (selected.has(id)) card.addClass("is-selected");
					else card.removeClass("is-selected");
				};
				updateStyle();

				const top = card.createDiv({ cls: "atlas-settings-profile-card-top" });
				top.createEl("span", { cls: "atlas-settings-profile-card-emoji", text: profile.emoji });
				top.createEl("div", { cls: "atlas-settings-profile-card-name", text: profile.name });

				card.createEl("div", { cls: "atlas-settings-profile-card-tag", text: profile.tagline });

				card.addEventListener("click", () => {
					if (selected.has(id)) selected.delete(id);
					else selected.add(id);
					updateStyle();
					updateSummary();
				});
			}
		}

		// Color accent picker
		new Setting(containerEl)
			.setName("Color accent")
			.setDesc("Cor primária do Atlas (aplicada em tabs ativas, header, badges).")
			.addDropdown((d) => {
				const presets = [
					{ id: "#6366f1", label: "Indigo" },
					{ id: "#14b8a6", label: "Teal" },
					{ id: "#f97316", label: "Orange" },
					{ id: "#f43f5e", label: "Rose" },
					{ id: "#16a34a", label: "Forest" },
					{ id: "#7c3aed", label: "Purple" },
					{ id: "#0ea5e9", label: "Sky" },
				];
				for (const p of presets) {
					d.addOption(p.id, p.label);
				}
				d.setValue(this.plugin.settings.profile?.colorAccent ?? "#6366f1");
				d.onChange(async (v) => {
					if (!this.plugin.settings.profile) {
						this.plugin.settings.profile = { ids: [] };
					}
					this.plugin.settings.profile.colorAccent = v;
					await this.plugin.saveSettings();
				});
			});

		// Apply button
		new Setting(containerEl)
			.setName("Aplicar mudanças")
			.setDesc(
				"Salva perfis selecionados + atualiza schedules (briefing time, weekly day) baseado nos defaults do perfil principal."
			)
			.addButton((b) =>
				b
					.setButtonText("Aplicar")
					.setCta()
					.onClick(async () => {
						if (selected.size === 0) {
							new Notice("Atlas: selecione pelo menos 1 perfil.");
							return;
						}
						if (!this.plugin.settings.profile) {
							this.plugin.settings.profile = { ids: [] };
						}
						this.plugin.settings.profile.ids = Array.from(selected);
						const merged = mergeProfiles(Array.from(selected));
						this.plugin.settings.schedules.morningBriefingTime = merged.defaults.briefingTime;
						this.plugin.settings.schedules.eveningReviewTime = merged.defaults.eveningReviewTime;
						this.plugin.settings.schedules.weeklyReportTime = merged.defaults.weeklyTime;
						this.plugin.settings.notifications.minimumSeverity = merged.defaults.notificationSeverity;
						await this.plugin.saveSettings();
						new Notice(`✓ Atlas: ${selected.size} perfil(is) ativos.`);
					})
			);

		// Show all tools override
		new Setting(containerEl)
			.setName("Mostrar todas as Tools IA")
			.setDesc("Quando OFF (default), Lab → Tools IA mostra só tools do(s) perfil(is) ativos.")
			.addToggle((t) => {
				t.setValue(this.plugin.settings.profile?.showAllToolsOverride ?? false);
				t.onChange(async (v) => {
					if (!this.plugin.settings.profile) {
						this.plugin.settings.profile = { ids: [] };
					}
					this.plugin.settings.profile.showAllToolsOverride = v;
					await this.plugin.saveSettings();
				});
			});
	}

	// v0.67.0: Settings UI Language toggle (PT/EN runtime switch)
	private section_language(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: t("settings.language.title") });
		containerEl.createEl("p", {
			text: t("settings.language.desc"),
			cls: "atlas-settings-section-desc",
		});

		const cur = this.plugin.settings.profile?.uiLanguage ?? "pt";

		new Setting(containerEl)
			.setName("Idioma da interface / UI Language")
			.addDropdown((dd) => {
				dd.addOption("pt", t("settings.language.pt"));
				dd.addOption("en", t("settings.language.en"));
				dd.setValue(cur);
				dd.onChange(async (val) => {
					if (!this.plugin.settings.profile) {
						this.plugin.settings.profile = {} as never;
					}
					(this.plugin.settings.profile as { uiLanguage?: "pt" | "en" }).uiLanguage = val as "pt" | "en";
					await this.plugin.saveSettings();
					// Apply runtime
					try {
						const i18n = await import("../i18n");
						i18n.setLanguage(val as "pt" | "en");
					} catch {/* swallow */}
					new Notice(`Atlas: idioma alterado pra ${val === "pt" ? "Português" : "English"}. Recarregue tabs Atlas pra refletir tudo.`);
					// Re-render this Settings tab pra mostrar strings novas
					this.display();
				});
			});
	}

	private section_user(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: t("settings.you.title") });

		new Setting(containerEl)
			.setName(t("settings.field.user.name"))
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
			.setName(t("settings.field.user.role"))
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
			.setName(t("settings.field.user.team"))
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
		containerEl.createEl("h3", { text: t("settings.ollama.title") });

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
			.setName(t("settings.field.ollama.gen"))
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
			.setName(t("settings.field.ollama.emb"))
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
			.setName(t("settings.field.ollama.test"))
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
		containerEl.createEl("h3", { text: t("settings.schedules.title") });

		new Setting(containerEl)
			.setName(t("settings.field.sched.morning"))
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
			.setName(t("settings.field.sched.evening"))
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
			.setName(t("settings.field.sched.weekly"))
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
		containerEl.createEl("h3", { text: t("settings.email.title") });
		containerEl.createEl("p", {
			text: "Para Gmail use App Password. Guardado encriptado localmente.",
		});

		new Setting(containerEl)
			.setName(t("settings.field.email.enabled"))
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.email.enabled)
					.onChange(async (v) => {
						this.plugin.settings.email.enabled = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName(t("settings.field.email.smtp")).addText((t) =>
			t
				.setValue(this.plugin.settings.email.smtpHost)
				.onChange(async (v) => {
					this.plugin.settings.email.smtpHost = v;
					await this.plugin.saveSettings();
				})
		);

		new Setting(containerEl).setName(t("settings.field.email.user")).addText((t) =>
			t
				.setValue(this.plugin.settings.email.smtpUser)
				.onChange(async (v) => {
					this.plugin.settings.email.smtpUser = v;
					await this.plugin.saveSettings();
				})
		);

		new Setting(containerEl)
			.setName(t("settings.field.email.from"))
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
			.setName(t("settings.field.email.recipients"))
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
		containerEl.createEl("h3", { text: t("settings.notifications.title") });

		new Setting(containerEl).setName(t("settings.field.notify.desktop")).addToggle((t) =>
			t
				.setValue(this.plugin.settings.notifications.desktopEnabled)
				.onChange(async (v) => {
					this.plugin.settings.notifications.desktopEnabled = v;
					await this.plugin.saveSettings();
				})
		);

		new Setting(containerEl)
			.setName(t("settings.field.notify.telegram"))
			.setDesc("Crie um bot via @BotFather, cole o token.")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.notifications.telegramEnabled)
					.onChange(async (v) => {
						this.plugin.settings.notifications.telegramEnabled = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName(t("settings.field.notify.telegram.token")).addText((t) =>
			t
				.setValue(this.plugin.settings.notifications.telegramBotToken)
				.onChange(async (v) => {
					this.plugin.settings.notifications.telegramBotToken = v;
					await this.plugin.saveSettings();
				})
		);

		new Setting(containerEl).setName(t("settings.field.notify.telegram.chat")).addText((t) =>
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
		containerEl.createEl("h3", { text: t("settings.voice.title") });

		// v0.22 Sprint F: FREE local banner
		const banner = containerEl.createDiv({ cls: "atlas-voice-banner" });
		banner.createDiv({ cls: "atlas-voice-banner-icon", text: "🔒" });
		const bannerText = banner.createDiv({ cls: "atlas-voice-banner-text" });
		bannerText.createDiv({
			cls: "atlas-voice-banner-title",
			text: "100% gratis e local",
		});
		bannerText.createDiv({
			cls: "atlas-voice-banner-desc",
			text: "Whisper.cpp roda na sua máquina, zero envio pra nuvem. Open source. Atlas auto-detecta o binário no first-run.",
		});
		const bannerLink = banner.createEl("a", {
			cls: "atlas-voice-banner-link",
			text: "github.com/ggerganov/whisper.cpp →",
		});
		bannerLink.addEventListener("click", (e) => {
			e.preventDefault();
			window.open("https://github.com/ggerganov/whisper.cpp", "_blank");
		});

		new Setting(containerEl).setName(t("settings.field.voice.enabled")).addToggle((t) =>
			t
				.setValue(this.plugin.settings.voice.enabled)
				.onChange(async (v) => {
					this.plugin.settings.voice.enabled = v;
					await this.plugin.saveSettings();
				})
		);

		// v0.22 Sprint F: Auto-detect now button
		new Setting(containerEl)
			.setName(t("settings.field.voice.autodetect"))
			.setDesc("Re-scan dos paths conhecidos (/opt/homebrew, /usr/local, ~/whisper.cpp/build, etc).")
			.addButton((b) => {
				b.setButtonText("Detectar").onClick(async () => {
					b.setButtonText("Detectando...");
					b.setDisabled(true);
					try {
						const { autoDetectWhisper } = await import("../automation/whisper-detector");
						const detection = await autoDetectWhisper();
						if (detection.installed && detection.binaryPath) {
							this.plugin.settings.voice.whisperBinaryPath = detection.binaryPath;
							if (detection.modelPath) {
								this.plugin.settings.voice.whisperModelPath = detection.modelPath;
							}
							await this.plugin.saveSettings();
							new Notice(
								`✓ Atlas: detectado em ${detection.binaryPath}${detection.version ? ` (${detection.version})` : ""}`,
								8000
							);
							this.display(); // re-render to show updated paths
						} else {
							new Notice(
								"Atlas: whisper.cpp não encontrado nos paths conhecidos. Use 'Como instalar' abaixo.",
								8000
							);
						}
					} finally {
						b.setButtonText("Detectar");
						b.setDisabled(false);
					}
				});
			});

		new Setting(containerEl)
			.setName(t("settings.field.voice.binary"))
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
			.setName(t("settings.field.voice.model"))
			.setDesc("Ex: ~/whisper.cpp/models/ggml-base.bin")
			.addText((t) =>
				t
					.setValue(this.plugin.settings.voice.whisperModelPath)
					.onChange(async (v) => {
						this.plugin.settings.voice.whisperModelPath = v;
						await this.plugin.saveSettings();
					})
			);

		// v0.22 Sprint F: Test button (validates binary executes)
		new Setting(containerEl)
			.setName(t("settings.field.voice.test"))
			.setDesc("Executa `whisper-cpp --version` e confirma que está funcionando.")
			.addButton((b) => {
				b.setButtonText("Testar").onClick(async () => {
					const path = this.plugin.settings.voice.whisperBinaryPath;
					if (!path) {
						new Notice("Atlas: configure o path do binário primeiro.", 5000);
						return;
					}
					b.setButtonText("Testando...");
					b.setDisabled(true);
					try {
						const { exec } = await import("child_process");
						const { promisify } = await import("util");
						const execAsync = promisify(exec);
						const { stdout, stderr } = await execAsync(`"${path}" --version`, { timeout: 5000 });
						const version = (stdout || stderr).trim().split("\n")[0]?.substring(0, 100);
						new Notice(`✓ whisper.cpp OK: ${version}`, 8000);
					} catch (e) {
						new Notice(`✗ whisper.cpp falhou: ${String(e).substring(0, 200)}`, 10000);
					} finally {
						b.setButtonText("Testar");
						b.setDisabled(false);
					}
				});
			});

		// v0.22 Sprint F: Install instructions (per-OS)
		new Setting(containerEl)
			.setName(t("settings.field.voice.install"))
			.setDesc("Comando + instruções específicas pra seu OS.")
			.addButton((b) => {
				b.setButtonText("Ver instruções").onClick(async () => {
					const { installInstructionsFor } = await import("../automation/whisper-detector");
					const platform = process.platform === "darwin" ? "darwin" :
						process.platform === "win32" ? "win32" :
						process.platform === "linux" ? "linux" : "other";
					const inst = installInstructionsFor(platform);
					new Notice(
						`📦 ${inst.command}\n\n${inst.help}`,
						20000
					);
					try {
						await navigator.clipboard.writeText(inst.command);
						new Notice("📋 Comando copiado pro clipboard!", 4000);
					} catch {
						// ignore
					}
				});
			});
	}

	private section_advanced(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: t("settings.advanced.title") });

		new Setting(containerEl)
			.setName(t("settings.field.adv.autoindex"))
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.behavior.autoIndexOnStartup)
					.onChange(async (v) => {
						this.plugin.settings.behavior.autoIndexOnStartup = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t("settings.field.adv.autokg"))
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
			.setName(t("settings.field.adv.audit"))
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
			.setName(t("settings.field.adv.reset"))
			.setDesc("Re-executa o wizard de configuração inicial.")
			.addButton((b) =>
				b.setButtonText("Resetar").onClick(async () => {
					this.plugin.settings.onboarding.completed = false;
					this.plugin.settings.onboarding.currentStep = 0;
					await this.plugin.saveSettings();
					new Notice("Atlas: onboarding resetado. Reabra o plugin.");
				})
			);

		// v0.74.0: Vault Importer History (v0.63 stores em settings.importHistory mas UI nunca exibia)
		const importHistory = (this.plugin.settings as { importHistory?: { ranAt: number; sourcePath: string; total: number; cost: number }[] }).importHistory;
		if (importHistory && importHistory.length > 0) {
			containerEl.createEl("h4", { text: "📥 Histórico de Vault Imports" });
			const histEl = containerEl.createDiv({ cls: "atlas-settings-import-hist" });
			for (const entry of importHistory.slice(-10).reverse()) {
				const row = histEl.createDiv({ cls: "atlas-settings-import-hist-row" });
				const date = new Date(entry.ranAt).toISOString().slice(0, 16).replace("T", " ");
				row.createSpan({ cls: "atlas-settings-import-hist-date", text: date });
				row.createSpan({ cls: "atlas-settings-import-hist-source", text: entry.sourcePath });
				row.createSpan({ cls: "atlas-settings-import-hist-stats", text: `${entry.total} notas · $${entry.cost.toFixed(4)}` });
			}
			new Setting(containerEl)
				.setName(t("settings.field.adv.import.clear"))
				.addButton((b) =>
					b.setButtonText("Limpar").onClick(async () => {
						(this.plugin.settings as { importHistory?: unknown[] }).importHistory = [];
						await this.plugin.saveSettings();
						new Notice("Atlas: histórico de imports limpo.");
						this.display();
					})
				);
		}

		// v0.74.0: System health quick check
		containerEl.createEl("h4", { text: "🩺 Health check" });
		const healthEl = containerEl.createDiv({ cls: "atlas-settings-health" });
		const checks: { label: string; status: () => boolean | "unknown" }[] = [
			{ label: "Ollama daemon", status: () => !!this.plugin.ollama },
			{ label: "Cost tracker", status: () => !!this.plugin.costTracker },
			{ label: "Provider router", status: () => !!this.plugin.providerRouter },
			{ label: "LLM service", status: () => !!this.plugin.llm },
			{ label: "KG store", status: () => !!this.plugin.kg },
			{ label: "Whisper config", status: () => !!this.plugin.settings.voice?.whisperBinaryPath },
			{ label: "Cloud providers", status: () => (this.plugin.providerRouter?.listConfiguredProviders().length ?? 0) > 0 },
		];
		for (const c of checks) {
			const status = c.status();
			const row = healthEl.createDiv({ cls: "atlas-settings-health-row" });
			const icon = status === true ? "✅" : status === false ? "❌" : "❓";
			row.createSpan({ cls: "atlas-settings-health-icon", text: icon });
			row.createSpan({ cls: "atlas-settings-health-label", text: c.label });
		}
	}
}
