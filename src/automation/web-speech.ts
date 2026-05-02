/**
 * Atlas v0.9.2 — Web Speech API fallback for voice input.
 *
 * Used when whisper.cpp not configured. Browser-native (Electron supports it).
 * Real-time partial + final transcription. Zero install/config.
 *
 * Limits:
 * - macOS Chrome/Electron: works great in PT-BR
 * - Linux: requires Google Speech proxy (Electron may not support fully)
 * - Windows: works
 *
 * Reference: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API
 */

import { logger } from "../utils/logger";

export interface WebSpeechHandle {
	stop: () => void;
}

export interface WebSpeechOpts {
	language?: string; // "pt-BR" / "en-US" / etc.
	continuous?: boolean;
	interimResults?: boolean;
	onPartial?: (text: string) => void;
	onFinal: (text: string) => void;
	onError?: (err: string) => void;
}

interface SpeechRecognitionType {
	new (): SpeechRecognitionInstance;
}

interface SpeechRecognitionInstance {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	start(): void;
	stop(): void;
	abort(): void;
	onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
	onerror: ((ev: { error?: string }) => void) | null;
	onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
	results: ArrayLike<{
		isFinal: boolean;
		0: { transcript: string };
	}>;
	resultIndex: number;
}

function errorMessageFor(code: string): string {
	switch (code) {
		case "not-allowed":
			return "Microfone bloqueado nas permissões.";
		case "no-speech":
			return "Não detectei fala.";
		case "network":
			return navigator.onLine
				? "Web Speech indisponível agora. Configure whisper.cpp em Settings → Voice pra usar 100% offline."
				: "Sem internet — Web Speech requer Google API. Configure whisper.cpp em Settings → Voice pra usar 100% offline.";
		default:
			return `Erro voz: ${code}`;
	}
}

export function isWebSpeechAvailable(): boolean {
	const w = window as unknown as Record<string, unknown>;
	return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}

/**
 * Starts a Web Speech recognition session.
 * Returns handle. Call .stop() when user finishes speaking.
 */
export function startWebSpeech(opts: WebSpeechOpts): WebSpeechHandle {
	const w = window as unknown as Record<string, unknown>;
	const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as SpeechRecognitionType | undefined;
	if (!Ctor) {
		throw new Error("Web Speech API não disponível neste browser/Electron.");
	}

	const rec = new Ctor();
	rec.lang = opts.language ?? "pt-BR";
	rec.continuous = opts.continuous ?? false;
	rec.interimResults = opts.interimResults ?? true;

	let finalText = "";
	// v0.16: prevent double-notice — onerror + onend both fire on errors
	let errorFired = false;

	rec.onresult = (ev) => {
		let interim = "";
		for (let i = ev.resultIndex; i < ev.results.length; i++) {
			const result = ev.results[i];
			const transcript = result[0]?.transcript ?? "";
			if (result.isFinal) {
				finalText += transcript;
			} else {
				interim += transcript;
			}
		}
		if (interim && opts.onPartial) {
			opts.onPartial(finalText + interim);
		}
	};

	rec.onerror = (ev) => {
		errorFired = true;
		const code = ev.error ?? "unknown";
		logger.warn("web-speech error", { code });

		// v0.16: trigger global event for Jarvis to auto-prompt whisper config on offline
		if (code === "network") {
			const offline = !navigator.onLine;
			document.dispatchEvent(
				new CustomEvent("atlas:voice-needs-whisper-config", {
					detail: { reason: offline ? "offline" : "web-speech-failed" },
				})
			);
		}

		if (opts.onError) {
			const msg = errorMessageFor(code);
			opts.onError(msg);
		}
	};

	rec.onend = () => {
		// v0.16: skip if error already fired notice — avoids 2 stacked notices
		if (errorFired) return;
		if (finalText.trim()) {
			opts.onFinal(finalText.trim());
		} else if (opts.onError) {
			opts.onError("Sem transcrição detectada.");
		}
	};

	try {
		rec.start();
	} catch (e) {
		throw new Error(`Falha ao iniciar Web Speech: ${String(e)}`);
	}

	return {
		stop: () => {
			try {
				rec.stop();
			} catch {
				// ignore
			}
		},
	};
}
