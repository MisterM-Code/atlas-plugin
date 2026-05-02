/**
 * Atlas v0.9 Sprint 28.4 — JarvisOverlay
 *
 * Modal full-screen com orb central animado. Push-to-talk (Space hold).
 * Estados visuais do orb:
 *   - idle:      breathing scale 1.0↔1.04 4s
 *   - listening: waveform circular (RMS do mic)
 *   - thinking:  glow pulsing 1.2s + rotation
 *   - speaking:  pulsa rítmico (5Hz) sincronizado com Piper TTS
 *
 * Diferente do Chat tab — este é COMANDO POR VOZ (action). Chat é busca/conversa.
 *
 * Comandos voz reconhecidos via dispatchVoiceCommand (mesmo registry de Tools).
 */

import { App, Modal, Notice } from "obsidian";
import type AtlasPlugin from "../../main";
import { startVoiceRecording, transcribeAudio, VoiceRecordingHandle } from "../automation/voice-input";
import { dispatchVoiceCommand } from "../automation/voice-commands";
import { logger } from "../utils/logger";

type OrbState = "idle" | "listening" | "thinking" | "speaking";

export class JarvisOverlay extends Modal {
	private orbEl!: HTMLElement;
	private subtitleEl!: HTMLElement;
	private historyEl!: HTMLElement;
	private statusEl!: HTMLElement;
	private hintEl!: HTMLElement;

	private state: OrbState = "idle";
	private recording: VoiceRecordingHandle | null = null;
	private animationFrame = 0;
	private waveformCanvas: HTMLCanvasElement | null = null;
	private speakingHandler: (() => void) | null = null;
	private speakingStopHandler: (() => void) | null = null;

