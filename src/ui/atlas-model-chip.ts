/**
 * Atlas v0.44 E8 — Model Switcher Chip.
 *
 * Componente reusable que mostra o modelo + provider ativos no chat,
 * com dropdown pra trocar rapidamente.
 *
 * Mounted em:
 *  - Master Sidebar header (após .atlas-master-header)
 *  - Status bar Today (futuro v0.45)
 *  - Jarvis HUD topo (futuro v0.45)
 *
 * Token economy: ZERO LLM calls — apenas KG + provider router lookup.
 */

import { Notice, setIcon } from "obsidian";
import type AtlasPlugin from "../../main";
import type { ProviderId } from "../providers/types";

interface ModelOption {
	provider: ProviderId;
	model: string;
	label: string;
	pricing?: string; // "$3/$15/1M" or "grátis"
}

// Curated model options per provider — same models from default-routing.ts
const PROVIDER_MODELS: Record<string, ModelOption[]> = {
	anthropic: [
		{ provider: "anthropic", model: "claude-sonnet-4-6", label: "Sonnet 4.6", pricing: "$3/$15·1M" },
		{ provider: "anthropic", model: "claude-opus-4-7", label: "Opus 4.7", pricing: "$15/$75·1M" },
		{ provider: "anthropic", model: "claude-haiku-4-5-20251001", label: "Haiku 4.5", pricing: "$0.25/$1.25·1M" },
	],
	openai: [
		{ provider: "openai", model: "gpt-4o", label: "GPT-4o", pricing: "$2.5/$10·1M" },
		{ provider: "openai", model: "gpt-4o-mini", label: "GPT-4o mini", pricing: "$0.15/$0.6·1M" },
		{ provider: "openai", model: "o1-mini", label: "o1-mini (reasoning)", pricing: "$3/$12·1M" },
	],
	google: [
		{ provider: "google", model: "gemini-2.0-flash-exp", label: "Gemini 2.0 Flash", pricing: "free tier" },
		{ provider: "google", model: "gemini-1.5-pro", label: "Gemini 1.5 Pro", pricing: "$1.25/$5·1M" },
	],
	mistral: [
		{ provider: "mistral", model: "mistral-large-latest", label: "Mistral Large", pricing: "$2/$6·1M" },
	],
	xai: [
		{ provider: "xai", model: "grok-2", label: "Grok 2", pricing: "$2/$10·1M" },
	],
	groq: [
		{ provider: "groq", model: "llama-3.1-70b-versatile", label: "Llama 3.1 70B (groq)", pricing: "free tier" },
	],
	deepseek: [
		{ provider: "deepseek", model: "deepseek-chat", label: "DeepSeek Chat", pricing: "$0.27/$1.10·1M" },
		{ provider: "deepseek", model: "deepseek-reasoner", label: "DeepSeek R1", pricing: "$0.55/$2.19·1M" },
	],
	openrouter: [
		{ provider: "openrouter", model: "anthropic/claude-sonnet-4-6", label: "Sonnet 4.6 (OR)", pricing: "varies" },
	],
	cohere: [
		{ provider: "cohere", model: "command-r-plus", label: "Command R+", pricing: "$2.5/$10·1M" },
	],
};

const PROVIDER_LABELS: Record<string, { emoji: string; name: string }> = {
	anthropic: { emoji: "⚡", name: "Anthropic" },
	openai: { emoji: "🤖", name: "OpenAI" },
	google: { emoji: "🔮", name: "Google" },
	mistral: { emoji: "🌬️", name: "Mistral" },
	xai: { emoji: "❌", name: "xAI" },
	groq: { emoji: "⚡", name: "Groq" },
	deepseek: { emoji: "🐳", name: "DeepSeek" },
	openrouter: { emoji: "🛣️", name: "OpenRouter" },
	cohere: { emoji: "🪶", name: "Cohere" },
	ollama: { emoji: "🦙", name: "Ollama (local)" },
};

export interface ModelChipHandle {
	el: HTMLDivElement;
	refresh: () => void;
}

export function renderAtlasModelChip(parent: HTMLElement, plugin: AtlasPlugin): ModelChipHandle {
	const chip = parent.createDiv({ cls: "atlas-model-chip" }) as HTMLDivElement;
	chip.title = "Click pra trocar modelo do chat";

	const refresh = (): void => {
		chip.empty();
		const router = plugin.providerRouter;
		const route = router?.resolveTask("chat");
		const provider = route?.provider ?? "ollama";
		const model = route?.model ?? plugin.settings.ollama?.generationModel ?? "(no model)";
		const meta = PROVIDER_LABELS[provider] ?? { emoji: "?", name: provider };

		const provBadge = chip.createSpan({
			cls: `atlas-model-chip-provider is-${provider}`,
			text: meta.emoji,
		});
		void provBadge;
		chip.createSpan({ cls: "atlas-model-chip-model", text: model });
		const dropArrow = chip.createSpan({ cls: "atlas-model-chip-arrow", text: "▾" });
		void dropArrow;
	};

	refresh();

	chip.addEventListener("click", (ev) => {
		ev.stopPropagation();
		openDropdown(chip, plugin, refresh);
	});

	return { el: chip, refresh };
}

