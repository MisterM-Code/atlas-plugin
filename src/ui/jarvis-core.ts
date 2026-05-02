/**
 * Atlas v0.9.2 — Jarvis Core (shared between sidebar tab + fullscreen overlay)
 *
 * Renders the orb, particles, ripples, transcript, and history.
 * Handles state machine, voice input, voice commands, tool calling, conversation.
 *
 * Design philosophy: Iron Man HUD aesthetic.
 * - Hex grid background
 * - Animated particle network (nodes + connections)
 * - Multi-layer gradient orb with reflective highlight
 * - Concentric ripples emanating during listening/speaking
 * - Scanning line during thinking
 *
 * States: idle | listening | thinking | speaking
 */

import { App, Notice } from "obsidian";
import type AtlasPlugin from "../../main";
import {
	startVoiceRecording,
	transcribeAudio,
	VoiceRecordingHandle,
} from "../automation/voice-input";
import { dispatchVoiceCommand } from "../automation/voice-commands";
import { startWebSpeech, WebSpeechHandle } from "../automation/web-speech";
import { logger } from "../utils/logger";

export type JarvisState = "idle" | "listening" | "thinking" | "speaking";

export interface JarvisCoreOpts {
	mode: "sidebar" | "fullscreen";
	orbSize: number;
	showHistory: boolean;
	showHexGrid: boolean;
	onExpand?: () => void;
	onClose?: () => void;
}

interface ConversationContext {
	pendingTool?: string;
	collectedParams?: Record<string, unknown>;
	missingFields?: { name: string; question: string }[];
}

interface Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	radius: number;
}

export class JarvisCore {
	state: JarvisState = "idle";
	private orbEl!: HTMLElement;
	private orbRingEl!: HTMLElement;
	private subtitleEl!: HTMLElement;
	private historyEl!: HTMLElement;
	private statusEl!: HTMLElement;
	private hintEl!: HTMLElement;
	private particlesCanvas!: HTMLCanvasElement;
	private waveformCanvas!: HTMLCanvasElement;

	private recording: VoiceRecordingHandle | null = null;
	private webSpeech: WebSpeechHandle | null = null;
	private animFrame = 0;
	private particles: Particle[] = [];
	private ripples: { r: number; opacity: number }[] = [];
	private rippleSpawnInterval = 0;

	private convCtx: ConversationContext = {};

	private speakingHandler: () => void;
	private speakingStopHandler: () => void;
	private spaceHandler: ((e: KeyboardEvent) => void) | null = null;
	private spaceUpHandler: ((e: KeyboardEvent) => void) | null = null;

	constructor(
		private readonly app: App,
		private readonly plugin: AtlasPlugin,
		private readonly opts: JarvisCoreOpts
	) {
		this.speakingHandler = () => this.applyState("speaking");
		this.speakingStopHandler = () => {
			if (this.state === "speaking") this.applyState("idle");
		};
	}

