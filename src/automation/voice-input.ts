/**
 * Atlas Voice Input — captura áudio via MediaRecorder + transcreve com whisper.cpp.
 *
 * Pipeline:
 *  1. getUserMedia → MediaRecorder grava webm
 *  2. Stop record → save .wav temp em vault `.atlas/voice/`
 *  3. exec whisper.cpp -m model.bin -f temp.wav -otxt
 *  4. Lê .txt output → retorna texto
 *
 * Settings necessários:
 *  - voice.whisperBinaryPath
 *  - voice.whisperModelPath
 *  - voice.language (default "pt")
 */

import { exec } from "child_process";
import { promisify } from "util";
import { writeFileSync, readFileSync, existsSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { logger } from "../utils/logger";

const execAsync = promisify(exec);

export interface VoiceInputConfig {
	whisperBinaryPath: string;
	whisperModelPath: string;
	language: string;
}

export interface VoiceRecordingHandle {
	stop: () => Promise<{ text: string; durationMs: number; tempFile: string } | null>;
	cancel: () => void;
	getElapsedMs: () => number;
	getAudioLevel: () => number; // 0-1 RMS for waveform
}

/**
 * Inicia gravação de voz. Retorna handle pra stop/cancel + amostragem de nível.
 */
export async function startVoiceRecording(): Promise<VoiceRecordingHandle> {
	const stream = await navigator.mediaDevices.getUserMedia({
		audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
	});

	// Audio analyser para waveform
	const audioCtx = new AudioContext();
	const source = audioCtx.createMediaStreamSource(stream);
	const analyser = audioCtx.createAnalyser();
	analyser.fftSize = 256;
	source.connect(analyser);
	const dataArray = new Uint8Array(analyser.frequencyBinCount);

	// MediaRecorder grava webm/opus
	const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
		? "audio/webm;codecs=opus"
		: "audio/webm";
	const recorder = new MediaRecorder(stream, { mimeType });
	const chunks: Blob[] = [];
	recorder.addEventListener("dataavailable", (ev) => {
		if (ev.data && ev.data.size > 0) chunks.push(ev.data);
	});

	const startMs = Date.now();
	recorder.start(100); // chunk a cada 100ms

	let cancelled = false;

	const cleanup = () => {
		try {
			stream.getTracks().forEach((t) => t.stop());
		} catch {
			// ignore
		}
		try {
			void audioCtx.close();
		} catch {
			// ignore
		}
	};

	const getAudioLevel = (): number => {
		analyser.getByteTimeDomainData(dataArray);
		let sum = 0;
		for (const v of dataArray) {
			const norm = (v - 128) / 128;
			sum += norm * norm;
		}
		const rms = Math.sqrt(sum / dataArray.length);
		return Math.min(1, rms * 2); // amplifica
	};

	const getElapsedMs = (): number => Date.now() - startMs;

	const stop = async (): Promise<{ text: string; durationMs: number; tempFile: string } | null> => {
		if (cancelled) return null;
		return new Promise((resolve, reject) => {
			recorder.addEventListener("stop", async () => {
				try {
					const blob = new Blob(chunks, { type: mimeType });
					const buf = Buffer.from(await blob.arrayBuffer());
					const tempFile = join(tmpdir(), `atlas-voice-${Date.now()}.webm`);
					writeFileSync(tempFile, buf);
					cleanup();
					resolve({ text: "", durationMs: getElapsedMs(), tempFile });
				} catch (e) {
					cleanup();
					reject(e);
				}
			});
			recorder.stop();
		});
	};

	const cancel = (): void => {
		cancelled = true;
		try {
			recorder.stop();
		} catch {
			// ignore
		}
		cleanup();
	};

	return { stop, cancel, getElapsedMs, getAudioLevel };
}

/**
 * Transcreve arquivo .webm via whisper.cpp.
 * whisper.cpp aceita .wav nativamente; .webm requer conversão (ffmpeg) OU passa direto se whisper.cpp recente.
 *
 * Formato do comando:
 *   whisper-cpp -m model.bin -f input.webm -otxt -of output --language pt
 *
 * Retorna texto transcrito.
 */
export async function transcribeAudio(
	tempFile: string,
	config: VoiceInputConfig
): Promise<string> {
	if (!config.whisperBinaryPath) {
		throw new Error(
			"Atlas: whisper.cpp não configurado.\n\nInstale (Windows: winget install whisper.cpp · Mac: brew install whisper-cpp · Linux: github.com/ggerganov/whisper.cpp), então Settings → Atlas → Voice → cole o caminho do binário."
		);
	}
	if (!config.whisperModelPath) {
		throw new Error(
			"Atlas: modelo Whisper não configurado.\n\nBaixe um modelo (ex: ggml-small.bin de huggingface.co/ggerganov/whisper.cpp/tree/main) e coloque o path em Settings → Atlas → Voice → Whisper model path."
		);
	}
	// v0.52.2: pre-validate binary exists antes de exec (UX melhor que ENOENT do shell)
	if (!existsSync(config.whisperBinaryPath)) {
		throw new Error(
			`Atlas: whisper binary não encontrado em "${config.whisperBinaryPath}".\n\nVerifique o caminho em Settings → Atlas → Voice. Talvez você precise instalar whisper.cpp (Windows: winget install · Mac: brew install whisper-cpp · Linux: compile do GitHub).`
		);
	}
	if (!existsSync(config.whisperModelPath)) {
		throw new Error(
			`Atlas: modelo Whisper não encontrado em "${config.whisperModelPath}".\n\nBaixe ggml-small.bin e ajuste o path em Settings.`
		);
	}
	if (!existsSync(tempFile)) {
		throw new Error(`Atlas: arquivo de áudio não encontrado: ${tempFile}`);
	}

	const outputBase = tempFile.replace(/\.webm$/, "");
	const outputTxt = `${outputBase}.txt`;

	// Comando: whisper-cpp -m MODEL -f INPUT --output-txt -of OUT --language pt --no-timestamps
	const lang = config.language || "pt";
	const cmd = `"${config.whisperBinaryPath}" -m "${config.whisperModelPath}" -f "${tempFile}" --output-txt -of "${outputBase}" --language ${lang} --no-timestamps 2>&1`;

	logger.info("voice: transcribing", { cmd });

	try {
		await execAsync(cmd, { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 });
	} catch (e) {
		// v0.52.2: enriquecer erro com message real do shell pra debug
		const errMsg = (e as { message?: string; stderr?: string })?.message ?? String(e);
		logger.error("voice: whisper exec falhou", { error: errMsg });
		throw new Error(
			`Atlas: whisper.cpp falhou ao executar.\n\nErro: ${errMsg.substring(0, 280)}\n\nVerifique:\n1. Binary path correto em Settings\n2. Model file existe e é compatível com whisper.cpp\n3. O áudio foi gravado (>1s, formato webm)`
		);
	}

	if (!existsSync(outputTxt)) {
		throw new Error("Atlas: whisper não produziu output (.txt). Verifique formato do áudio.");
	}

	let text = readFileSync(outputTxt, "utf-8").trim();
	// Cleanup temp files
	try {
		unlinkSync(tempFile);
		unlinkSync(outputTxt);
	} catch {
		// ignore
	}

	// Whisper às vezes adiciona timestamps/markers — limpa
	text = text.replace(/\[\d{2}:\d{2}:\d{2}[^\]]*\]/g, "").trim();
	text = text.replace(/^\s*\[BLANK_AUDIO\]\s*$/i, "");

	return text;
}