function openDropdown(anchor: HTMLElement, plugin: AtlasPlugin, onChange: () => void): void {
	// Close any existing
	document.querySelectorAll(".atlas-model-chip-dropdown").forEach((el) => el.remove());

	const router = plugin.providerRouter;
	const configured = router?.listConfiguredProviders() ?? [];
	const currentRoute = router?.resolveTask("chat");

	const dd = document.createElement("div");
	dd.classList.add("atlas-model-chip-dropdown");
	const rect = anchor.getBoundingClientRect();
	dd.style.position = "fixed";
	dd.style.top = `${rect.bottom + 6}px`;
	dd.style.left = `${rect.left}px`;
	dd.style.zIndex = "10000";
	document.body.appendChild(dd);

	// Header
	const header = dd.createDiv({ cls: "atlas-model-chip-dropdown-header" });
	header.setText("Trocar modelo do chat");

	// List configured cloud providers
	const cloudConfigured = configured.filter((p) => p !== "ollama");
	for (const prov of cloudConfigured) {
		const meta = PROVIDER_LABELS[prov] ?? { emoji: "?", name: prov };
		const section = dd.createDiv({ cls: "atlas-model-chip-section" });
		section.createDiv({
			cls: "atlas-model-chip-section-title",
			text: `${meta.emoji} ${meta.name}`,
		});
		const models = PROVIDER_MODELS[prov] ?? [];
		for (const opt of models) {
			renderModelRow(section, opt, currentRoute, plugin, onChange, dd);
		}
	}

	// Ollama section (always shown)
	const ollamaSection = dd.createDiv({ cls: "atlas-model-chip-section" });
	ollamaSection.createDiv({
		cls: "atlas-model-chip-section-title",
		text: "🦙 Ollama (local)",
	});
	// List actually-pulled Ollama models (best-effort: just current configured)
	const cur = plugin.settings.ollama?.generationModel;
	if (cur) {
		renderModelRow(
			ollamaSection,
			{ provider: "ollama", model: cur, label: cur, pricing: "grátis" },
			currentRoute,
			plugin,
			onChange,
			dd
		);
	}
	const ollamaHint = ollamaSection.createDiv({
		cls: "atlas-model-chip-hint",
		text: "+ pull modelos via Status → Catálogo",
	});
	void ollamaHint;

	// Unconfigured providers (show with warning)
	const allProviders: ProviderId[] = ["anthropic", "openai", "google", "mistral", "deepseek"];
	const unconfigured = allProviders.filter((p) => !configured.includes(p));
	if (unconfigured.length > 0) {
		const hr = dd.createEl("hr", { cls: "atlas-model-chip-divider" });
		void hr;
		const unconfSection = dd.createDiv({ cls: "atlas-model-chip-section" });
		unconfSection.createDiv({
			cls: "atlas-model-chip-section-title",
			text: "⚠️ Não configurados",
		});
		for (const prov of unconfigured) {
			const meta = PROVIDER_LABELS[prov];
			const row = unconfSection.createDiv({ cls: "atlas-model-chip-row is-disabled" });
			row.createSpan({
				cls: "atlas-model-chip-row-emoji",
				text: meta?.emoji ?? "?",
			});
			row.createSpan({
				cls: "atlas-model-chip-row-name",
				text: meta?.name ?? prov,
			});
			row.createSpan({
				cls: "atlas-model-chip-row-hint",
				text: "Adicione API key →",
			});
			row.addEventListener("click", () => {
				dd.remove();
				const apiAny = plugin.app as unknown as {
					setting?: { open: () => void; openTabById: (id: string) => void };
				};
				apiAny.setting?.open();
				apiAny.setting?.openTabById("atlas");
			});
		}
	}

	// Settings link footer
	const footer = dd.createDiv({ cls: "atlas-model-chip-footer" });
	const settingsBtn = footer.createDiv({ cls: "atlas-model-chip-settings-btn" });
	const ic = settingsBtn.createSpan({ cls: "atlas-model-chip-settings-icon" });
	setIcon(ic, "settings");
	settingsBtn.createSpan({ text: "Configurar providers..." });
	settingsBtn.addEventListener("click", () => {
		dd.remove();
		const apiAny = plugin.app as unknown as {
			setting?: { open: () => void; openTabById: (id: string) => void };
		};
		apiAny.setting?.open();
		apiAny.setting?.openTabById("atlas");
	});

	// Close dropdown on outside click
	const closeHandler = (e: MouseEvent): void => {
		if (!dd.contains(e.target as Node) && !anchor.contains(e.target as Node)) {
			dd.remove();
			document.removeEventListener("click", closeHandler);
		}
	};
	setTimeout(() => document.addEventListener("click", closeHandler), 50);
}

function renderModelRow(
	parent: HTMLElement,
	opt: ModelOption,
	current: { provider: ProviderId; model: string } | null | undefined,
	plugin: AtlasPlugin,
	onChange: () => void,
	dd: HTMLElement
): void {
	const isActive = current?.provider === opt.provider && current?.model === opt.model;
	const row = parent.createDiv({
		cls: `atlas-model-chip-row ${isActive ? "is-active" : ""}`,
	});
	row.createSpan({
		cls: "atlas-model-chip-row-check",
		text: isActive ? "✓" : "",
	});
	row.createSpan({ cls: "atlas-model-chip-row-name", text: opt.label });
	if (opt.pricing) {
		row.createSpan({
			cls: "atlas-model-chip-row-price",
			text: opt.pricing,
		});
	}
	row.addEventListener("click", async () => {
		dd.remove();
		// Apply routing chat → opt
		if (!plugin.settings.providers) {
			plugin.settings.providers = {
				apiKeys: {},
				routing: {},
				failoverChain: ["ollama"],
				budget: {
					enabled: false,
					monthlyUSD: 20,
					dailyUSD: 2,
					hardCutoff: false,
					warnAtPct: 0.8,
				},
			};
		}
		plugin.settings.providers.routing = {
			...(plugin.settings.providers.routing ?? {}),
			chat: { provider: opt.provider, model: opt.model },
		};
		await plugin.saveSettings();
		plugin.providerRouter?.updateConfig({
			routing: plugin.settings.providers.routing as never,
		});
		new Notice(`✓ Atlas: chat agora via ${opt.label}`, 4000);
		onChange();
	});
}