	/** Mounts Jarvis UI inside given container. Container should be flex-column. */
	mount(container: HTMLElement): void {
		container.empty();
		container.addClass("atlas-jarvis-root");
		const isFullscreen = this.opts.mode === "fullscreen";
		container.style.position = "relative";
		container.style.width = "100%";
		container.style.height = "100%";
		container.style.display = "flex";
		container.style.flexDirection = "column";
		container.style.alignItems = "center";
		container.style.justifyContent = "center";
		container.style.overflow = "hidden";
		container.style.background = isFullscreen
			? "radial-gradient(ellipse at center, rgba(15,23,42,0.97) 0%, rgba(2,6,23,0.99) 100%)"
			: "linear-gradient(180deg, var(--background-primary), rgba(15,23,42,0.4))";

		// Layer 1: Hex grid (CSS background)
		if (this.opts.showHexGrid) {
			const hexBg = container.createDiv();
			hexBg.style.position = "absolute";
			hexBg.style.inset = "0";
			hexBg.style.opacity = "0.06";
			hexBg.style.backgroundImage = HEX_GRID_DATA_URL;
			hexBg.style.backgroundSize = "32px 32px";
			hexBg.style.pointerEvents = "none";
		}

		// Layer 2: Particles canvas (animated network)
		this.particlesCanvas = container.createEl("canvas");
		this.particlesCanvas.style.position = "absolute";
		this.particlesCanvas.style.inset = "0";
		this.particlesCanvas.style.width = "100%";
		this.particlesCanvas.style.height = "100%";
		this.particlesCanvas.style.pointerEvents = "none";

		// Layer 3: Header
		const header = container.createDiv();
		header.style.position = "absolute";
		header.style.top = isFullscreen ? "20px" : "8px";
		header.style.left = "0";
		header.style.right = "0";
		header.style.padding = "0 16px";
		header.style.display = "flex";
		header.style.justifyContent = "space-between";
		header.style.alignItems = "center";
		header.style.zIndex = "5";

		const titleWrap = header.createDiv();
		titleWrap.style.display = "flex";
		titleWrap.style.alignItems = "center";
		titleWrap.style.gap = "8px";
		const titleDot = titleWrap.createDiv();
		titleDot.style.width = "8px";
		titleDot.style.height = "8px";
		titleDot.style.borderRadius = "50%";
		titleDot.style.background = "#22c55e";
		titleDot.style.boxShadow = "0 0 8px #22c55e";
		titleDot.style.animation = "atlas-pulse-soft 2s ease-in-out infinite";
		const titleText = titleWrap.createDiv();
		titleText.setText("ATLAS · JARVIS");
		titleText.style.fontSize = isFullscreen ? "12px" : "10px";
		titleText.style.fontWeight = "600";
		titleText.style.letterSpacing = "0.2em";
		titleText.style.color = "var(--atlas-accent, #818cf8)";
		titleText.style.fontFamily = "var(--font-monospace)";

		const headerActions = header.createDiv();
		headerActions.style.display = "flex";
		headerActions.style.gap = "8px";

		if (this.opts.onExpand) {
			const expandBtn = headerActions.createEl("button");
			expandBtn.setText("⛶");
			expandBtn.title = "Expandir para tela cheia";
			expandBtn.style.cssText = JARVIS_BTN_CSS;
			expandBtn.addEventListener("click", () => this.opts.onExpand?.());
		}
		if (this.opts.onClose) {
			const closeBtn = headerActions.createEl("button");
			closeBtn.setText("✕");
			closeBtn.title = "Fechar";
			closeBtn.style.cssText = JARVIS_BTN_CSS;
			closeBtn.addEventListener("click", () => this.opts.onClose?.());
		}

		// Layer 4: Orb wrapper (centerpiece)
		const orbStage = container.createDiv();
		orbStage.style.position = "relative";
		orbStage.style.width = `${this.opts.orbSize * 1.6}px`;
		orbStage.style.height = `${this.opts.orbSize * 1.6}px`;
		orbStage.style.display = "flex";
		orbStage.style.alignItems = "center";
		orbStage.style.justifyContent = "center";
		orbStage.style.zIndex = "3";

		// Waveform canvas (atrás do orb)
		this.waveformCanvas = orbStage.createEl("canvas");
		this.waveformCanvas.width = this.opts.orbSize * 1.6;
		this.waveformCanvas.height = this.opts.orbSize * 1.6;
		this.waveformCanvas.style.position = "absolute";
		this.waveformCanvas.style.inset = "0";
		this.waveformCanvas.style.pointerEvents = "none";

		// Outer ring (decorativo)
		this.orbRingEl = orbStage.createDiv();
		this.orbRingEl.addClass("atlas-jarvis-ring");
		this.orbRingEl.style.position = "absolute";
		this.orbRingEl.style.width = `${this.opts.orbSize * 1.4}px`;
		this.orbRingEl.style.height = `${this.opts.orbSize * 1.4}px`;
		this.orbRingEl.style.borderRadius = "50%";
		this.orbRingEl.style.border = "1px solid rgba(129,140,248,0.3)";
		this.orbRingEl.style.boxShadow = "inset 0 0 40px rgba(129,140,248,0.1)";

		// Orb itself (multi-layer gradient + reflection)
		this.orbEl = orbStage.createDiv();
		this.orbEl.addClass("atlas-jarvis-orb-v2");
		this.orbEl.style.position = "relative";
		this.orbEl.style.width = `${this.opts.orbSize}px`;
		this.orbEl.style.height = `${this.opts.orbSize}px`;
		this.orbEl.style.borderRadius = "50%";
		this.orbEl.style.background = ORB_GRADIENT_IDLE;
		this.orbEl.style.boxShadow = ORB_SHADOW_IDLE;
		this.orbEl.style.cursor = "pointer";
		this.orbEl.style.transition = "background 400ms ease, box-shadow 400ms ease";

		// Reflective highlight (top-left)
		const highlight = this.orbEl.createDiv();
		highlight.style.position = "absolute";
		highlight.style.top = "8%";
		highlight.style.left = "12%";
		highlight.style.width = "32%";
		highlight.style.height = "20%";
		highlight.style.borderRadius = "50%";
		highlight.style.background = "radial-gradient(ellipse, rgba(255,255,255,0.45), transparent 70%)";
		highlight.style.pointerEvents = "none";
		highlight.style.filter = "blur(3px)";

		// Inner core glow
		const core = this.orbEl.createDiv();
		core.style.position = "absolute";
		core.style.inset = "20%";
		core.style.borderRadius = "50%";
		core.style.background = "radial-gradient(circle, rgba(165,180,252,0.4), transparent 70%)";
		core.style.pointerEvents = "none";
		core.style.animation = "atlas-jarvis-core-pulse 3s ease-in-out infinite";

		// Subtitle (transcript live)
		this.subtitleEl = container.createDiv();
		this.subtitleEl.style.maxWidth = "85%";
		this.subtitleEl.style.textAlign = "center";
		this.subtitleEl.style.fontSize = isFullscreen ? "14px" : "12px";
		this.subtitleEl.style.color = "rgba(226,232,240,0.85)";
		this.subtitleEl.style.minHeight = "20px";
		this.subtitleEl.style.padding = "12px 16px";
		this.subtitleEl.style.lineHeight = "1.5";
		this.subtitleEl.style.zIndex = "4";
		this.subtitleEl.setText(
			isFullscreen
				? "Comandos: criar pessoa/sistema/produto/cargo · agendar reunião · trocar perfil · capturar tarefa · status · mandar email"
				: "Aguardando comando..."
		);

		// History (last 5 interactions)
		if (this.opts.showHistory) {
			this.historyEl = container.createDiv();
			this.historyEl.style.position = isFullscreen ? "absolute" : "relative";
			if (isFullscreen) {
				this.historyEl.style.bottom = "80px";
				this.historyEl.style.left = "40px";
				this.historyEl.style.right = "40px";
				this.historyEl.style.maxHeight = "180px";
			} else {
				this.historyEl.style.width = "100%";
				this.historyEl.style.maxHeight = "120px";
				this.historyEl.style.padding = "0 16px";
				this.historyEl.style.marginTop = "8px";
			}
			this.historyEl.style.overflowY = "auto";
			this.historyEl.style.fontSize = "11px";
			this.historyEl.style.color = "rgba(148,163,184,0.7)";
			this.historyEl.style.zIndex = "4";
		} else {
			this.historyEl = container.createDiv();
			this.historyEl.style.display = "none";
		}

		// Hint
		this.hintEl = container.createDiv();
		this.hintEl.style.fontSize = "10px";
		this.hintEl.style.color = "rgba(148,163,184,0.5)";
		this.hintEl.style.fontFamily = "var(--font-monospace)";
		this.hintEl.style.letterSpacing = "0.05em";
		this.hintEl.style.padding = "8px 0";
		this.hintEl.style.zIndex = "4";
		this.hintEl.setText("[ SEGURE ESPAÇO • CLICK NO ORB • ESC ]");

		// Status bar
		this.statusEl = container.createDiv();
		this.statusEl.style.position = "absolute";
		this.statusEl.style.bottom = "12px";
		this.statusEl.style.left = "16px";
		this.statusEl.style.right = "16px";
		this.statusEl.style.display = "flex";
		this.statusEl.style.justifyContent = "space-between";
		this.statusEl.style.fontSize = "9px";
		this.statusEl.style.fontFamily = "var(--font-monospace)";
		this.statusEl.style.color = "rgba(148,163,184,0.4)";
		this.statusEl.style.letterSpacing = "0.05em";
		this.statusEl.style.zIndex = "4";
		const stl = this.statusEl.createDiv();
		stl.setText(`MODEL: ${this.plugin.settings.ollama.generationModel.toUpperCase()}`);
		const str = this.statusEl.createDiv();
		const inputMode = this.plugin.settings.voice?.whisperBinaryPath
			? "WHISPER.CPP"
			: "WEB SPEECH API";
		str.setText(`INPUT: ${inputMode}`);

		// Wire events
		this.orbEl.addEventListener("mousedown", (e) => {
			e.preventDefault();
			void this.startListening();
		});
		this.orbEl.addEventListener("mouseup", () => void this.stopListening());
		this.orbEl.addEventListener("mouseleave", () => {
			if (this.state === "listening") void this.stopListening();
		});

		// Push-to-talk via Space
		this.spaceHandler = (e: KeyboardEvent) => {
			if (e.code === "Space" && this.state === "idle" && !e.repeat) {
				const target = e.target as HTMLElement;
				if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
				e.preventDefault();
				void this.startListening();
			}
		};
		this.spaceUpHandler = (e: KeyboardEvent) => {
			if (e.code === "Space" && this.state === "listening") {
				e.preventDefault();
				void this.stopListening();
			}
		};
		document.addEventListener("keydown", this.spaceHandler);
		document.addEventListener("keyup", this.spaceUpHandler);

		// Listen for TTS events
		document.addEventListener("atlas:tts-start", this.speakingHandler);
		document.addEventListener("atlas:tts-stop", this.speakingStopHandler);

		// Init particles
		this.initParticles();
		this.startAnimation();
	}

