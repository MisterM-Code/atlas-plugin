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
import * as os from "os";
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

type ParticleLayer = 0 | 1 | 2; // 0=back (blur), 1=mid, 2=front (sharp+bright)

interface Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	radius: number;
	layer: ParticleLayer;
	baseAlpha: number;
	pulsePhase: number; // 0..2π, individual flicker
	life: number; // 0..1, dies at 0 (absorbed by orb or off-screen)
	flowMode: "inflow" | "orbital"; // inflow = streaming toward orb; orbital = ring around orb
	orbitalAngle: number; // for orbital mode
	orbitalRadius: number; // for orbital mode
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
	private readoutsEl: HTMLElement | null = null;

	private recording: VoiceRecordingHandle | null = null;
	private webSpeech: WebSpeechHandle | null = null;
	private animFrame = 0;
	private readoutsTimer: number | null = null;
	private particles: Particle[] = [];
	private ripples: { r: number; opacity: number }[] = [];
	private rippleSpawnInterval = 0;

	private convCtx: ConversationContext = {};

	private readonly speakingHandler: () => void;
	private readonly speakingStopHandler: () => void;
	private readonly whisperConfigPromptHandler: (e: Event) => void;
	private spaceHandler: ((e: KeyboardEvent) => void) | null = null;
	private spaceUpHandler: ((e: KeyboardEvent) => void) | null = null;
	private whisperPromptShown = false;

	constructor(
		private readonly app: App,
		private readonly plugin: AtlasPlugin,
		private readonly opts: JarvisCoreOpts
	) {
		this.speakingHandler = () => this.applyState("speaking");
		this.speakingStopHandler = () => {
			if (this.state === "speaking") this.applyState("idle");
		};
		this.whisperConfigPromptHandler = () => {
			if (this.whisperPromptShown) return;
			this.whisperPromptShown = true;
			void this.showWhisperConfigPrompt();
		};
	}

	private async showWhisperConfigPrompt(): Promise<void> {
		// Reuse confirmAsync helper for offline auto-prompt
		try {
			const { confirmAsync } = await import("./confirm-modal");
			const message = [
				"O Web Speech API precisa de internet (Google API).",
				"Para usar voz 100% offline, configure o whisper.cpp em Settings → Voice.",
				"Quer abrir Settings agora?",
			].join("\n\n");
			const ok = await confirmAsync(this.app, message, {
				title: "🎙️ Voice offline indisponível",
				yesLabel: "Abrir Settings",
				noLabel: "Mais tarde",
			});
			if (ok) {
				const apiAny = this.app as unknown as {
					setting?: { open?: () => void; openTabById?: (id: string) => void };
				};
				apiAny.setting?.open?.();
				apiAny.setting?.openTabById?.("atlas");
			}
		} catch {
			// modal helper missing — silent fallback
		}
	}

	/** Mounts Jarvis UI inside given container. Container should be flex-column. */
	mount(container: HTMLElement): void {
		container.empty();
		const isFullscreen = this.opts.mode === "fullscreen";
		const modeClass = isFullscreen ? "is-fullscreen" : "is-sidebar";
		container.addClass("atlas-jarvis-container");
		container.addClass(modeClass);

		// Layer 1: Hex grid (CSS background)
		if (this.opts.showHexGrid) {
			const hexBg = container.createDiv({ cls: "atlas-jarvis-hex-bg" });
			hexBg.style.setProperty("background-image", HEX_GRID_DATA_URL);
		}

		// Layer 2: Particles canvas (animated network)
		this.particlesCanvas = container.createEl("canvas", { cls: "atlas-jarvis-particles" });

		// Layer 3: Header
		const header = container.createDiv({ cls: `atlas-jarvis-header ${modeClass}` });

		const titleWrap = header.createDiv({ cls: "atlas-jarvis-title-wrap" });
		titleWrap.createDiv({ cls: "atlas-jarvis-title-dot" });
		titleWrap.createDiv({ cls: `atlas-jarvis-title-text ${modeClass}`, text: "ATLAS · JARVIS" });

		const headerActions = header.createDiv({ cls: "atlas-jarvis-header-actions" });
		if (this.opts.onExpand) {
			const expandBtn = headerActions.createEl("button", { cls: "atlas-jarvis-btn", text: "⛶" });
			expandBtn.title = "Expandir para tela cheia";
			expandBtn.addEventListener("click", () => this.opts.onExpand?.());
		}
		if (this.opts.onClose) {
			const closeBtn = headerActions.createEl("button", { cls: "atlas-jarvis-btn", text: "✕" });
			closeBtn.title = "Fechar";
			closeBtn.addEventListener("click", () => this.opts.onClose?.());
		}

		// Layer 4: Orb stage (centerpiece) — sizes still inline since dynamic per opts.orbSize
		const orbStage = container.createDiv({ cls: "atlas-jarvis-orb-stage" });
		const stageDim = `${this.opts.orbSize * 1.6}px`;
		orbStage.style.setProperty("width", stageDim);
		orbStage.style.setProperty("height", stageDim);

		// Waveform canvas (atrás do orb)
		this.waveformCanvas = orbStage.createEl("canvas", { cls: "atlas-jarvis-waveform" });
		this.waveformCanvas.width = this.opts.orbSize * 1.6;
		this.waveformCanvas.height = this.opts.orbSize * 1.6;

		// v0.20 — JARVIS HUD v3: orb totalmente reconstruído com camadas sci-fi
		// Outer rotating ring com tick marks (decorativo)
		this.orbRingEl = orbStage.createDiv({ cls: "atlas-jarvis-ring" });
		const ringDim = `${this.opts.orbSize * 1.55}px`;
		this.orbRingEl.style.setProperty("width", ringDim);
		this.orbRingEl.style.setProperty("height", ringDim);
		// Renderizar tick marks no ring (12 ticks)
		for (let i = 0; i < 12; i++) {
			const tick = this.orbRingEl.createDiv({ cls: "atlas-jarvis-ring-tick" });
			tick.style.transform = `rotate(${i * 30}deg) translateY(-${this.opts.orbSize * 0.775}px)`;
		}

		// Inner ring contra-rotativo
		const innerRing = orbStage.createDiv({ cls: "atlas-jarvis-ring-inner" });
		const innerDim = `${this.opts.orbSize * 1.22}px`;
		innerRing.style.setProperty("width", innerDim);
		innerRing.style.setProperty("height", innerDim);

		// 8 Energy nodes em torno do orb (perímetro)
		const nodesRing = orbStage.createDiv({ cls: "atlas-jarvis-energy-nodes" });
		nodesRing.style.setProperty("width", `${this.opts.orbSize * 1.1}px`);
		nodesRing.style.setProperty("height", `${this.opts.orbSize * 1.1}px`);
		for (let i = 0; i < 8; i++) {
			const node = nodesRing.createDiv({ cls: "atlas-jarvis-energy-node" });
			node.style.transform = `rotate(${i * 45}deg) translateY(-${this.opts.orbSize * 0.55}px)`;
			node.style.animationDelay = `${i * 0.15}s`;
		}

		// Orb — agora multi-layer
		this.orbEl = orbStage.createDiv({ cls: "atlas-jarvis-orb-v2" });
		const orbDim = `${this.opts.orbSize}px`;
		this.orbEl.style.setProperty("width", orbDim);
		this.orbEl.style.setProperty("height", orbDim);
		this.orbEl.style.setProperty("background", ORB_GRADIENT_IDLE);
		this.orbEl.style.setProperty("box-shadow", ORB_SHADOW_IDLE);

		// Hex pattern overlay (rotating slow)
		this.orbEl.createDiv({ cls: "atlas-jarvis-orb-hex" });
		// Reflective highlight (top glow)
		this.orbEl.createDiv({ cls: "atlas-jarvis-orb-highlight" });
		// Inner ARC reactor — 3 anéis concêntricos + center dot
		const arcReactor = this.orbEl.createDiv({ cls: "atlas-jarvis-arc-reactor" });
		arcReactor.createDiv({ cls: "atlas-jarvis-arc-ring atlas-jarvis-arc-ring-1" });
		arcReactor.createDiv({ cls: "atlas-jarvis-arc-ring atlas-jarvis-arc-ring-2" });
		arcReactor.createDiv({ cls: "atlas-jarvis-arc-ring atlas-jarvis-arc-ring-3" });
		arcReactor.createDiv({ cls: "atlas-jarvis-arc-center" });
		// Inner core pulse (legacy mantém)
		this.orbEl.createDiv({ cls: "atlas-jarvis-orb-core" });

		// HUD frame: 4 corner brackets + scan line (apenas fullscreen)
		if (isFullscreen) {
			const frame = container.createDiv({ cls: "atlas-jarvis-hud-frame" });
			frame.createDiv({ cls: "atlas-jarvis-hud-corner is-tl" });
			frame.createDiv({ cls: "atlas-jarvis-hud-corner is-tr" });
			frame.createDiv({ cls: "atlas-jarvis-hud-corner is-bl" });
			frame.createDiv({ cls: "atlas-jarvis-hud-corner is-br" });
			frame.createDiv({ cls: "atlas-jarvis-hud-scanline" });
		}

		// Data readouts JARVIS-style (apenas fullscreen — sidebar é compacto demais)
		if (isFullscreen) {
			this.readoutsEl = container.createDiv({ cls: "atlas-jarvis-readouts" });
			this.updateReadouts();
		}

		// Subtitle (transcript live)
		this.subtitleEl = container.createDiv({ cls: `atlas-jarvis-subtitle ${modeClass}` });
		this.subtitleEl.setText(
			isFullscreen
				? "Comandos: criar pessoa/sistema/produto/cargo · agendar reunião · trocar perfil · capturar tarefa · status · mandar email"
				: "Aguardando comando..."
		);

		// History (last 5 interactions)
		if (this.opts.showHistory) {
			this.historyEl = container.createDiv({ cls: `atlas-jarvis-history ${modeClass}` });
		} else {
			this.historyEl = container.createDiv({ cls: "atlas-jarvis-history is-hidden" });
			this.historyEl.style.setProperty("display", "none");
		}

		// Hint
		this.hintEl = container.createDiv({ cls: "atlas-jarvis-hint" });
		this.hintEl.setText("[ SEGURE ESPAÇO • CLICK NO ORB • ESC ]");

		// Status bar
		this.statusEl = container.createDiv({ cls: "atlas-jarvis-status" });
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
		document.addEventListener("atlas:voice-needs-whisper-config", this.whisperConfigPromptHandler);

		// Init particles
		this.initParticles();
		this.startAnimation();

		// v0.20: refresh readouts a cada 5s (KG counts mudam ao longo da sessão)
		if (this.readoutsEl) {
			this.readoutsTimer = window.setInterval(() => this.updateReadouts(), 5000);
		}
	}

	private initParticles(): void {
		this.particles = [];
		const isFullscreen = this.opts.mode === "fullscreen";
		const total = isFullscreen ? 200 : 150;
		// Spawn initial population — mistura inflow + orbital
		for (let i = 0; i < total; i++) {
			this.particles.push(this.spawnParticle(i % 5 === 0 ? "orbital" : "inflow"));
		}
	}

	/** v0.20: Spawn a particle. inflow = nasce nas bordas e flui pro orb. orbital = circula em volta. */
	private spawnParticle(mode: "inflow" | "orbital" = "inflow"): Particle {
		const w = this.particlesCanvas.width || 800;
		const h = this.particlesCanvas.height || 600;
		const cx = w / 2;
		const cy = h / 2;
		const layer = (Math.random() < 0.4 ? 0 : Math.random() < 0.7 ? 1 : 2) as ParticleLayer;
		const SIZE_MUL = [0.7, 1.2, 1.9];
		const ALPHA_BASE = [0.28, 0.62, 0.95];

		if (mode === "orbital") {
			// Orbital particle: circula a uma distância do orb
			const orbR = this.opts.orbSize * (0.85 + Math.random() * 0.6);
			const angle = Math.random() * Math.PI * 2;
			return {
				x: cx + Math.cos(angle) * orbR,
				y: cy + Math.sin(angle) * orbR,
				vx: 0, vy: 0, // velocity computed from angle in update
				radius: (0.5 + Math.random() * 0.9) * SIZE_MUL[layer],
				layer,
				baseAlpha: ALPHA_BASE[layer],
				pulsePhase: Math.random() * Math.PI * 2,
				life: 1,
				flowMode: "orbital",
				orbitalAngle: angle,
				orbitalRadius: orbR,
			};
		}

		// Inflow particle: spawn nas bordas, fluxo pra orb
		// Edge picker: 0=top, 1=right, 2=bottom, 3=left
		const edge = Math.floor(Math.random() * 4);
		let x = 0;
		let y = 0;
		switch (edge) {
			case 0: x = Math.random() * w; y = -10; break;
			case 1: x = w + 10; y = Math.random() * h; break;
			case 2: x = Math.random() * w; y = h + 10; break;
			default: x = -10; y = Math.random() * h; break;
		}

		// Velocity vector pointing toward center (with slight perpendicular jitter)
		const dx = cx - x;
		const dy = cy - y;
		const dist = Math.sqrt(dx * dx + dy * dy);
		const speedBase = 0.3 + Math.random() * 0.4;
		// Perpendicular component for elegant curve (não reta direta)
		const perpX = -dy / dist;
		const perpY = dx / dist;
		const perpAmount = (Math.random() - 0.5) * 0.6;

		return {
			x, y,
			vx: (dx / dist) * speedBase + perpX * perpAmount,
			vy: (dy / dist) * speedBase + perpY * perpAmount,
			radius: (0.5 + Math.random() * 1.2) * SIZE_MUL[layer],
			layer,
			baseAlpha: ALPHA_BASE[layer],
			pulsePhase: Math.random() * Math.PI * 2,
			life: 1,
			flowMode: "inflow",
			orbitalAngle: 0,
			orbitalRadius: 0,
		};
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

		// Trails effect: paint semi-transparent black instead of clearing
		// → particles leave decaying ghost trail (Iron Man HUD signature)
		ctx.fillStyle = "rgba(2, 6, 23, 0.18)";
		ctx.fillRect(0, 0, w, h);

		const colors = STATE_COLORS[this.state];
		const cx = w / 2;
		const cy = h / 2;
		const orbitalRadius = this.opts.orbSize * 1.3; // particles within this orbit the orb
		const orbitalRadiusSq = orbitalRadius * orbitalRadius;
		const now = Date.now() / 800;

		const motionCtx: MotionCtx = {
			cx,
			cy,
			orbitalRadius,
			orbitalRadiusSq,
			activityMul: ACTIVITY_MUL[this.state],
			w,
			h,
		};

		// Move + draw particles (back to front for proper layering)
		for (const p of this.particles) {
			this.updateParticlePosition(p, motionCtx);
			this.renderParticle(ctx, p, colors, now);
		}
		ctx.shadowBlur = 0;

		// Connections only between mid+front particles for performance + cleaner look
		const linkable = this.particles.filter((p) => p.layer >= 1);
		ctx.strokeStyle = colors.line;
		ctx.lineWidth = 0.5;
		const maxDist = this.opts.mode === "fullscreen" ? 110 : 85;
		const maxDistSq = maxDist * maxDist;
		for (let i = 0; i < linkable.length; i++) {
			for (let j = i + 1; j < linkable.length; j++) {
				const a = linkable[i];
				const b = linkable[j];
				const dx = a.x - b.x;
				const dy = a.y - b.y;
				const dSq = dx * dx + dy * dy;
				if (dSq < maxDistSq) {
					const d = Math.sqrt(dSq);
					ctx.globalAlpha = (1 - d / maxDist) * 0.35;
					ctx.beginPath();
					ctx.moveTo(a.x, a.y);
					ctx.lineTo(b.x, b.y);
					ctx.stroke();
				}
			}
		}
		ctx.globalAlpha = 1;
	}

	private updateParticlePosition(p: Particle, m: MotionCtx): void {
		if (p.flowMode === "orbital") {
			// Orbital: circula em volta do orb, velocidade angular varia com state
			const orbitalSpeed = 0.008 * m.activityMul;
			p.orbitalAngle += orbitalSpeed;
			p.x = m.cx + Math.cos(p.orbitalAngle) * p.orbitalRadius;
			p.y = m.cy + Math.sin(p.orbitalAngle) * p.orbitalRadius;
			// Slight orbital radius oscillation for organic feel
			p.orbitalRadius += Math.sin(p.orbitalAngle * 3) * 0.05;
			return;
		}

		// Inflow: flui nas bordas pro orb. Quanto mais perto, mais rápido (gravity-ish).
		const dxc = m.cx - p.x;
		const dyc = m.cy - p.y;
		const dSq = dxc * dxc + dyc * dyc;
		const dist = Math.sqrt(dSq);

		// Atração gravitacional pro orb (mais forte quando próximo)
		const orbRadius = this.opts.orbSize * 0.5;
		if (dist < orbRadius * 1.2) {
			// Absorvido pelo orb — life vai pra 0
			p.life -= 0.06;
			if (p.life <= 0) {
				// Re-spawn — recicla particle pra evitar GC pressure
				const fresh = this.spawnParticle(Math.random() < 0.2 ? "orbital" : "inflow");
				Object.assign(p, fresh);
				return;
			}
		} else {
			// Acelera em direção ao orb (gravidade leve)
			const pull = 0.012 * m.activityMul;
			p.vx += (dxc / dist) * pull;
			p.vy += (dyc / dist) * pull;
		}

		// Damping pra não acumular velocidade infinita
		p.vx *= 0.985;
		p.vy *= 0.985;

		// Update position
		p.x += p.vx * m.activityMul;
		p.y += p.vy * m.activityMul;

		// Off-screen → re-spawn em outra borda
		if (p.x < -30 || p.x > m.w + 30 || p.y < -30 || p.y > m.h + 30) {
			const fresh = this.spawnParticle("inflow");
			Object.assign(p, fresh);
		}
	}

	private renderParticle(
		ctx: CanvasRenderingContext2D,
		p: Particle,
		colors: typeof STATE_COLORS[JarvisState],
		now: number
	): void {
		// Individual flicker + life-based alpha (fade quando absorvido)
		const flicker = 0.7 + Math.sin(now * 1.5 + p.pulsePhase) * 0.3;
		const alpha = p.baseAlpha * flicker * p.life;

		// Layer-aware glow via shadow blur
		const glow = LAYER_GLOW[p.layer];
		if (glow.blur > 0) {
			ctx.shadowColor = `rgba(${colors.ripple},${glow.alpha * p.life})`;
			ctx.shadowBlur = glow.blur;
		} else {
			ctx.shadowBlur = 0;
		}

		ctx.fillStyle = `rgba(${colors.ripple},${alpha})`;
		ctx.beginPath();
		ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
		ctx.fill();
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

		// Voice equalizer "boca" during speaking — bottom of orb stage
		if (this.state === "speaking") {
			this.drawSpeakingEqualizer(ctx, cx, cy);
		}
	}

	private drawSpeakingEqualizer(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
		const colors = STATE_COLORS.speaking;
		const bars = 24;
		const barWidth = 4;
		const barGap = 3;
		const totalWidth = bars * (barWidth + barGap) - barGap;
		const startX = cx - totalWidth / 2;
		const baseY = cy + this.opts.orbSize * 0.65;
		const t = Date.now() / 100;

		ctx.fillStyle = `rgba(${colors.ripple},0.85)`;
		ctx.shadowColor = `rgba(${colors.ripple},0.7)`;
		ctx.shadowBlur = 8;
		for (let i = 0; i < bars; i++) {
			// Sine wave with phase offset per bar — pseudo-spectrogram
			const wave1 = Math.sin(t * 0.18 + i * 0.4) * 0.5 + 0.5;
			const wave2 = Math.sin(t * 0.31 + i * 0.7) * 0.3 + 0.5;
			const intensity = (wave1 + wave2) * 0.5;
			const barH = 6 + intensity * (this.opts.orbSize * 0.18);
			const x = startX + i * (barWidth + barGap);
			ctx.fillRect(x, baseY - barH / 2, barWidth, barH);
		}
		ctx.shadowBlur = 0;
	}

	applyState(state: JarvisState): void {
		this.state = state;
		const colors = STATE_COLORS[state];
		// Dynamic per-state visuals — gradient/shadow are runtime-computed strings
		this.orbEl.style.setProperty("background", colors.gradient);
		this.orbEl.style.setProperty("box-shadow", colors.shadow);
		this.orbRingEl.style.setProperty("border-color", colors.ringBorder);
		// Animation switch via classes (one class per state)
		this.orbEl.removeClass("is-idle", "is-listening", "is-thinking", "is-speaking");
		this.orbEl.addClass(`is-${state}`);
		// v0.20: orb stage também ganha state class para HUD frame reagir
		const stage = this.orbEl.parentElement;
		if (stage) {
			stage.removeClass("state-idle", "state-listening", "state-thinking", "state-speaking");
			stage.addClass(`state-${state}`);
		}
		// v0.20: container raiz também
		const container = stage?.parentElement;
		if (container) {
			container.removeClass("state-idle", "state-listening", "state-thinking", "state-speaking");
			container.addClass(`state-${state}`);
		}
		// Update readouts (status changes, kg counts may shift)
		this.updateReadouts();
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

	/** v0.20: JARVIS-style data readouts (top-left + bottom corners) */
	private updateReadouts(): void {
		if (!this.readoutsEl) return;
		this.readoutsEl.empty();

		// Top-left: model + RAM (system info)
		const tl = this.readoutsEl.createDiv({ cls: "atlas-jarvis-readout is-tl" });
		const model = this.plugin.settings.ollama.generationModel;
		tl.createDiv({ cls: "atlas-jarvis-readout-line", text: `▸ MODEL: ${model.toUpperCase()}` });
		try {
			const totalGB = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
			const freeGB = (os.freemem() / 1024 / 1024 / 1024).toFixed(1);
			tl.createDiv({ cls: "atlas-jarvis-readout-line", text: `▸ RAM: ${freeGB} / ${totalGB} GB` });
		} catch {
			// non-Node env, skip
		}

		// Bottom-left: KG counts
		const bl = this.readoutsEl.createDiv({ cls: "atlas-jarvis-readout is-bl" });
		try {
			const peopleN = this.plugin.kg?.listPeople()?.length ?? 0;
			const sysN = this.plugin.kg?.data.systems?.length ?? 0;
			const sessionsN = this.plugin.kg?.data.sessions?.length ?? 0;
			const themesN = this.plugin.kg?.data.themes?.length ?? 0;
			bl.createDiv({ cls: "atlas-jarvis-readout-line", text: `◆ KG · ${peopleN} people · ${sysN} systems` });
			bl.createDiv({ cls: "atlas-jarvis-readout-line", text: `◆ ${sessionsN} sessions · ${themesN} themes` });
		} catch {
			bl.createDiv({ cls: "atlas-jarvis-readout-line", text: "◆ KG: indexing..." });
		}

		// Bottom-right: status indicator
		const br = this.readoutsEl.createDiv({ cls: "atlas-jarvis-readout is-br" });
		const statusText = `▸ STATUS: ${this.state.toUpperCase()}`;
		br.createDiv({ cls: "atlas-jarvis-readout-line atlas-jarvis-status-line", text: statusText });
		const provider = this.plugin.providerRouter?.resolveTask("chat")?.provider ?? "ollama";
		br.createDiv({ cls: "atlas-jarvis-readout-line", text: `▸ PROVIDER: ${provider.toUpperCase()}` });
	}

	private appendHistory(text: string): void {
		if (!this.historyEl) return;
		const line = this.historyEl.createDiv({ cls: "atlas-jarvis-history-line", text });
		while (this.historyEl.children.length > 6) {
			this.historyEl.firstChild?.remove();
		}
		setTimeout(() => line.addClass("is-shown"), 10);
	}

	destroy(): void {
		if (this.animFrame) window.cancelAnimationFrame(this.animFrame);
		if (this.readoutsTimer !== null) {
			window.clearInterval(this.readoutsTimer);
			this.readoutsTimer = null;
		}
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
		document.removeEventListener("atlas:voice-needs-whisper-config", this.whisperConfigPromptHandler);
		if (this.spaceHandler) document.removeEventListener("keydown", this.spaceHandler);
		if (this.spaceUpHandler) document.removeEventListener("keyup", this.spaceUpHandler);
	}
}

// ─────────────────────────────────────────────────────
// Constants

interface MotionCtx {
	cx: number;
	cy: number;
	orbitalRadius: number;
	orbitalRadiusSq: number;
	activityMul: number;
	w: number;
	h: number;
}

const ACTIVITY_MUL: Record<JarvisState, number> = {
	idle: 1,
	listening: 1.6,
	thinking: 1.2,
	speaking: 1.4,
};

const LAYER_GLOW: Record<ParticleLayer, { blur: number; alpha: number }> = {
	0: { blur: 0, alpha: 0 },
	1: { blur: 5, alpha: 0.5 },
	2: { blur: 10, alpha: 0.9 },
};

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

// Button styles moved to .atlas-jarvis-btn in styles.css (v0.9.5)
