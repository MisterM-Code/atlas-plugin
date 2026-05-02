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
		const c = this.containerEl.children[1];
		c.empty();
		(c as HTMLElement).style.padding = "16px";
		(c as HTMLElement).style.overflow = "auto";

		this.container = c.createDiv() as HTMLDivElement;
		await this.refresh();

		this.refreshInterval = setInterval(() => void this.refresh(), 30_000);
	}

	async onClose(): Promise<void> {
		if (this.refreshInterval) clearInterval(this.refreshInterval);
	}

	async refresh(): Promise<void> {
		this.container.empty();

		const header = this.container.createDiv();
		header.style.display = "flex";
		header.style.justifyContent = "space-between";
		header.style.alignItems = "center";
		header.style.marginBottom = "12px";

		header.createEl("h3", { text: "🩺 Atlas Status" }).style.margin = "0";
		const refreshBtn = header.createEl("button", { text: "↻" });
		refreshBtn.style.fontSize = "11px";
		refreshBtn.addEventListener("click", () => void this.refresh());

		const loading = this.container.createEl("div", { text: "Verificando..." });
		loading.style.opacity = "0.6";

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
		const row = sec.createEl("div");
		row.style.fontWeight = "bold";
		row.style.fontSize = "13px";
		row.setText(text);

		if (!h.ollamaUp) {
			const hint = sec.createEl("div");
			hint.style.fontSize = "11px";
			hint.style.opacity = "0.7";
			hint.style.marginTop = "4px";
			hint.setText("Inicie o app Ollama (ou rode `ollama serve`) e clique ↻ para verificar.");
		}
	}

	private renderRamSection(h: SystemHealth): void {
		const sec = this.section("💾 RAM");
		const usedPct = Math.round((h.usedRamGB / h.totalRamGB) * 100);
		const free = sec.createEl("div");
		free.style.fontSize = "12px";
		free.setText(
			`Total: ${h.totalRamGB} GB · Usada: ${h.usedRamGB} GB (${usedPct}%) · Livre: ${h.freeRamGB} GB`
		);

		// Bar
		const bar = sec.createEl("div");
		bar.style.height = "8px";
		bar.style.background = "var(--background-modifier-border)";
		bar.style.borderRadius = "4px";
		bar.style.marginTop = "6px";
		bar.style.overflow = "hidden";
		const fill = bar.createEl("div");
		fill.style.height = "100%";
		fill.style.width = `${usedPct}%`;
		fill.style.background =
			usedPct > 85 ? "var(--color-red)" : usedPct > 65 ? "var(--color-orange)" : "var(--color-green)";

		const cpu = sec.createEl("div");
		cpu.style.fontSize = "10px";
		cpu.style.opacity = "0.6";
		cpu.style.marginTop = "4px";
		cpu.setText(`CPU: ${h.cpuModel} · ${h.cpuCount} cores · ${h.platform}`);
	}

	private renderModelSection(h: SystemHealth): void {
		const sec = this.section("🤖 Modelos");
		if (h.models.length === 0) {
			sec.createEl("div", { text: "(nenhum modelo encontrado)" }).style.opacity = "0.6";
			return;
		}

		for (const m of h.models) {
			const row = sec.createEl("div");
			row.style.padding = "6px 8px";
			row.style.marginBottom = "4px";
			row.style.background = "var(--background-secondary)";
			row.style.borderRadius = "4px";
			row.style.fontSize = "11px";

			const isConfigured = m.name === h.configuredModel;
			const fits = m.estimatedRamGB <= h.freeRamGB;
			const indicator = isConfigured ? "⭐ " : "";
			const fitsLabel = fits ? "✅ cabe" : "⚠️ pode dar OOM";

			const main = row.createEl("div");
			main.style.fontWeight = isConfigured ? "bold" : "normal";
			main.setText(`${indicator}${m.name}`);

			const meta = row.createEl("div");
			meta.style.fontSize = "10px";
			meta.style.opacity = "0.7";
			meta.setText(
				`${m.parameterSize} · ${m.quantization} · ~${m.estimatedRamGB} GB · ${fitsLabel}`
			);
		}
	}

	private renderRecommendations(h: SystemHealth): void {
		if (h.recommendations.length === 0) {
			const sec = this.section("✨ Recomendações");
			sec.createEl("div", { text: "🎉 Tudo OK!" }).style.opacity = "0.7";
			return;
		}
		const sec = this.section("⚠️ Recomendações");
		for (const r of h.recommendations) {
			const row = sec.createEl("div");
			row.style.padding = "6px 8px";
			row.style.marginBottom = "4px";
			row.style.background = "var(--background-secondary-alt)";
			row.style.borderLeft = "3px solid var(--color-orange)";
			row.style.fontSize = "11px";
			row.setText(r);
		}
	}

	private renderActions(h: SystemHealth): void {
		const sec = this.section("⚡ Ações");
		const grid = sec.createDiv();
		grid.style.display = "grid";
		grid.style.gridTemplateColumns = "1fr 1fr";
		grid.style.gap = "6px";

		const action = (label: string, fn: () => void | Promise<void>) => {
			const btn = grid.createEl("button", { text: label });
			btn.style.padding = "6px";
			btn.style.fontSize = "11px";
			btn.style.cursor = "pointer";
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
				const out = await this.plugin.ollama.chat(
					[{ role: "user", content: "responda só 'OK'" }],
					{
						model: this.plugin.settings.ollama.generationModel,
						temperature: 0,
						max_tokens: 10,
					}
				);
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
		const row = sec.createEl("div");
		row.style.padding = "8px";
		row.style.background = "var(--background-secondary)";
		row.style.borderLeft = "3px solid var(--color-red)";
		row.style.fontSize = "11px";

		const code = row.createEl("div", { text: h.lastError.code });
		code.style.fontWeight = "bold";
		const msg = row.createEl("div", { text: h.lastError.message });
		msg.style.opacity = "0.8";
		msg.style.marginTop = "4px";
		const at = row.createEl("div", { text: h.lastError.at });
		at.style.fontSize = "10px";
		at.style.opacity = "0.5";
		at.style.marginTop = "4px";
	}

	private section(title?: string): HTMLDivElement {
		const wrap = this.container.createDiv();
		wrap.style.marginBottom = "16px";
		if (title) {
			const h = wrap.createEl("div", { text: title });
			h.style.fontSize = "11px";
			h.style.fontWeight = "bold";
			h.style.opacity = "0.7";
			h.style.marginBottom = "6px";
			h.style.letterSpacing = "0.5px";
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

		const msg = contentEl.createEl("div", { text: this.err.humanMessage });
		msg.style.padding = "12px";
		msg.style.background = "var(--background-secondary)";
		msg.style.borderRadius = "6px";
		msg.style.marginBottom = "12px";
		msg.style.fontSize = "13px";

		const techCol = contentEl.createEl("details");
		techCol.createEl("summary", { text: "Detalhes técnicos" }).style.fontSize = "11px";
		const techBody = techCol.createEl("pre");
		techBody.style.fontSize = "10px";
		techBody.style.opacity = "0.7";
		techBody.style.padding = "8px";
		techBody.style.background = "var(--background-secondary-alt)";
		techBody.style.borderRadius = "4px";
		techBody.style.maxHeight = "120px";
		techBody.style.overflow = "auto";
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
