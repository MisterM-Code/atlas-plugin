/**
 * Atlas v0.51.3 — What's New modal.
 *
 * Mostra ao user as features recentes (últimas 5 versões) num formato compacto.
 * Auto-aparece após upgrade (versão atual !== versão vista).
 * Manual via `atlas:whats-new` command.
 */

import { App, Modal, Setting, MarkdownRenderer, Component } from "obsidian";
import type AtlasPlugin from "../../main";
import { applyResponsiveModal } from "./modal-helpers";
import { t } from "../i18n";

const FEATURES_BY_VERSION = [
	{
		version: "0.74.0",
		title: "🩺 Settings Vault Import History + Health Dashboard",
		bullets: [
			"Histórico de imports com data + sourcePath + custo USD",
			"Health check 7 sistemas (Ollama/Cost/Router/LLM/KG/Whisper/Cloud) ✅/❌",
			"Quick-glance status sem abrir Status tab",
		],
	},
	{
		version: "0.73.0",
		title: "💬 Logs view: Chat I/O quick filter",
		bullets: [
			"Botão `💬 Chat I/O` 1-click filter (agent: + tool:)",
			"Logger search OR via 'term1|term2|term3'",
			"Audit fácil de toda conversa Atlas",
		],
	},
	{
		version: "0.72.0",
		title: "🎙️ Voice → create_note",
		bullets: [
			"'criar relatório sobre vendas Q2' via voz → cria documento + abre",
			"Heurística noteType (relatório→weekly-status, ADR→adr, paper→paper)",
			"Slot-filling se sem título",
		],
	},
	{
		version: "0.71.0",
		title: "🎨 Chat visual polish (Iron Man HUD)",
		bullets: [
			"Mic button pulsa vermelho durante recording",
			"Send button gradient cyan→indigo + hover scale",
			"Message bubbles bouncy slide-in com border-left accent",
			"Avatar pulsing glow durante AI thinking",
		],
	},
	{
		version: "0.70.0",
		title: "🚀 9 bugs críticos fixed (cost real + create_note + citations + deep)",
		bullets: [
			"Cost tracker: $0.XX real (era $0 sempre — fix this.costTracker assign)",
			"NEW tool create_note: Atlas cria/categoriza/abre documentos via chat",
			"Citations REAIS validadas contra vault (filter halucinadas)",
			"Deep research: topK adaptativo 8→20 + 6 patterns orchestrator",
			"Logging completo I/O chat (agent: response com intent+citations+tools+duration)",
			"Jarvis robust: graceful sandbox + VoicePermissionError typed",
			"Chat header gradient cyan→indigo + empty state breathing emoji",
		],
	},
	{
		version: "0.51.2",
		title: "🩺 Self-Test diagnostic",
		bullets: [
			"Comando `atlas:self-test` checa 12 sistemas (Ollama, KG, providers, cache, etc.)",
			"Output em nota markdown com 'N/12 OK' + sugestões pra falhas",
		],
	},
	{
		version: "0.51.1",
		title: "🔢 Activity Bar badges expandidos",
		bullets: [
			"Lab tab badge: cápsulas do tempo due hoje",
			"Auto tab badge stub pra futuras notificações",
		],
	},
	{
		version: "0.51.0",
		title: "🎓 Active Learning Loop — extraction feedback",
		bullets: [
			"Modal `atlas:active-learning-review` confirma/rejeita entities recém-extraídas",
			"Rejeitadas viram anti-exemplos no prompt do KGExtractor (cycle de melhoria)",
			"Storage append-only `.atlas/extraction-feedback.jsonl`",
		],
	},
	{
		version: "0.50.1",
		title: "🗓️ iCal stubs auto + 👁️ Vision OCR",
		bullets: [
			"`atlas:ical-create-stubs` cria notas pra eventos próximos 24h",
			"Auto-resolve attendee → KG Person (frontmatter person:)",
			"`atlas:vision-analyze` 5 task kinds (describe/ocr/table/diagram/summarize)",
			"Cloud GPT-4o/Claude Sonnet OU llama3.2-vision local",
		],
	},
	{
		version: "0.50.0",
		title: "🌌 Home Cosmic Complete",
		bullets: [
			"Próximos compromissos: Imminent badge + brief preview hover",
			"Quick Actions: 6 botões premium hover lift + glow",
			"Knowledge cards 4-categoria color-themed (cyan/indigo/violet/amber)",
			"create_action_item agora upserta no KG com personId resolvido",
		],
	},
	{
		version: "0.49.x",
		title: "✨ Home Cosmic polish",
		bullets: [
			"Status bar topo live (model + provider + cost/day)",
			"Atlas Percebeu premium gradient violet + counter + fade",
			"Critical alerts Iron Man corner brackets",
			"Vencendo clickable + countdown live",
			"Vault Health score 0-100 + clickable cards",
		],
	},
	{
		version: "0.48.0",
		title: "🤖 Multi-agent Orchestrator",
		bullets: [
			"Researcher (cheap LLM) + Writer (quality LLM) pipeline",
			"88% redução de tokens vs mega-prompt único",
			"'crie email sobre sistemas da semana' → orchestrator → researcher → writer",
		],
	},
	{
		version: "0.47.0",
		title: "🎯 Smart Slot-Filling Agent",
		bullets: [
			"Intent Dispatcher V2 — 5 patterns ZERO-LLM (PIX com problema, Miguel faltou, etc.)",
			"Slot-filling multi-turno TTL 5min",
			"Vault aggregation tool (aggregate_systems_by_period)",
			"Extraction cache SHA-256 (~90% economia em re-index)",
		],
	},
];

