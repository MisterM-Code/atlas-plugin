import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as os from "os";
import * as fs from "fs/promises";
import { logger } from "../utils/logger";

const pexec = promisify(exec);

export interface TtsConfig {
	binaryPath: string; // path to piper binary
	modelPath: string; // path to .onnx voice file
	language: string;
}

export class PiperTTS {
	constructor(private cfg: TtsConfig) {}

	updateConfig(cfg: TtsConfig): void {
		this.cfg = cfg;
	}

	get configured(): boolean {
		return Boolean(this.cfg.binaryPath && this.cfg.modelPath);
	}

	/**
	 * Generate WAV file with piper. Returns absolute path.
	 * Throws if piper unavailable.
	 */
	async synthesize(text: string, outputPath?: string): Promise<string> {
		if (!this.configured) {
			throw new Error("Piper TTS não configurado. Settings → Atlas → Voice.");
		}

		const out = outputPath ?? path.join(os.tmpdir(), `atlas-tts-${Date.now()}.wav`);
		// Sanitize text (limit, remove markdown noise)
		const cleaned = text
			.replace(/[*_`#>]/g, "")
			.replace(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g, "$1")
			.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
			.replace(/\s+/g, " ")
			.trim()
			.substring(0, 4000);

		const tempInput = path.join(os.tmpdir(), `atlas-tts-input-${Date.now()}.txt`);
		await fs.writeFile(tempInput, cleaned, "utf8");

		const cmd = `"${this.cfg.binaryPath}" --model "${this.cfg.modelPath}" --output_file "${out}" < "${tempInput}"`;

		try {
			await pexec(cmd, { timeout: 30000 });
			return out;
		} catch (e) {
			logger.warn("tts: synth falhou", { error: String(e) });
			throw e;
		} finally {
			fs.unlink(tempInput).catch(() => {});
		}
	}

	async play(filePath: string): Promise<void> {
		const platform = process.platform;
		// v0.9 Sprint 28.5: emit speaking events pro JarvisOverlay sincronizar orb
		emitTTSEvent("atlas:tts-start");
		try {
			if (platform === "darwin") {
				await pexec(`afplay "${filePath}"`);
			} else if (platform === "win32") {
				const ps = `(New-Object Media.SoundPlayer "${filePath}").PlaySync()`;
				await pexec(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`);
			} else {
				await pexec(`aplay "${filePath}" 2>/dev/null || paplay "${filePath}" 2>/dev/null`);
			}
		} catch (e) {
			logger.warn("tts: play falhou", { error: String(e) });
		} finally {
			emitTTSEvent("atlas:tts-stop");
		}
	}

	async speakNow(text: string): Promise<string> {
		const out = await this.synthesize(text);
		this.play(out).catch(() => {});
		return out;
	}
}

function emitTTSEvent(name: "atlas:tts-start" | "atlas:tts-stop"): void {
	try {
		document.dispatchEvent(new CustomEvent(name));
	} catch {
		// non-renderer context, ignore
	}
}
