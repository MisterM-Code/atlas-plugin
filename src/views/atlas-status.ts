import { ItemView, WorkspaceLeaf, Notice, Modal, Setting } from "obsidian";
import * as os from "os";
import type AtlasPlugin from "../../main";
import { HealthCheck, SystemHealth } from "../automation/health-check";
import { applyResponsiveModal } from "../ui/modal-helpers";

export const ATLAS_STATUS_VIEW = "atlas-status-view";

const RECOMMENDED_LIGHT_MODEL = "llama3.2:3b"; // ~2 GB — cabe em qualquer cenário
const RECOMMENDED_BALANCED_MODEL = "qwen2.5:7b-instruct"; // ~5 GB
const RECOMMENDED_POWER_MODEL = "qwen2.5:14b"; // ~9 GB

function recommendedModelForFreeRam(freeGB: number): string {
	if (freeGB >= 10) return RECOMMENDED_POWER_MODEL;
	if (freeGB >= 6) return RECOMMENDED_BALANCED_MODEL;
	return RECOMMENDED_LIGHT_MODEL;
}

export class AtlasStatusView extends ItemView {
	private container!: HTMLDivElement;
	private health: HealthCheck;
	private refreshInterval: ReturnType<typeof setInterval> | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: AtlasPlugin) {
		super(leaf);
		this.health = new HealthCheck(plugin.ollama);
	}

	getViewType(): string {
		return ATLAS_STATUS_VIEW;
	}

	getDisplayText(): string {
		return "Atlas Status";
	}

	getIcon(): string {
		return "activity";
	}

	async onOpen(): Promise<void> {
		const c = this.containerEl.children[1] as HTMLElement;
		c.empty();
		c.addClass("atlas-status-host");

		this.container = c.createDiv() as HTMLDivElement;
		await this.refresh();

		this.refreshInterval = setInterval(() => void this.refresh(), 30_000);
	}

	async onClose(): Promise<void> {
		if (this.refreshInterval) clearInterval(this.refreshInterval);
	}

	async refresh(): Promise<void> {
		this.container.empty();

		const header = this.container.createDiv({ cls: "atlas-status-header" });
		header.createEl("h3", { text: "🩺 Atlas Status", cls: "atlas-status-title" });
		const refreshBtn = header.createEl("button", { text: "↻", cls: "atlas-status-refresh" });
		refreshBtn.addEventListener("click", () => void this.refresh());

		const loading = this.container.createEl("div", {
			text: "Verificando...",
			cls: "atlas-status-loading",
		});

		const h = await this.health.run(this.plugin.settings.ollama.generationModel);
		loading.remove();

		this.renderOllamaSection(h);
		this.renderRamSection(h);
		this.renderModelSection(h);
		this.renderRecommendations(h);
		this.renderActions(h);
		this.renderLastError(h);
	}

	private renderOllamaSection(h: SystemHealth): void {
		const sec = this.section();
		const dot = h.ollamaUp ? "🟢" : "🔴";
		const text = h.ollamaUp
			? `${dot} Ollama daemon — UP (ping ${h.pingMs}ms)`
			: `${dot} Ollama daemon — OFFLINE`;
		sec.createEl("div", { cls: "atlas-status-ollama-row", text });

		if (!h.ollamaUp) {
			sec.createEl("div", {
				cls: "atlas-status-ollama-hint",
				text: "Inicie o app Ollama (ou rode `ollama serve`) e clique ↻ para verificar.",
			});
		}
	}

	private renderRamSection(h: SystemHealth): void {
		const sec = this.section("💾 RAM");
		const usedPct = Math.round((h.usedRamGB / h.totalRamGB) * 100);
		sec.createEl("div", {
			cls: "atlas-status-ram-text",
			text: `Total: ${h.totalRamGB} GB · Usada: ${h.usedRamGB} GB (${usedPct}%) · Livre: ${h.freeRamGB} GB`,
		});

		const sevClass = usedPct > 85 ? "is-high" : usedPct > 65 ? "is-mid" : "is-low";
		const bar = sec.createEl("div", { cls: "atlas-status-ram-bar" });
		const fill = bar.createEl("div", { cls: `atlas-status-ram-fill ${sevClass}` });
		fill.style.setProperty("width", `${usedPct}%`);

		sec.createEl("div", {
			cls: "atlas-status-ram-cpu",
			text: `CPU: ${h.cpuModel} · ${h.cpuCount} cores · ${h.platform}`,
		});
	}

	private renderModelSection(h: SystemHealth): void {
		const sec = this.section("🤖 Modelos");
		if (h.models.length === 0) {
			sec.createEl("div", { text: "(nenhum modelo encontrado)", cls: "atlas-status-empty-model" });
			return;
		}

		for (const m of h.models) {
			const row = sec.createEl("div", { cls: "atlas-status-model-row" });

			const isConfigured = m.name === h.configuredModel;
			const fits = m.estimatedRamGB <= h.freeRamGB;
			const indicator = isConfigured ? "⭐ " : "";
			const fitsLabel = fits ? "✅ cabe" : "⚠️ pode dar OOM";

			row.createEl("div", {
				cls: isConfigured ? "atlas-status-model-main is-configured" : "atlas-status-model-main",
				text: `${indicator}${m.name}`,
			});
			row.createEl("div", {
				cls: "atlas-status-model-meta",
				text: `${m.parameterSize} · ${m.quantization} · ~${m.estimatedRamGB} GB · ${fitsLabel}`,
			});
		}
	}

	private renderRecommendations(h: SystemHealth): void {
		if (h.recommendations.length === 0) {
			const sec = this.section("✨ Recomendações");
			sec.createEl("div", { text: "🎉 Tudo OK!", cls: "atlas-status-recs-ok" });
			return;
		}
		const sec = this.section("⚠️ Recomendações");
		for (const r of h.recommendations) {
			sec.createEl("div", { cls: "atlas-status-rec-row", text: r });
		}
	}

	private renderActions(h: SystemHealth): void {
		const sec = this.section("⚡ Ações");
		const grid = sec.createDiv({ cls: "atlas-status-actions-grid" });

		const action = (label: string, fn: () => void | Promise<void>) => {
			const btn = grid.createEl("button", { cls: "atlas-status-action-btn", text: label });
			btn.addEventListener("click", () => void fn());
		};

		action("↻ Re-verificar", () => this.refresh());

		const recommended = recommendedModelForFreeRam(h.freeRamGB);
		if (!h.configuredModelAvailable || h.configuredModelFitsRam === false) {
			action(`📥 Pull ${recommended}`, async () => {
				await pullRecommendedModel(this.plugin, recommended);
				await this.refresh();
			});
			action(`🔄 Trocar para ${recommended}`, async () => {
				this.plugin.settings.ollama.generationModel = recommended;
				await this.plugin.saveSettings();
				new Notice(`Atlas: modelo trocado para ${recommended}.`);
				await this.refresh();
			});
		}

		action("🧪 Testar chat", async () => {
			try {
				// v0.22 Sprint H: wire via LLMService (testa cloud routing se configurado)
				const messages = [{ role: "user" as const, content: "responda só 'OK'" }];
				const out = this.plugin.llm
					? await this.plugin.llm.chat(messages, {
							feature: "views.atlas-status.test",
							taskKind: "chat",
							temperature: 0,
							maxTokens: 10,
					  })
					: await this.plugin.ollama.chat(messages, {
							model: this.plugin.settings.ollama.generationModel,
							temperature: 0,
							max_tokens: 10,
					  });
				new Notice(`Atlas: chat OK · "${out.substring(0, 30)}"`, 6000);
			} catch (e) {
				const ae = e as { humanMessage?: string };
				new Notice(
					`Atlas: chat falhou — ${ae.humanMessage ?? String(e)}`,
					10000
				);
			}
		});

		action("🔧 Settings → Ollama", () => {
			(this.app as unknown as { setting: { open: () => void; openTabById: (id: string) => void } }).setting.open();
			(this.app as unknown as { setting: { openTabById: (id: string) => void } }).setting.openTabById("atlas");
		});
	}

	private renderLastError(h: SystemHealth): void {
		if (!h.lastError) return;
		const sec = this.section("🚨 Último erro");
		const row = sec.createEl("div", { cls: "atlas-status-error-row" });
		row.createEl("div", { cls: "atlas-status-error-code", text: h.lastError.code });
		row.createEl("div", { cls: "atlas-status-error-msg", text: h.lastError.message });
		row.createEl("div", { cls: "atlas-status-error-at", text: h.lastError.at });
	}

	private section(title?: string): HTMLDivElement {
		const wrap = this.container.createDiv({ cls: "atlas-status-section" });
		if (title) {
			wrap.createEl("div", { cls: "atlas-status-section-title", text: title });
		}
		return wrap.createDiv() as HTMLDivElement;
	}
}

