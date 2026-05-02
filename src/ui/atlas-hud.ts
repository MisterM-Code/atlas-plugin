/**
 * Atlas HUD — overlay flutuante draggable Jarvis-feel.
 *
 * Cmd+Shift+H toggle. Fica dentro do workspace Obsidian (não desktop-wide).
 *
 * Mostra:
 *  - Logo Atlas (40px, breathing)
 *  - Status Ollama (✓ ready | ⚡ thinking | ✗ down)
 *  - Modelo atual + RAM livre
 *  - Última ação (last weekly, last capture, etc)
 *  - Quick action buttons: 🎙️ Falar, 💬 Chat, 🎯 Capture, ⚙️ Settings
 *  - Voice waveform area (live durante recording)
 *
 * Position persistida em localStorage.
 */

import * as os from "os";
import type AtlasPlugin from "../../main";
import { startVoiceRecording, transcribeAudio, VoiceRecordingHandle } from "../automation/voice-input";
import { dispatchVoiceCommand } from "../automation/voice-commands";

const HUD_LOGO_SVG = `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" style="width:100%;height:100%;color:var(--atlas-accent, #6366f1)"><circle cx="50" cy="50" r="38"/><path d="M50 12 L50 88 M12 50 L88 50 M22 22 L78 78 M78 22 L22 78"/></svg>`;

const POSITION_KEY = "atlas-hud-position";

export class AtlasHUD {
	private overlay: HTMLDivElement | null = null;
	private logoEl: HTMLDivElement | null = null;
	private statusEl: HTMLDivElement | null = null;
	private metaEl: HTMLDivElement | null = null;
	private waveformCanvas: HTMLCanvasElement | null = null;
	private recording: VoiceRecordingHandle | null = null;
	private waveformAnimId: number | null = null;
	private statusInterval: number | null = null;

	constructor(private plugin: AtlasPlugin) {}

	isVisible(): boolean {
		return this.overlay !== null && document.body.contains(this.overlay);
	}

	toggle(): void {
		if (this.isVisible()) {
			this.hide();
		} else {
			this.show();
		}
	}