	private initParticles(): void {
		this.particles = [];
		const count = this.opts.mode === "fullscreen" ? 70 : 35;
		for (let i = 0; i < count; i++) {
			this.particles.push({
				x: Math.random() * this.particlesCanvas.width,
				y: Math.random() * this.particlesCanvas.height,
				vx: (Math.random() - 0.5) * 0.3,
				vy: (Math.random() - 0.5) * 0.3,
				radius: 1 + Math.random() * 1.5,
			});
		}
	}

	private startAnimation(): void {
		const tick = () => {
			this.resizeCanvases();
			this.drawParticles();
			this.drawWaveformOrRipples();
			this.animFrame = window.requestAnimationFrame(tick);
		};
		this.animFrame = window.requestAnimationFrame(tick);
	}

	private resizeCanvases(): void {
		const c = this.particlesCanvas;
		const r = c.parentElement?.getBoundingClientRect();
		if (r && (c.width !== r.width || c.height !== r.height)) {
			c.width = r.width;
			c.height = r.height;
			this.initParticles();
		}
	}

	private drawParticles(): void {
		const ctx = this.particlesCanvas.getContext("2d");
		if (!ctx) return;
		const w = this.particlesCanvas.width;
		const h = this.particlesCanvas.height;
		ctx.clearRect(0, 0, w, h);

		// Move + draw particles
		for (const p of this.particles) {
			p.x += p.vx;
			p.y += p.vy;
			if (p.x < 0 || p.x > w) p.vx *= -1;
			if (p.y < 0 || p.y > h) p.vy *= -1;
			ctx.fillStyle = STATE_COLORS[this.state].particle;
			ctx.beginPath();
			ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
			ctx.fill();
		}

		// Draw connections (within range)
		ctx.strokeStyle = STATE_COLORS[this.state].line;
		ctx.lineWidth = 0.5;
		const maxDist = 90;
		for (let i = 0; i < this.particles.length; i++) {
			for (let j = i + 1; j < this.particles.length; j++) {
				const a = this.particles[i];
				const b = this.particles[j];
				const dx = a.x - b.x;
				const dy = a.y - b.y;
				const d = Math.sqrt(dx * dx + dy * dy);
				if (d < maxDist) {
					ctx.globalAlpha = (1 - d / maxDist) * 0.4;
					ctx.beginPath();
					ctx.moveTo(a.x, a.y);
					ctx.lineTo(b.x, b.y);
					ctx.stroke();
				}
			}
		}
		ctx.globalAlpha = 1;
	}

