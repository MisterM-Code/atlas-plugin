/**
 * Atlas v0.21 — Whisper.cpp auto-detector.
 *
 * Tries `which whisper-cpp` (or `where whisper-cpp.exe` on Windows), falls back
 * to common install paths. Also auto-discovers default model file.
 *
 * Used by main.ts onload to silently configure voice without user input.
 * If found, persists to settings.voice.{whisperBinaryPath, whisperModelPath}.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { existsSync, readdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { logger } from "../utils/logger";

const execAsync = promisify(exec);

export interface WhisperDetection {
	installed: boolean;
	binaryPath?: string;
	modelPath?: string;
	version?: string;
	platform: "darwin" | "win32" | "linux" | "other";
}

const COMMON_BINARY_PATHS_UNIX = [
	"/opt/homebrew/bin/whisper-cpp",
	"/opt/homebrew/bin/whisper",
	"/usr/local/bin/whisper-cpp",
	"/usr/local/bin/whisper",
	"/usr/bin/whisper-cpp",
	"/snap/bin/whisper-cpp",
];

const COMMON_BINARY_PATHS_WIN = [
	"C:/Program Files/whisper.cpp/whisper-cpp.exe",
	"C:/Program Files/whisper.cpp/main.exe",
];

/**
 * Detects whisper.cpp binary + default model. Silent (no UI) — caller decides
 * what to do with result (e.g. persist to settings if found).
 */
export async function autoDetectWhisper(): Promise<WhisperDetection> {
	const platform = detectPlatform();
	let binaryPath: string | undefined;
	let version: string | undefined;

	// 1. Try `which` / `where` first (most reliable)
	try {
		const cmd = platform === "win32" ? "where whisper-cpp" : "which whisper-cpp";
		const { stdout } = await execAsync(cmd, { timeout: 3000 });
		const path = stdout.trim().split("\n")[0];
		if (path && !path.includes("not found")) {
			binaryPath = path;
		}
	} catch {
		// not found via PATH — try common install locations
	}

	// 2. Fallback to common paths
	if (!binaryPath) {
		const candidates = platform === "win32" ? COMMON_BINARY_PATHS_WIN : COMMON_BINARY_PATHS_UNIX;
		// Also check user home dir build paths
		const home = homedir();
		const homePaths = [
			join(home, "whisper.cpp", "main"),
			join(home, "whisper.cpp", "build", "bin", "main"),
			join(home, "whisper.cpp", "build", "bin", "whisper-cli"),
			join(home, "whisper.cpp", "whisper-cli"),
		];
		for (const p of [...candidates, ...homePaths]) {
			if (existsSync(p)) {
				binaryPath = p;
				break;
			}
		}
	}

	// 3. Get version (validates binary actually works)
	if (binaryPath) {
		try {
			const { stdout } = await execAsync(`"${binaryPath}" --version`, { timeout: 3000 });
			version = stdout.trim().split("\n")[0]?.substring(0, 80);
		} catch {
			// binary path exists but won't run — keep path but no version
		}
	}

	// 4. Auto-discover default model
	const modelPath = autoDetectModel();

	return {
		installed: Boolean(binaryPath),
		binaryPath,
		modelPath,
		version,
		platform,
	};
}

/**
 * Searches for ggml-*.bin model file in common locations.
 * Prefers ggml-base.bin > ggml-small.bin > ggml-tiny.bin (best quality available).
 */
function autoDetectModel(): string | undefined {
	const home = homedir();
	const searchDirs = [
		join(home, "whisper.cpp", "models"),
		join(home, ".whisper", "models"),
		"/opt/homebrew/share/whisper-cpp/models",
		"/usr/local/share/whisper-cpp/models",
	];
	const preference = ["ggml-medium.bin", "ggml-base.bin", "ggml-small.bin", "ggml-tiny.bin"];

	for (const dir of searchDirs) {
		try {
			if (!existsSync(dir)) continue;
			const files = readdirSync(dir).filter((f) => f.startsWith("ggml-") && f.endsWith(".bin"));
			if (files.length === 0) continue;
			// Pick best preference available
			for (const pref of preference) {
				if (files.includes(pref)) {
					return join(dir, pref);
				}
			}
			// Fallback: first ggml file
			return join(dir, files[0]);
		} catch {
			// ignore — try next dir
		}
	}
	return undefined;
}

function detectPlatform(): WhisperDetection["platform"] {
	const p = process.platform;
	if (p === "darwin" || p === "win32" || p === "linux") return p;
	return "other";
}

export function installInstructionsFor(platform: WhisperDetection["platform"]): { command: string; help: string } {
	switch (platform) {
		case "darwin":
			return {
				command: "brew install whisper-cpp",
				help: "Roda no Terminal. Após instalar, rode 'Atlas: re-detect whisper' ou reabra o Atlas.",
			};
		case "linux":
			return {
				command: "git clone https://github.com/ggerganov/whisper.cpp && cd whisper.cpp && make",
				help: "Compila do source (não há pacote oficial no apt). Após `make`, baixe modelo: `bash ./models/download-ggml-model.sh base`.",
			};
		case "win32":
			return {
				command: "Download from github.com/ggerganov/whisper.cpp/releases",
				help: "Baixe o release Windows mais recente, extraia, e ponha o caminho do .exe em Settings → Voice.",
			};
		default:
			return {
				command: "https://github.com/ggerganov/whisper.cpp",
				help: "Compile do source seguindo o README do whisper.cpp.",
			};
	}
}

/** Helper: log auto-detection result silently (no UI). */
export function logDetection(d: WhisperDetection): void {
	if (d.installed) {
		logger.info("whisper-detector: auto-detected", {
			binary: d.binaryPath,
			model: d.modelPath ?? "(no default model found — user must download)",
			version: d.version,
		});
	} else {
		logger.info("whisper-detector: not found", { platform: d.platform });
	}
}