	show(): void {
		if (this.overlay) return;
		const overlay = document.createElement("div");
		overlay.addClass("atlas-hud");
		overlay.style.position = "fixed";
		overlay.style.zIndex = "999";
		overlay.style.minWidth = "280px";
		overlay.style.padding = "12px";
		overlay.style.background = "var(--background-primary)";
		overlay.style.border = "1px solid var(--atlas-accent-soft, rgba(99, 102, 241, 0.2))";
		overlay.style.borderRadius = "var(--atlas-radius-lg, 12px)";
		overlay.style.boxShadow =
			"0 0 0 1px var(--atlas-accent-soft, rgba(99, 102, 241, 0.15)), 0 20px 40px -10px rgba(0, 0, 0, 0.3)";
		overlay.style.backdropFilter = "blur(20px)";
		overlay.style.fontFamily = "var(--font-text)";

		const pos = this.loadPosition();
		overlay.style.top = pos.top;
		overlay.style.left = pos.left;

		// Drag handle (header)
		const header = overlay.createDiv();
		header.style.display = "flex";
		header.style.alignItems = "center";
		header.style.gap = "10px";
		header.style.marginBottom = "10px";
		header.style.cursor = "move";
		header.style.userSelect = "none";

		// Logo
		this.logoEl = header.createDiv() as HTMLDivElement;
		this.logoEl.addClass("atlas-header-logo");
		this.logoEl.style.width = "32px";
		this.logoEl.style.height = "32px";
		// DOM API for SVG (Obsidian no-innerHTML guideline)
		const parser = new DOMParser();
		const svgDoc = parser.parseFromString(HUD_LOGO_SVG, "image/svg+xml");
		if (svgDoc.documentElement && svgDoc.documentElement.nodeName.toLowerCase() === "svg") {
			this.logoEl.appendChild(document.importNode(svgDoc.documentElement, true));
		}

		const titleWrap = header.createDiv();
		titleWrap.style.flexGrow = "1";
		const titleEl = titleWrap.createEl("div", { text: "Atlas HUD" });
		titleEl.style.fontSize = "13px";
		titleEl.style.fontWeight = "bold";
		this.statusEl = titleWrap.createDiv() as HTMLDivElement;
		this.statusEl.style.fontSize = "10px";
		this.statusEl.style.opacity = "0.7";
		this.statusEl.setText("Verificando...");

		const closeBtn = header.createEl("button", { text: "×" });
		closeBtn.style.fontSize = "16px";
		closeBtn.style.padding = "0 6px";
		closeBtn.style.background = "transparent";
		closeBtn.style.border = "none";
		closeBtn.style.cursor = "pointer";
		closeBtn.style.opacity = "0.6";
		closeBtn.addEventListener("click", () => this.hide());

		// Meta info
		this.metaEl = overlay.createDiv() as HTMLDivElement;
		this.metaEl.style.fontSize = "10px";
		this.metaEl.style.opacity = "0.65";
		this.metaEl.style.marginBottom = "10px";
		this.metaEl.style.lineHeight = "1.5";

		// Waveform canvas (escondido até recording)
		this.waveformCanvas = overlay.createEl("canvas") as HTMLCanvasElement;
		this.waveformCanvas.width = 280;
		this.waveformCanvas.height = 40;
		this.waveformCanvas.style.width = "100%";
		this.waveformCanvas.style.height = "40px";
		this.waveformCanvas.style.background = "var(--background-secondary)";
		this.waveformCanvas.style.borderRadius = "var(--atlas-radius-sm, 4px)";
		this.waveformCanvas.style.marginBottom = "10px";
		this.waveformCanvas.style.display = "none";

		// Quick actions
		const actions = overlay.createDiv();
		actions.style.display = "grid";
		actions.style.gridTemplateColumns = "1fr 1fr 1fr 1fr";
		actions.style.gap = "6px";

		const action = (label: string, title: string, onClick: () => void): HTMLButtonElement => {
			const btn = actions.createEl("button", { text: label });
			btn.title = title;
			btn.style.padding = "8px";
			btn.style.fontSize = "16px";
			btn.style.cursor = "pointer";
			btn.style.background = "var(--background-secondary)";
			btn.style.border = "none";
			btn.style.borderRadius = "var(--atlas-radius-sm, 4px)";
			btn.style.transition = "background var(--atlas-transition-fast, 120ms)";
			btn.addEventListener("mouseenter", () => {
				btn.style.background = "var(--background-modifier-hover)";
			});
			btn.addEventListener("mouseleave", () => {
				btn.style.background = "var(--background-secondary)";
			});
			btn.addEventListener("click", onClick);
			return btn;
		};

		const micBtn = action("🎙️", "Falar (Atlas, ...)", () => void this.toggleRecording(micBtn));
		action("💬", "Chat", () => void this.plugin.activateMasterTab("chat"));
		action("🎯", "Quick Capture", () => {
			const apiAny = this.plugin.app as unknown as {
				commands?: { executeCommandById?: (id: string) => void };
			};
			apiAny.commands?.executeCommandById?.("atlas:quick-capture");
		});
		action("⚙️", "Settings", () => {
			const apiAny = this.plugin.app as unknown as {
				setting?: { open: () => void; openTabById: (id: string) => void };
			};
			apiAny.setting?.open();
			apiAny.setting?.openTabById("atlas");
		});

		this.makeDraggable(overlay, header);

		document.body.appendChild(overlay);
		this.overlay = overlay;

		this.updateStatus();
		this.statusInterval = window.setInterval(() => this.updateStatus(), 5000);
	}

	hide(): void {
		if (!this.overlay) return;
		this.cancelRecording();
		if (this.statusInterval !== null) {
			window.clearInterval(this.statusInterval);
			this.statusInterval = null;
		}
		this.overlay.remove();
		this.overlay = null;
		this.logoEl = null;
		this.statusEl = null;
		this.metaEl = null;
		this.waveformCanvas = null;
	}

	private async updateStatus(): Promise<void> {
		if (!this.statusEl || !this.metaEl) return;
		const up = await this.plugin.ollama.ping().catch(() => false);
		const freeGB = (() => {
			try {
				return os.freemem() / 1_073_741_824;
			} catch {
				return 0;
			}
		})();
		const model = this.plugin.settings.ollama.generationModel;
		this.statusEl.setText(up ? "✓ ready" : "✗ Ollama offline");
		this.statusEl.style.color = up ? "var(--color-green)" : "var(--color-red)";
		this.metaEl.setText(`${model} · ${freeGB.toFixed(1)} GB livre`);
	}

