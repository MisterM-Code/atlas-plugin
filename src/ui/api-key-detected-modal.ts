/**
 * Atlas v0.21 Sprint J — ApiKeyDetectedModal.
 *
 * Quando user cola uma API key em Settings (campo passa de vazio → preenchido),
 * Atlas detecta o evento e abre este modal perguntando se quer ATIVAR IA paga
 * com routing default sugerido.
 *
 * - "Ativar IA paga" → aplica routing default + saveSettings + Notice
 * - "Manter local Ollama" → key fica salva mas routing não muda
 *
 * Funciona pra qualquer provider (OpenAI / Anthropic / Google / etc).
 */

import { App, Modal, Notice } from "obsidian";
import type AtlasPlugin from "../../main";
import { applyResponsiveModal } from "./modal-helpers";
import { DEFAULT_ROUTING_BY_PROVIDER, type DefaultRoutingPreset } from "../providers/default-routing";

export class ApiKeyDetectedModal extends Modal {
	private resolved = false;

	constructor(
		app: App,
		private readonly plugin: AtlasPlugin,
		private readonly providerId: string
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		applyResponsiveModal(contentEl, { preferredWidth: 580 });
		contentEl.addClass("atlas-apikey-modal");

		const preset: DefaultRoutingPreset | undefined = DEFAULT_ROUTING_BY_PROVIDER[this.providerId];
		if (!preset) {
			// Fallback: provider not in registry — close
			this.close();
			return;
		}

		// Hero
		const hero = contentEl.createDiv({ cls: "atlas-apikey-hero" });
		hero.createEl("div", { cls: "atlas-apikey-emoji", text: "🔑" });
		hero.createEl("h2", { text: `${preset.displayName} key detectada!` });
		hero.createEl("p", {
			cls: "atlas-apikey-tagline",
			text: "Quer ativar IA paga agora? Atlas vai aplicar o routing balanceado abaixo.",
		});

		// Routing preview
		contentEl.createEl("h4", { text: "🎯 Routing recomendado", cls: "atlas-apikey-section-title" });
		const routingTable = contentEl.createDiv({ cls: "atlas-apikey-routing" });
		const routes: { task: string; emoji: string; route: { provider: string; model: string } | undefined }[] = [
			{ task: "Chat geral", emoji: "💬", route: preset.routing.chat },
			{ task: "Extração KG", emoji: "🔍", route: preset.routing.extraction },
			{ task: "Embeddings (busca)", emoji: "🧠", route: preset.routing.embedding },
			{ task: "Vision (imagens)", emoji: "👁️", route: preset.routing.vision },
			{ task: "Reasoning (CoT)", emoji: "🤔", route: preset.routing.reasoning },
			{ task: "Summarization", emoji: "📝", route: preset.routing.summarization },
		];
		for (const { task, emoji, route } of routes) {
			if (!route) continue;
			const row = routingTable.createDiv({ cls: "atlas-apikey-route-row" });
			row.createDiv({ cls: "atlas-apikey-route-emoji", text: emoji });
			const text = row.createDiv({ cls: "atlas-apikey-route-text" });
			text.createDiv({ cls: "atlas-apikey-route-task", text: task });
			text.createDiv({
				cls: "atlas-apikey-route-model",
				text: `${route.provider}: ${route.model}`,
			});
		}

		// Tagline + estimate
		const info = contentEl.createDiv({ cls: "atlas-apikey-info" });
		info.createEl("p", { cls: "atlas-apikey-tagline-detail", text: preset.tagline });

		const cost = info.createDiv({ cls: "atlas-apikey-cost" });
		cost.createEl("strong", { text: "💰 Custo estimado: " });
		cost.createSpan({
			text: `$${preset.estimatedMonthlyUSD.low}–$${preset.estimatedMonthlyUSD.high}/mês (${preset.estimatedMonthlyUSD.assumption})`,
		});

		// Budget defaults note
		const budgetNote = contentEl.createDiv({ cls: "atlas-apikey-budget-note" });
		budgetNote.createEl("strong", { text: "🛡️ Budget protection: " });
		budgetNote.appendText(
			"Default $20/mês com warn em 80%. Hard cutoff OFF (só avisa). Você pode mudar em Settings → Cloud Providers."
		);

		// Actions
		const actions = contentEl.createDiv({ cls: "atlas-apikey-actions" });

		const declineBtn = actions.createEl("button", { text: "Manter local (Ollama)" });
		declineBtn.addEventListener("click", () => {
			this.commit(false);
			new Notice(
				`Atlas: ${preset.displayName} key salva. Routing continua local. Ative manualmente em Settings → Cloud Providers a qualquer momento.`,
				6000
			);
		});

		const activateBtn = actions.createEl("button", {
			text: "✅ Ativar IA paga",
			cls: "mod-cta",
		});
		activateBtn.addEventListener("click", async () => {
			await this.applyRouting(preset);
			this.commit(true);
		});
	}

	private async applyRouting(preset: DefaultRoutingPreset): Promise<void> {
		// Ensure providers section exists
		if (!this.plugin.settings.providers) {
			this.plugin.settings.providers = {
				apiKeys: {},
				routing: {},
				failoverChain: ["ollama"],
				budget: { enabled: false, monthlyUSD: 20, dailyUSD: 2, hardCutoff: false, warnAtPct: 0.8 },
			};
		}
		// Apply routing
		this.plugin.settings.providers.routing = {
			...(this.plugin.settings.providers.routing ?? {}),
			...preset.routing,
		};
		// Default budget if not set
		if (!this.plugin.settings.providers.budget) {
			this.plugin.settings.providers.budget = {
				enabled: true,
				monthlyUSD: 20,
				dailyUSD: 2,
				hardCutoff: false,
				warnAtPct: 0.8,
			};
		} else if (!this.plugin.settings.providers.budget.enabled) {
			// Auto-enable budget tracking when user activates paid AI
			this.plugin.settings.providers.budget.enabled = true;
		}

		await this.plugin.saveSettings();

		// Update router config in-memory
		this.plugin.providerRouter?.updateConfig({
			routing: this.plugin.settings.providers.routing as never,
		});

		new Notice(
			`✅ Atlas: ${preset.displayName} ativado!\n\nRouting: chat=${preset.routing.chat?.model}, reasoning=${preset.routing.reasoning?.model}.\n\nVeja gastos em Status → 💰 Spend.`,
			10000
		);
	}

	private commit(_activated: boolean): void {
		if (this.resolved) return;
		this.resolved = true;
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