	private drawWaveformOrRipples(): void {
		const ctx = this.waveformCanvas.getContext("2d");
		if (!ctx) return;
		const w = this.waveformCanvas.width;
		const h = this.waveformCanvas.height;
		const cx = w / 2;
		const cy = h / 2;
		ctx.clearRect(0, 0, w, h);

		// Spawn ripples during speaking/listening
		this.rippleSpawnInterval++;
		if (
			(this.state === "speaking" || this.state === "listening") &&
			this.rippleSpawnInterval > 25
		) {
			this.ripples.push({ r: this.opts.orbSize / 2, opacity: 0.7 });
			this.rippleSpawnInterval = 0;
		}

		// Render + decay ripples
		this.ripples = this.ripples
			.map((r) => ({ r: r.r + 1.5, opacity: r.opacity - 0.012 }))
			.filter((r) => r.opacity > 0);

		const baseColor = STATE_COLORS[this.state].ripple;
		for (const ripple of this.ripples) {
			ctx.strokeStyle = `rgba(${baseColor},${ripple.opacity})`;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(cx, cy, ripple.r, 0, Math.PI * 2);
			ctx.stroke();
		}

		// Live waveform during listening
		if (this.state === "listening" && this.recording) {
			const level = this.recording.getAudioLevel();
			ctx.strokeStyle = `rgba(${STATE_COLORS.listening.ripple},0.6)`;
			ctx.lineWidth = 2;
			ctx.beginPath();
			const segs = 96;
			const baseR = this.opts.orbSize * 0.62;
			for (let i = 0; i < segs; i++) {
				const ang = (i / segs) * Math.PI * 2;
				const noise = Math.sin(Date.now() / 150 + i * 0.5) * level * 35;
				const r = baseR + 8 + noise;
				const x = cx + Math.cos(ang) * r;
				const y = cy + Math.sin(ang) * r;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.closePath();
			ctx.stroke();
		}

		// Scanning line during thinking
		if (this.state === "thinking") {
			const t = (Date.now() / 1000) % 2; // 0..2
			const ang = (t / 2) * Math.PI * 2;
			ctx.strokeStyle = `rgba(${STATE_COLORS.thinking.ripple},0.7)`;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(cx, cy);
			ctx.lineTo(cx + Math.cos(ang) * (this.opts.orbSize * 0.85), cy + Math.sin(ang) * (this.opts.orbSize * 0.85));
			ctx.stroke();
		}
	}

	applyState(state: JarvisState): void {
		this.state = state;
		const colors = STATE_COLORS[state];
		this.orbEl.style.background = colors.gradient;
		this.orbEl.style.boxShadow = colors.shadow;
		this.orbRingEl.style.borderColor = colors.ringBorder;
		switch (state) {
			case "idle":
				this.orbEl.style.animation = "atlas-jarvis-breathe 4s ease-in-out infinite";
				break;
			case "listening":
				this.orbEl.style.animation = "atlas-jarvis-listen 1.4s ease-in-out infinite";
				break;
			case "thinking":
				this.orbEl.style.animation = "atlas-jarvis-think 1.2s linear infinite";
				break;
			case "speaking":
				this.orbEl.style.animation = "atlas-jarvis-speak 0.25s ease-in-out infinite";
				break;
		}
	}

	private async startListening(): Promise<void> {
		if (this.state !== "idle") return;

		const useWhisper = !!this.plugin.settings.voice?.whisperBinaryPath;

		try {
			if (useWhisper) {
				this.recording = await startVoiceRecording();
				this.applyState("listening");
				this.subtitleEl.setText("🎙️ Ouvindo...");
			} else {
				// Web Speech API fallback (zero config, browser-native)
				this.webSpeech = startWebSpeech({
					language: this.plugin.settings.voice?.language ?? "pt-BR",
					onPartial: (txt) => {
						this.subtitleEl.setText(`🎙️ ${txt}…`);
					},
					onFinal: (txt) => {
						this.subtitleEl.setText(`🎙️ ${txt}`);
						void this.processTranscript(txt);
					},
					onError: (err) => {
						new Notice(`Atlas Jarvis: ${err}`, 6000);
						this.applyState("idle");
					},
				});
				this.applyState("listening");
				this.subtitleEl.setText("🎙️ Ouvindo (Web Speech)...");
			}
		} catch (e) {
			new Notice(`Atlas Jarvis: mic indisponível — ${String(e)}`, 6000);
			this.applyState("idle");
		}
	}

	private async stopListening(): Promise<void> {
		if (this.state !== "listening") return;

		// Web Speech path
		if (this.webSpeech) {
			this.webSpeech.stop();
			this.webSpeech = null;
			// Final result handled by onFinal callback above
			return;
		}

		// Whisper.cpp path
		if (!this.recording) return;
		const handle = this.recording;
		this.recording = null;
		this.applyState("thinking");
		this.subtitleEl.setText("🧠 Transcrevendo...");

		try {
			const result = await handle.stop();
			if (!result?.tempFile) {
				this.subtitleEl.setText("Nada gravado.");
				this.applyState("idle");
				return;
			}
			const transcript = await transcribeAudio(result.tempFile, {
				whisperBinaryPath: this.plugin.settings.voice?.whisperBinaryPath ?? "",
				whisperModelPath: this.plugin.settings.voice?.whisperModelPath ?? "",
				language: this.plugin.settings.voice?.language ?? "pt",
			});
			if (!transcript.trim()) {
				this.subtitleEl.setText("Não consegui ouvir nada.");
				this.applyState("idle");
				return;
			}
			await this.processTranscript(transcript.trim());
		} catch (e) {
			logger.error("jarvis: transcribe falhou", { error: String(e) });
			this.subtitleEl.setText(`❌ ${String(e).substring(0, 80)}`);
			this.applyState("idle");
		}
	}

	private async processTranscript(transcript: string): Promise<void> {
		this.applyState("thinking");
		this.appendHistory(`🎙️ ${transcript}`);
		this.subtitleEl.setText(`Você: ${transcript}`);

		// If conversation pending (waiting for missing field), continue
		if (this.convCtx.pendingTool && this.convCtx.missingFields?.length) {
			await this.continueConversation(transcript);
			return;
		}

		// Else: dispatch as new voice command
		try {
			const dispatched = await dispatchVoiceCommand(this.plugin, transcript);

			// v0.9.2 Sprint 32.4: partial intent → start conversation (Jarvis asks)
			if (dispatched.needsFollowUp) {
				const f = dispatched.needsFollowUp;
				await this.startToolConversation(f.tool, f.params, f.fieldsToAsk);
				return;
			}

			if (dispatched.matched) {
				const fb = dispatched.feedback ?? "OK";
				this.appendHistory(`🤖 ${fb}`);
				this.subtitleEl.setText(fb);
				this.applyState("speaking");
				if (this.plugin.tts?.configured) {
					await this.plugin.tts.speakNow(fb).catch(() => undefined);
				}
				if ((this.state as JarvisState) !== "speaking") this.applyState("idle");
				else setTimeout(() => this.applyState("idle"), 600);
			} else {
				this.subtitleEl.setText("Comando deve começar com 'Atlas, ...'");
				this.applyState("idle");
			}
		} catch (e) {
			logger.error("jarvis: dispatch falhou", { error: String(e) });
			this.subtitleEl.setText(`❌ ${String(e).substring(0, 80)}`);
			this.applyState("idle");
		}
	}

	/** Continue stateful conversation: user is providing a missing field. */
	private async continueConversation(answer: string): Promise<void> {
		const ctx = this.convCtx;
		if (!ctx.pendingTool || !ctx.missingFields || ctx.missingFields.length === 0) {
			this.convCtx = {};
			return;
		}
		const next = ctx.missingFields.shift()!;
		ctx.collectedParams = { ...ctx.collectedParams, [next.name]: answer };

		// More fields needed?
		if (ctx.missingFields.length > 0) {
			const q = ctx.missingFields[0].question;
			this.appendHistory(`🤖 ${q}`);
			this.subtitleEl.setText(q);
			this.applyState("speaking");
			if (this.plugin.tts?.configured) {
				await this.plugin.tts.speakNow(q).catch(() => undefined);
			}
			setTimeout(() => this.applyState("idle"), 400);
			return;
		}

		// All fields collected → execute tool
		const toolMod = await import("../agent/tool-registry");
		const result = await toolMod.executeTool(
			ctx.pendingTool,
			ctx.collectedParams ?? {},
			this.plugin
		);
		const msg = result.message;
		this.appendHistory(`🤖 ${msg}`);
		this.subtitleEl.setText(msg);
		this.applyState("speaking");
		if (this.plugin.tts?.configured) {
			await this.plugin.tts.speakNow(msg).catch(() => undefined);
		}
		setTimeout(() => this.applyState("idle"), 600);
		this.convCtx = {};
	}

	/** Public API: start a conversational tool call (Jarvis asks for missing fields). */
	async startToolConversation(
		toolName: string,
		initialParams: Record<string, unknown>,
		fieldsToAsk: { name: string; question: string }[]
	): Promise<void> {
		this.convCtx = {
			pendingTool: toolName,
			collectedParams: { ...initialParams },
			missingFields: [...fieldsToAsk],
		};
		const first = fieldsToAsk[0];
		this.appendHistory(`🤖 ${first.question}`);
		this.subtitleEl.setText(first.question);
		this.applyState("speaking");
		if (this.plugin.tts?.configured) {
			await this.plugin.tts.speakNow(first.question).catch(() => undefined);
		}
		setTimeout(() => this.applyState("idle"), 400);
	}

	private appendHistory(text: string): void {
		if (!this.historyEl) return;
		const line = this.historyEl.createDiv();
		line.style.padding = "3px 0";
		line.style.opacity = "0";
		line.style.transition = "opacity 280ms ease, transform 280ms ease";
		line.style.transform = "translateY(4px)";
		line.setText(text);
		while (this.historyEl.children.length > 6) {
			this.historyEl.removeChild(this.historyEl.firstChild!);
		}
		setTimeout(() => {
			line.style.opacity = "0.85";
			line.style.transform = "translateY(0)";
		}, 10);
	}

	destroy(): void {
		if (this.animFrame) window.cancelAnimationFrame(this.animFrame);
		if (this.recording) {
			try {
				this.recording.cancel();
			} catch {
				// ignore
			}
		}
		if (this.webSpeech) {
			try {
				this.webSpeech.stop();
			} catch {
				// ignore
			}
		}
		document.removeEventListener("atlas:tts-start", this.speakingHandler);
		document.removeEventListener("atlas:tts-stop", this.speakingStopHandler);
		if (this.spaceHandler) document.removeEventListener("keydown", this.spaceHandler);
		if (this.spaceUpHandler) document.removeEventListener("keyup", this.spaceUpHandler);
	}
}

// ─────────────────────────────────────────────────────
// Constants

const HEX_GRID_DATA_URL =
	"url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><polygon points='16,2 30,10 30,22 16,30 2,22 2,10' fill='none' stroke='%23818cf8' stroke-width='0.5'/></svg>\")";

const ORB_GRADIENT_IDLE =
	"radial-gradient(circle at 32% 28%, #c7d2fe 0%, #818cf8 30%, #4f46e5 65%, #1e1b4b 100%)";
const ORB_SHADOW_IDLE =
	"0 0 60px rgba(99,102,241,0.55), 0 0 120px rgba(99,102,241,0.3), inset 0 0 80px rgba(255,255,255,0.08)";

const STATE_COLORS: Record<JarvisState, {
	gradient: string;
	shadow: string;
	ringBorder: string;
	particle: string;
	line: string;
	ripple: string;
}> = {
	idle: {
		gradient: ORB_GRADIENT_IDLE,
		shadow: ORB_SHADOW_IDLE,
		ringBorder: "rgba(129,140,248,0.3)",
		particle: "rgba(165,180,252,0.5)",
		line: "rgba(99,102,241,0.35)",
		ripple: "129,140,248",
	},
	listening: {
		gradient: "radial-gradient(circle at 32% 28%, #fecaca 0%, #f87171 30%, #dc2626 65%, #450a0a 100%)",
		shadow: "0 0 80px rgba(239,68,68,0.7), 0 0 160px rgba(239,68,68,0.4), inset 0 0 80px rgba(255,255,255,0.12)",
		ringBorder: "rgba(248,113,113,0.55)",
		particle: "rgba(252,165,165,0.55)",
		line: "rgba(239,68,68,0.4)",
		ripple: "248,113,113",
	},
	thinking: {
		gradient: "radial-gradient(circle at 32% 28%, #fde68a 0%, #fbbf24 30%, #d97706 65%, #451a03 100%)",
		shadow: "0 0 80px rgba(251,191,36,0.65), 0 0 160px rgba(251,191,36,0.35), inset 0 0 80px rgba(255,255,255,0.1)",
		ringBorder: "rgba(251,191,36,0.5)",
		particle: "rgba(253,224,71,0.5)",
		line: "rgba(251,191,36,0.35)",
		ripple: "251,191,36",
	},
	speaking: {
		gradient: "radial-gradient(circle at 32% 28%, #bbf7d0 0%, #4ade80 30%, #16a34a 65%, #052e16 100%)",
		shadow: "0 0 80px rgba(34,197,94,0.7), 0 0 160px rgba(34,197,94,0.4), inset 0 0 80px rgba(255,255,255,0.12)",
		ringBorder: "rgba(74,222,128,0.55)",
		particle: "rgba(187,247,208,0.55)",
		line: "rgba(34,197,94,0.4)",
		ripple: "74,222,128",
	},
};

const JARVIS_BTN_CSS = `
	background: rgba(15,23,42,0.6);
	color: rgba(226,232,240,0.8);
	border: 1px solid rgba(129,140,248,0.3);
	border-radius: 4px;
	width: 28px;
	height: 28px;
	font-size: 14px;
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 160ms ease;
`;