	private async toggleRecording(btn: HTMLButtonElement): Promise<void> {
		if (this.recording) {
			// Stop & transcribe
			btn.setText("⏳");
			btn.disabled = true;
			try {
				const result = await this.recording.stop();
				this.stopWaveform();
				this.recording = null;
				if (!result) {
					btn.setText("🎙️");
					btn.disabled = false;
					return;
				}
				const cfg = this.plugin.settings.voice;
				const text = await transcribeAudio(result.tempFile, {
					whisperBinaryPath: cfg.whisperBinaryPath,
					whisperModelPath: cfg.whisperModelPath,
					language: cfg.language ?? "pt",
				});
				if (text.length > 0) {
					const cmd = await dispatchVoiceCommand(this.plugin, text);
					if (cmd.matched) {
						if (cmd.feedback && this.plugin.tts?.configured) {
							void this.plugin.tts.speakNow(cmd.feedback);
						}
					} else {
						// Não tem prefixo "Atlas," → trata como dictation pra chat
						await this.plugin.activateMasterTab("chat");
						const { Notice } = await import("obsidian");
						new Notice(`🎙️ Transcrito: ${text.substring(0, 80)}`);
					}
				}
			} catch (e) {
				const { Notice } = await import("obsidian");
				new Notice(`Atlas voice: ${String(e)}`, 8000);
			} finally {
				btn.setText("🎙️");
				btn.disabled = false;
			}
		} else {
			// Start recording
			try {
				this.recording = await startVoiceRecording();
				btn.setText("⏸️");
				btn.style.background = "var(--color-red)";
				if (this.waveformCanvas) {
					this.waveformCanvas.style.display = "block";
					this.startWaveform();
				}
			} catch (e) {
				const { Notice } = await import("obsidian");
				new Notice(`Atlas: mic não disponível — ${String(e)}`, 8000);
			}
		}
	}

	private cancelRecording(): void {
		if (this.recording) {
			this.recording.cancel();
			this.recording = null;
		}
		this.stopWaveform();
	}

	private startWaveform(): void {
		if (!this.waveformCanvas || !this.recording) return;
		const canvas = this.waveformCanvas;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const draw = () => {
			if (!this.recording || !this.waveformCanvas) return;
			const level = this.recording.getAudioLevel();
			ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			// Shift left
			const shifted = ctx.getImageData(2, 0, canvas.width - 2, canvas.height);
			ctx.putImageData(shifted, 0, 0);
			ctx.fillStyle = "var(--atlas-accent, #6366f1)";
			const accent = getComputedStyle(canvas).getPropertyValue("--atlas-accent").trim() || "#6366f1";
			ctx.fillStyle = accent;
			const h = level * canvas.height;
			ctx.fillRect(canvas.width - 2, (canvas.height - h) / 2, 2, h);
			this.waveformAnimId = requestAnimationFrame(draw);
		};
		draw();
	}

	private stopWaveform(): void {
		if (this.waveformAnimId !== null) {
			cancelAnimationFrame(this.waveformAnimId);
			this.waveformAnimId = null;
		}
		if (this.waveformCanvas) {
			this.waveformCanvas.style.display = "none";
		}
	}

	private makeDraggable(overlay: HTMLDivElement, handle: HTMLDivElement): void {
		let dragging = false;
		let offsetX = 0;
		let offsetY = 0;

		handle.addEventListener("mousedown", (e) => {
			dragging = true;
			const rect = overlay.getBoundingClientRect();
			offsetX = e.clientX - rect.left;
			offsetY = e.clientY - rect.top;
			document.body.style.userSelect = "none";
		});

		document.addEventListener("mousemove", (e) => {
			if (!dragging) return;
			const left = Math.max(0, Math.min(window.innerWidth - 280, e.clientX - offsetX));
			const top = Math.max(0, Math.min(window.innerHeight - 200, e.clientY - offsetY));
			overlay.style.left = `${left}px`;
			overlay.style.top = `${top}px`;
		});

		document.addEventListener("mouseup", () => {
			if (dragging) {
				dragging = false;
				document.body.style.userSelect = "";
				this.savePosition({ left: overlay.style.left, top: overlay.style.top });
			}
		});
	}

	private loadPosition(): { left: string; top: string } {
		try {
			const raw = window.localStorage.getItem(POSITION_KEY);
			if (raw) {
				const p = JSON.parse(raw);
				if (p.left && p.top) return p;
			}
		} catch {
			// noop
		}
		return { left: "20px", top: "80px" };
	}

	private savePosition(pos: { left: string; top: string }): void {
		try {
			window.localStorage.setItem(POSITION_KEY, JSON.stringify(pos));
		} catch {
			// noop
		}
	}
}
