/**
 * Atlas v0.21 — WhisperSetupModal.
 *
 * Substitui a pilha de notices/Settings tab que aparecia quando voice falhava
 * por um modal único, gracioso, com 4 ações claras:
 *  - 🔍 Auto-detect (re-scan paths)
 *  - 📦 Install via Homebrew (mac) — copia comando pro clipboard + abre Terminal
 *  - 🌐 Abrir docs whisper.cpp
 *  - ☁️ Use cloud STT (se cloud configurado)
 *  - Pular
 *
 * Aberto pelo `atlas:voice-needs-whisper-config` event listener no JarvisCore.
 */

import { App, Modal, Notice } from "obsidian";
// v0.52.3: lazy shell — child_process só carrega quando openTerminal chama
import { runShell } from "../utils/shell";
import type AtlasPlugin from "../../main";
import { applyResponsiveModal } from "./modal-helpers";
import { autoDetectWhisper, installInstructionsFor, type WhisperDetection } from "../automation/whisper-detector";
import { logger } from "../utils/logger";

export class WhisperSetupModal extends Modal {
	private statusEl!: HTMLElement;

	constructor(app: App, private readonly plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		applyResponsiveModal(contentEl, { preferredWidth: 620 });
		contentEl.addClass("atlas-whisper-setup-modal");

		// Header
		const hero = contentEl.createDiv({ cls: "atlas-whisper-hero" });
		hero.createEl("h2", { text: "🎙️ Voz no Atlas" });
		hero.createEl("p", {
			cls: "atlas-whisper-tagline",
			text: "100% gratis e local. Whisper.cpp roda na sua máquina, zero envio pra nuvem.",
		});

		// Status (live)
		this.statusEl = contentEl.createDiv({ cls: "atlas-whisper-status" });
		void this.refreshStatus();

		// Action buttons grid
		const actions = contentEl.createDiv({ cls: "atlas-whisper-actions" });

		// 1. Auto-detect
		const detectBtn = actions.createEl("button", { cls: "atlas-whisper-action mod-cta" });
		detectBtn.createDiv({ cls: "atlas-whisper-action-icon", text: "🔍" });
		const detectText = detectBtn.createDiv({ cls: "atlas-whisper-action-text" });
		detectText.createDiv({ cls: "atlas-whisper-action-title", text: "Auto-detect agora" });
		detectText.createDiv({ cls: "atlas-whisper-action-desc", text: "Re-scan dos paths conhecidos (brew/local/PATH)" });
		detectBtn.addEventListener("click", async () => {
			detectBtn.disabled = true;
			detectBtn.setText("Detectando...");
			await this.handleAutoDetect();
			detectBtn.disabled = false;
		});

		// 2. Install via Homebrew (macOS)
		const platform = process.platform;
		if (platform === "darwin") {
			const brewBtn = actions.createEl("button", { cls: "atlas-whisper-action" });
			brewBtn.createDiv({ cls: "atlas-whisper-action-icon", text: "📦" });
			const brewText = brewBtn.createDiv({ cls: "atlas-whisper-action-text" });
			brewText.createDiv({ cls: "atlas-whisper-action-title", text: "Instalar via Homebrew" });
			brewText.createDiv({ cls: "atlas-whisper-action-desc", text: "Copia comando + abre Terminal" });
			brewBtn.addEventListener("click", () => {
				void this.handleHomebrewInstall();
			});
		}

		// 3. Download model (.bin) — opens Terminal with curl command pre-filled
		const modelBtn = actions.createEl("button", { cls: "atlas-whisper-action mod-cta" });
		modelBtn.createDiv({ cls: "atlas-whisper-action-icon", text: "🧠" });
		const modelText = modelBtn.createDiv({ cls: "atlas-whisper-action-text" });
		modelText.createDiv({ cls: "atlas-whisper-action-title", text: "Baixar modelo (base)" });
		modelText.createDiv({
			cls: "atlas-whisper-action-desc",
			text: "ggml-base.bin (~150 MB) · copia curl + abre Terminal",
		});
		modelBtn.addEventListener("click", () => {
			void this.handleModelDownload();
		});

		// 4. Open docs
		const docsBtn = actions.createEl("button", { cls: "atlas-whisper-action" });
		docsBtn.createDiv({ cls: "atlas-whisper-action-icon", text: "🌐" });
		const docsText = docsBtn.createDiv({ cls: "atlas-whisper-action-text" });
		docsText.createDiv({ cls: "atlas-whisper-action-title", text: "Docs whisper.cpp" });
		docsText.createDiv({ cls: "atlas-whisper-action-desc", text: "github.com/ggerganov/whisper.cpp" });
		docsBtn.addEventListener("click", () => {
			window.open("https://github.com/ggerganov/whisper.cpp", "_blank");
		});

		// 4. Use cloud STT (if cloud provider available)
		const router = this.plugin.providerRouter;
		const hasCloud = router && router.listConfiguredProviders().some((p) => p !== "ollama");
		if (hasCloud) {
			const cloudBtn = actions.createEl("button", { cls: "atlas-whisper-action" });
			cloudBtn.createDiv({ cls: "atlas-whisper-action-icon", text: "☁️" });
			const cloudText = cloudBtn.createDiv({ cls: "atlas-whisper-action-text" });
			cloudText.createDiv({ cls: "atlas-whisper-action-title", text: "Usar cloud (STT)" });
			cloudText.createDiv({ cls: "atlas-whisper-action-desc", text: "OpenAI Whisper API ou similar (paga)" });
			cloudBtn.addEventListener("click", () => {
				new Notice(
					"Cloud STT em breve — por enquanto, configure whisper.cpp local pra full voice. ☁️ STT API will arrive in v0.22.",
					8000
				);
			});
		}

		// Footer: skip + privacy note
		const footer = contentEl.createDiv({ cls: "atlas-whisper-footer" });
		const privacy = footer.createDiv({ cls: "atlas-whisper-privacy" });
		privacy.setText(
			"🔒 Privacidade: whisper.cpp roda 100% local. Nenhum áudio sai da sua máquina."
		);
		const skipBtn = footer.createEl("button", { cls: "atlas-whisper-skip", text: "Pular por agora" });
		skipBtn.addEventListener("click", () => this.close());
	}