// ──────────────────────────────────────────────────────────────────
// Helpers exportados (usados em comandos do main)

export async function pullRecommendedModel(
	plugin: AtlasPlugin,
	modelOverride?: string
): Promise<void> {
	// Detect freeRAM e escolhe melhor se override não fornecido
	let model = modelOverride;
	if (!model) {
		try {
			const freeGB = os.freemem() / 1_073_741_824;
			model = recommendedModelForFreeRam(freeGB);
		} catch {
			model = RECOMMENDED_LIGHT_MODEL;
		}
	}
	const notice = new Notice(`Atlas: baixando ${model} (pode levar 5-10 min)...`, 0);
	try {
		await plugin.ollama.pullModel(model, (status, pct) => {
			notice.setMessage(`Atlas: ${model} · ${status} ${pct.toFixed(0)}%`);
		});
		notice.hide();
		new Notice(`Atlas: ${model} baixado. Trocando default...`, 6000);
		plugin.settings.ollama.generationModel = model;
		await plugin.saveSettings();
	} catch (e) {
		notice.hide();
		new Notice(`Atlas: pull falhou — ${String(e)}`, 10000);
	}
}

export class OllamaErrorModal extends Modal {
	constructor(
		app: import("obsidian").App,
		private plugin: AtlasPlugin,
		private err: import("../automation/error-classifier").AtlasError
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		applyResponsiveModal(contentEl, { preferredWidth: 560 });
		contentEl.createEl("h3", { text: "⚠️ Atlas precisa de ajuda" });

		contentEl.createEl("div", {
			text: this.err.humanMessage,
			cls: "atlas-error-modal-msg",
		});

		const techCol = contentEl.createEl("details");
		techCol.createEl("summary", {
			text: "Detalhes técnicos",
			cls: "atlas-error-modal-summary",
		});
		const techBody = techCol.createEl("pre", { cls: "atlas-error-modal-tech" });
		techBody.textContent = `${this.err.code}: ${this.err.message}`;

		const setting = new Setting(contentEl);
		for (const action of this.err.actions) {
			setting.addButton((b) => {
				b.setButtonText(action.label).onClick(async () => {
					if (action.commandId) {
						const apiAny = this.app as unknown as {
							commands?: { executeCommandById?: (id: string) => void };
						};
						apiAny.commands?.executeCommandById?.(action.commandId);
					} else if (action.url) {
						window.open(action.url);
					}
					this.close();
				});
			});
		}
		setting.addButton((b) => b.setButtonText("Fechar").onClick(() => this.close()));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
