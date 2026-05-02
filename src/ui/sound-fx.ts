/**
 * Atlas Sound FX — Web Audio API (zero dep, sons sintetizados).
 *
 * Bug histórico v0.7.0: settings.animations.soundEffects existia mas zero implementação.
 * Fix v0.7.1: 4 sons sintetizados (~50ms cada), respeita toggle ON/OFF.
 *
 * Usado em:
 *  - Tab activation → ding curto
 *  - Achievement unlock → success arpeggio
 *  - Action dispatch → whoosh
 *  - Error modal → error tone
 */

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
	if (audioCtx) return audioCtx;
	try {
		const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
		audioCtx = new Ctx();
		return audioCtx;
	} catch {
		return null;
	}
}

interface SoundOptions {
	enabled?: boolean;
}

function shouldPlay(opts: SoundOptions): boolean {
	return opts.enabled ?? false;
}

/** Tab switch / OK confirmation — short sine 440Hz~660Hz beep. */
export function playDing(opts: SoundOptions = {}): void {
	if (!shouldPlay(opts)) return;
	const ctx = getCtx();
	if (!ctx) return;
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = "sine";
	osc.frequency.setValueAtTime(660, ctx.currentTime);
	gain.gain.setValueAtTime(0.0001, ctx.currentTime);
	gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
	gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.1);
	osc.connect(gain).connect(ctx.destination);
	osc.start();
	osc.stop(ctx.currentTime + 0.12);
}

/** Action dispatch — whoosh (white noise filtered descending). */
export function playWhoosh(opts: SoundOptions = {}): void {
	if (!shouldPlay(opts)) return;
	const ctx = getCtx();
	if (!ctx) return;

	const bufferSize = ctx.sampleRate * 0.15;
	const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < bufferSize; i++) {
		data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize); // fade out
	}

	const noise = ctx.createBufferSource();
	noise.buffer = buffer;

	const filter = ctx.createBiquadFilter();
	filter.type = "lowpass";
	filter.frequency.setValueAtTime(2000, ctx.currentTime);
	filter.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.15);

	const gain = ctx.createGain();
	gain.gain.setValueAtTime(0.08, ctx.currentTime);

	noise.connect(filter).connect(gain).connect(ctx.destination);
	noise.start();
}

/** Achievement unlock — C4 → E4 → G4 arpeggio. */
export function playSuccess(opts: SoundOptions = {}): void {
	if (!shouldPlay(opts)) return;
	const ctx = getCtx();
	if (!ctx) return;

	const notes = [261.63, 329.63, 392.0]; // C4, E4, G4
	const now = ctx.currentTime;
	for (let i = 0; i < notes.length; i++) {
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = "triangle";
		osc.frequency.setValueAtTime(notes[i], now + i * 0.08);
		gain.gain.setValueAtTime(0.0001, now + i * 0.08);
		gain.gain.exponentialRampToValueAtTime(0.12, now + i * 0.08 + 0.01);
		gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.18);
		osc.connect(gain).connect(ctx.destination);
		osc.start(now + i * 0.08);
		osc.stop(now + i * 0.08 + 0.2);
	}
}

/** Error tone — descending 200Hz square. */
export function playError(opts: SoundOptions = {}): void {
	if (!shouldPlay(opts)) return;
	const ctx = getCtx();
	if (!ctx) return;
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = "square";
	osc.frequency.setValueAtTime(220, ctx.currentTime);
	osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.15);
	gain.gain.setValueAtTime(0.0001, ctx.currentTime);
	gain.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.01);
	gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
	osc.connect(gain).connect(ctx.destination);
	osc.start();
	osc.stop(ctx.currentTime + 0.2);
}