export class WhatsNewModal extends Modal {
	private mdComp = new Component();

	constructor(app: App, private plugin: AtlasPlugin) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		applyResponsiveModal(contentEl, { preferredWidth: 720, preferredHeight: 720 });
		contentEl.addClass("atlas-whats-new");

		const header = contentEl.createDiv({ cls: "atlas-whats-new-header" });
		header.createEl("h2", {
			cls: "atlas-whats-new-title",
			text: t("whatsnew.title", { version: this.plugin.manifest.version }),
		});
		header.createEl("p", {
			cls: "atlas-whats-new-subtitle",
			text: t("whatsnew.subtitle"),
		});

		const list = contentEl.createDiv({ cls: "atlas-whats-new-list" });

		for (const feat of FEATURES_BY_VERSION) {
			const card = list.createDiv({ cls: "atlas-whats-new-card" });
			const head = card.createDiv({ cls: "atlas-whats-new-card-head" });
			head.createSpan({
				cls: "atlas-whats-new-version",
				text: `v${feat.version}`,
			});
			head.createSpan({
				cls: "atlas-whats-new-feature-title",
				text: feat.title,
			});
			const body = card.createDiv({ cls: "atlas-whats-new-card-body" });
			const ul = body.createEl("ul");
			for (const b of feat.bullets) {
				const li = ul.createEl("li");
				void MarkdownRenderer.render(this.app, b, li, "", this.mdComp);
			}
		}

		new Setting(contentEl)
			.addButton((btn) => {
				btn.setButtonText("📚 Ver CHANGELOG completo")
					.onClick(() => {
						const path = "CHANGELOG.md";
						const f = this.app.vault.getAbstractFileByPath(path);
						if (f && "stat" in f) {
							void this.app.workspace.getLeaf().openFile(f as never);
						} else {
							window.open("https://github.com/MisterM-Code/atlas-plugin/blob/main/CHANGELOG.md", "_blank");
						}
						this.close();
					});
			})
			.addButton((btn) => {
				btn.setButtonText("🩺 Rodar Self-Test")
					.onClick(async () => {
						this.close();
						const m = await import("../commands/self-test");
						await m.runSelfTest(this.plugin);
					});
			})
			.addButton((btn) => {
				btn.setButtonText("✓ Entendi")
					.setCta()
					.onClick(() => this.close());
			});
	}

	onClose(): void {
		this.mdComp.unload();
		this.contentEl.empty();
	}
}

/**
 * Auto-detect version change e mostra modal uma vez por versão nova.
 * Persiste última versão vista em settings.lastWhatsNewVersion.
 */
export async function maybeShowWhatsNew(plugin: AtlasPlugin): Promise<void> {
	const current = plugin.manifest.version;
	const last = (plugin.settings as { lastWhatsNewVersion?: string }).lastWhatsNewVersion;
	if (last === current) return; // already seen
	// Show modal
	new WhatsNewModal(plugin.app, plugin).open();
	(plugin.settings as { lastWhatsNewVersion?: string }).lastWhatsNewVersion = current;
	await plugin.saveSettings();
}