	private async refreshStatus(): Promise<void> {
		this.statusEl.empty();
		const detection = await autoDetectWhisper();

		const grid = this.statusEl.createDiv({ cls: "atlas-whisper-status-grid" });

		// Binary status
		const binRow = grid.createDiv({ cls: "atlas-whisper-status-row" });
		binRow.createSpan({
			cls: detection.installed ? "atlas-whisper-status-icon is-ok" : "atlas-whisper-status-icon is-missing",
			text: detection.installed ? "✓" : "✗",
		});
		const binText = binRow.createDiv({ cls: "atlas-whisper-status-text" });
		binText.createDiv({ cls: "atlas-whisper-status-label", text: "Binary whisper.cpp" });
		binText.createDiv({
			cls: "atlas-whisper-status-value",
			text: detection.binaryPath ?? "Não encontrado",
		});

		// Model status
		const modelRow = grid.createDiv({ cls: "atlas-whisper-status-row" });
		const hasModel = Boolean(detection.modelPath);
		modelRow.createSpan({
			cls: hasModel ? "atlas-whisper-status-icon is-ok" : "atlas-whisper-status-icon is-missing",
			text: hasModel ? "✓" : "✗",
		});
		const modelText = modelRow.createDiv({ cls: "atlas-whisper-status-text" });
		modelText.createDiv({ cls: "atlas-whisper-status-label", text: "Modelo (.bin)" });
		modelText.createDiv({
			cls: "atlas-whisper-status-value",
			text: detection.modelPath ?? "Baixe com: bash ~/whisper.cpp/models/download-ggml-model.sh base",
		});

		// Version (if found)
		if (detection.version) {
			const verRow = grid.createDiv({ cls: "atlas-whisper-status-row" });
			verRow.createSpan({ cls: "atlas-whisper-status-icon is-info", text: "ⓘ" });
			const verText = verRow.createDiv({ cls: "atlas-whisper-status-text" });
			verText.createDiv({ cls: "atlas-whisper-status-label", text: "Versão" });
			verText.createDiv({ cls: "atlas-whisper-status-value", text: detection.version });
		}
	}

	private async handleAutoDetect(): Promise<void> {
		const detection = await autoDetectWhisper();
		if (detection.installed && detection.binaryPath) {
			this.plugin.settings.voice.whisperBinaryPath = detection.binaryPath;
			if (detection.modelPath) {
				this.plugin.settings.voice.whisperModelPath = detection.modelPath;
			}
			await this.plugin.saveSettings();
			new Notice(`✓ Atlas: whisper detectado em ${detection.binaryPath}`, 6000);
			void this.refreshStatus();
		} else {
			new Notice(
				"Atlas: whisper.cpp não encontrado. Use 'Instalar via Homebrew' ou consulte docs.",
				8000
			);
			void this.refreshStatus();
		}
	}

	private async handleHomebrewInstall(): Promise<void> {
		const cmd = "brew install whisper-cpp";
		try {
			await navigator.clipboard.writeText(cmd);
		} catch {
			// fallback handled below
		}
		new Notice(
			`📋 Comando copiado: ${cmd}\n\nCole no Terminal pra instalar.\n\nApós instalar, click "Auto-detect agora" pra finalizar.`,
			14000
		);
		this.openTerminal();
	}

	/**
	 * v0.41: download whisper model (.bin) — copies curl command + opens Terminal.
	 *
	 * Cria pasta ~/whisper.cpp/models/ se não existir, baixa ggml-base.bin direto
	 * do Hugging Face (oficial repo whisper.cpp). ~150 MB.
	 */
	private async handleModelDownload(): Promise<void> {
		const platform = process.platform;
		// Same one-line command for mac/linux. Windows users get instruction note.
		const url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin";
		const cmd =
			platform === "win32"
				? `curl.exe -L "${url}" -o "%USERPROFILE%\\whisper.cpp\\models\\ggml-base.bin"`
				: `mkdir -p ~/whisper.cpp/models && curl -L ${url} -o ~/whisper.cpp/models/ggml-base.bin`;

		try {
			await navigator.clipboard.writeText(cmd);
		} catch {
			// fallback below
		}

		new Notice(
			`📋 Comando copiado!\n\nCole no Terminal pra baixar o modelo (~150 MB, leva 1-2 min).\n\nApós baixar, click "Auto-detect agora" pra Atlas encontrar.`,
			16000
		);

		this.openTerminal();
	}

	/** Opens the platform's default terminal app (Terminal.app on macOS, etc). */
	private openTerminal(): void {
		const platform = process.platform;
		const cmd =
			platform === "darwin" ? "open -a Terminal" :
			platform === "win32" ? "start cmd" :
			"x-terminal-emulator || gnome-terminal || konsole || xterm";
		void runShell(cmd, { timeout: 5000 }).catch((err) => {
			logger.warn("whisper-setup: failed to open Terminal", { error: String(err) });
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Helper: open the modal globally (used by event listeners). */
export function openWhisperSetupModal(plugin: AtlasPlugin): void {
	new WhisperSetupModal(plugin.app, plugin).open();
}

// Re-export for convenience
export type { WhisperDetection };
export { installInstructionsFor };