	constructor(app: App, private readonly plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		modalEl.addClass("atlas-jarvis-modal");
		contentEl.empty();

		// Make modal full-screen
		modalEl.style.width = "100vw";
		modalEl.style.height = "100vh";
		modalEl.style.maxWidth = "100vw";
		modalEl.style.maxHeight = "100vh";
		modalEl.style.padding = "0";
		modalEl.style.background = "linear-gradient(135deg, rgba(8,12,20,0.95), rgba(15,20,35,0.97))";
		modalEl.style.backdropFilter = "blur(40px)";
		(modalEl.style as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter = "blur(40px)";
		contentEl.style.height = "100%";
		contentEl.style.display = "flex";
		contentEl.style.flexDirection = "column";
		contentEl.style.alignItems = "center";
		contentEl.style.justifyContent = "center";
		contentEl.style.gap = "24px";
		contentEl.style.padding = "40px";

		// Header
		const header = contentEl.createDiv();
		header.style.position = "absolute";
		header.style.top = "20px";
		header.style.left = "0";
		header.style.right = "0";
		header.style.textAlign = "center";
		header.style.color = "var(--atlas-accent, #6366f1)";
		header.style.fontSize = "14px";
		header.style.letterSpacing = "0.15em";
		header.style.textTransform = "uppercase";
		header.style.opacity = "0.8";
		header.setText("🧠 Atlas Jarvis — fale comigo, eu executo");

		// Subtitle (transcrição live)
		this.subtitleEl = contentEl.createDiv();
		this.subtitleEl.style.position = "absolute";
		this.subtitleEl.style.top = "60px";
		this.subtitleEl.style.fontSize = "12px";
		this.subtitleEl.style.color = "var(--text-muted)";
		this.subtitleEl.style.opacity = "0.6";
		this.subtitleEl.style.maxWidth = "80%";
		this.subtitleEl.style.textAlign = "center";
		this.subtitleEl.setText(
			"Comandos: criar pessoa/sistema/produto/cargo · agendar · trocar perfil · capturar · status · mandar email"
		);

		// Orb central
		const orbWrap = contentEl.createDiv();
		orbWrap.style.position = "relative";
		orbWrap.style.width = "320px";
		orbWrap.style.height = "320px";
		orbWrap.style.display = "flex";
		orbWrap.style.alignItems = "center";
		orbWrap.style.justifyContent = "center";

		// Waveform canvas (atrás do orb)
		this.waveformCanvas = orbWrap.createEl("canvas");
		this.waveformCanvas.width = 320;
		this.waveformCanvas.height = 320;
		this.waveformCanvas.style.position = "absolute";
		this.waveformCanvas.style.inset = "0";
		this.waveformCanvas.style.pointerEvents = "none";

		// Orb (svg ou div com gradiente)
		this.orbEl = orbWrap.createDiv();
		this.orbEl.addClass("atlas-jarvis-orb");
		this.orbEl.style.width = "200px";
		this.orbEl.style.height = "200px";
		this.orbEl.style.borderRadius = "50%";
		this.orbEl.style.background = "radial-gradient(circle at 30% 30%, var(--atlas-accent, #818cf8) 0%, var(--atlas-accent, #6366f1) 40%, #1e1b4b 100%)";
		this.orbEl.style.boxShadow = "0 0 80px var(--atlas-accent-glow, rgba(99,102,241,0.5)), inset 0 0 60px rgba(255,255,255,0.1)";
		this.orbEl.style.cursor = "pointer";
		this.orbEl.style.transition = "transform 200ms ease, box-shadow 200ms ease";
		this.applyOrbState("idle");

		// Hint
		this.hintEl = contentEl.createDiv();
		this.hintEl.style.fontSize = "13px";
		this.hintEl.style.color = "var(--text-muted)";
		this.hintEl.style.textAlign = "center";
		this.hintEl.setText("Segure ESPAÇO pra falar · Click no orb também funciona · Esc fecha");

		// History (últimas 5)
		this.historyEl = contentEl.createDiv();
		this.historyEl.style.position = "absolute";
		this.historyEl.style.bottom = "100px";
		this.historyEl.style.left = "40px";
		this.historyEl.style.right = "40px";
		this.historyEl.style.maxHeight = "180px";
		this.historyEl.style.overflowY = "auto";
		this.historyEl.style.fontSize = "12px";
		this.historyEl.style.color = "var(--text-muted)";

		// Status bar
		this.statusEl = contentEl.createDiv();
		this.statusEl.style.position = "absolute";
		this.statusEl.style.bottom = "20px";
		this.statusEl.style.left = "0";
		this.statusEl.style.right = "0";
		this.statusEl.style.textAlign = "center";
		this.statusEl.style.fontSize = "11px";
		this.statusEl.style.color = "var(--text-faint)";
		this.statusEl.style.opacity = "0.5";
		this.statusEl.setText(
			`modelo: ${this.plugin.settings.ollama.generationModel} · Esc fecha · Cmd+M mute`
		);

		// Wire events
		this.orbEl.addEventListener("mousedown", () => void this.startListening());
		this.orbEl.addEventListener("mouseup", () => void this.stopListening());
		this.orbEl.addEventListener("mouseleave", () => {
			if (this.state === "listening") void this.stopListening();
		});

		// Push-to-talk via Space
		this.scope.register([], "Space", (evt) => {
			evt.preventDefault();
			if (this.state === "idle" && !evt.repeat) {
				void this.startListening();
			}
			return false;
		});

		// Listen for TTS speaking events (Sprint 28.5)
		this.speakingHandler = () => this.applyOrbState("speaking");
		this.speakingStopHandler = () => {
			if (this.state === "speaking") this.applyOrbState("idle");
		};
		document.addEventListener("atlas:tts-start", this.speakingHandler);
		document.addEventListener("atlas:tts-stop", this.speakingStopHandler);

		// Animation loop
		this.startAnimation();
	}

	private async startListening(): Promise<void> {
		if (this.state !== "idle") return;
		try {
			this.recording = await startVoiceRecording();
			this.applyOrbState("listening");
			this.subtitleEl.setText("🎙️ Gravando...");
		} catch (e) {
			new Notice(`Atlas: mic indisponível — ${String(e)}`, 6000);
			this.applyOrbState("idle");
		}
	}

	private async stopListening(): Promise<void> {
		if (this.state !== "listening" || !this.recording) return;
		const handle = this.recording;
		this.recording = null;
		this.applyOrbState("thinking");
		this.subtitleEl.setText("🧠 Processando...");

		try {
			const result = await handle.stop();
			if (!result || !result.tempFile) {
				this.subtitleEl.setText("Nada gravado.");
				this.applyOrbState("idle");
				return;
			}

			// Transcrever via whisper
			let transcript = "";
			try {
				transcript = await transcribeAudio(result.tempFile, {
					whisperBinaryPath: this.plugin.settings.voice?.whisperBinaryPath ?? "",
					whisperModelPath: this.plugin.settings.voice?.whisperModelPath ?? "",
					language: this.plugin.settings.voice?.language ?? "pt",
				});
			} catch (e) {
				logger.warn("jarvis: transcribe falhou", { error: String(e) });
				this.subtitleEl.setText(`❌ ${String(e)}`);
				this.applyOrbState("idle");
				return;
			}

			if (!transcript.trim()) {
				this.subtitleEl.setText("Não consegui ouvir nada.");
				this.applyOrbState("idle");
				return;
			}

			this.appendHistory(`🎙️ Você: ${transcript}`);
			this.subtitleEl.setText(`Você: ${transcript}`);

			// Dispatcher voice command
			const dispatched = await dispatchVoiceCommand(this.plugin, transcript);
			if (dispatched.matched) {
				const fb = dispatched.feedback ?? "OK";
				this.appendHistory(`🧠 Atlas: ${fb}`);
				this.subtitleEl.setText(fb);
				if (this.plugin.tts?.configured) {
					await this.plugin.tts.speakNow(fb);
				}
			} else {
				this.subtitleEl.setText("Comando não começou com 'Atlas, ...'");
				this.applyOrbState("idle");
				return;
			}

			// Volta pra idle ao terminar (a menos que TTS tenha mudado pra speaking)
			if ((this.state as OrbState) !== "speaking") {
				this.applyOrbState("idle");
			}
		} catch (e) {
			logger.error("jarvis: stopListening falhou", { error: String(e) });
			this.subtitleEl.setText(`❌ Erro: ${String(e)}`);
			this.applyOrbState("idle");
		}
	}

	private applyOrbState(state: OrbState): void {
		this.state = state;
		const orb = this.orbEl;
		switch (state) {
			case "idle":
				orb.style.animation = "atlas-orb-breathe 4s ease-in-out infinite";
				orb.style.boxShadow = "0 0 80px var(--atlas-accent-glow, rgba(99,102,241,0.5)), inset 0 0 60px rgba(255,255,255,0.1)";
				break;
			case "listening":
				orb.style.animation = "atlas-orb-listen 1.5s ease-in-out infinite";
				orb.style.boxShadow = "0 0 120px rgba(239,68,68,0.6), inset 0 0 60px rgba(255,255,255,0.2)";
				break;
			case "thinking":
				orb.style.animation = "atlas-orb-think 1.2s linear infinite";
				orb.style.boxShadow = "0 0 100px rgba(251,191,36,0.5), inset 0 0 60px rgba(255,255,255,0.15)";
				break;
			case "speaking":
				orb.style.animation = "atlas-orb-speak 0.2s ease-in-out infinite";
				orb.style.boxShadow = "0 0 100px rgba(34,197,94,0.6), inset 0 0 60px rgba(255,255,255,0.2)";
				break;
		}
	}

	private startAnimation(): void {
		const tick = () => {
			if (this.state === "listening" && this.recording && this.waveformCanvas) {
				this.drawWaveform();
			} else if (this.waveformCanvas) {
				const ctx = this.waveformCanvas.getContext("2d");
				if (ctx) ctx.clearRect(0, 0, this.waveformCanvas.width, this.waveformCanvas.height);
			}
			this.animationFrame = window.requestAnimationFrame(tick);
		};
		this.animationFrame = window.requestAnimationFrame(tick);
	}

	private drawWaveform(): void {
		if (!this.waveformCanvas || !this.recording) return;
		const ctx = this.waveformCanvas.getContext("2d");
		if (!ctx) return;
		const w = this.waveformCanvas.width;
		const h = this.waveformCanvas.height;
		const cx = w / 2;
		const cy = h / 2;
		const baseR = 110;
		const level = this.recording.getAudioLevel();

		ctx.clearRect(0, 0, w, h);
		ctx.strokeStyle = "rgba(239,68,68,0.6)";
		ctx.lineWidth = 2;

		const segments = 64;
		ctx.beginPath();
		for (let i = 0; i < segments; i++) {
			const angle = (i / segments) * Math.PI * 2;
			// Pseudo-random offset based on time + level
			const noise = Math.sin((Date.now() / 200) + i * 0.5) * level * 30;
			const r = baseR + 10 + noise;
			const x = cx + Math.cos(angle) * r;
			const y = cy + Math.sin(angle) * r;
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.closePath();
		ctx.stroke();
	}

	private appendHistory(text: string): void {
		const line = this.historyEl.createDiv();
		line.style.padding = "4px 0";
		line.style.opacity = "0";
		line.style.transition = "opacity 300ms ease";
		line.setText(text);
		// Limitar a 5 linhas
		while (this.historyEl.children.length > 5) {
			this.historyEl.removeChild(this.historyEl.firstChild!);
		}
		setTimeout(() => (line.style.opacity = "0.8"), 10);
	}

	onClose(): void {
		if (this.animationFrame) window.cancelAnimationFrame(this.animationFrame);
		if (this.recording) {
			try {
				this.recording.cancel();
			} catch {
				// ignore
			}
		}
		if (this.speakingHandler) {
			document.removeEventListener("atlas:tts-start", this.speakingHandler);
		}
		if (this.speakingStopHandler) {
			document.removeEventListener("atlas:tts-stop", this.speakingStopHandler);
		}
		this.contentEl.empty();
	}
}
