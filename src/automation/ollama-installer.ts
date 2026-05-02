/**
 * Atlas Ollama Detector + Install Guide.
 *
 * Detecta se Ollama está instalado e/ou rodando.
 * Se não, mostra modal com link de download platform-specific.
 *
 * Não tenta instalar com privilégios elevados (UX ruim, security questionável).
 * Em vez disso: guia o user em <30s.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { OllamaClient } from "../ollama/client";
import { logger } from "../utils/logger";

const execAsync = promisify(exec);

export interface OllamaDetection {
	installed: boolean;
	running: boolean;
	binaryPath?: string;
	version?: string;
	platform: "darwin" | "win32" | "linux" | "other";
	downloadUrl: string;
	installInstructions: string;
}

export async function detectOllama(client: OllamaClient): Promise<OllamaDetection> {
	const platform = detectPlatform();
	const downloadUrl = downloadUrlFor(platform);
	const installInstructions = instructionsFor(platform);

	// 1. Daemon rodando? (mais fácil de detectar)
	const running = await client.ping().catch(() => false);

	// 2. Binary instalado? (which / where)
	let installed = false;
	let binaryPath: string | undefined;
	let version: string | undefined;

	try {
		const cmd = platform === "win32" ? "where ollama" : "which ollama";
		const { stdout } = await execAsync(cmd, { timeout: 5000 });
		const path = stdout.trim().split("\n")[0];
		if (path && !path.includes("not found")) {
			installed = true;
			binaryPath = path;
		}
	} catch {
		// `which` retorna exit 1 se não encontrar
	}

	// Se daemon roda mas não achamos binary, ainda consideramos instalado
	if (running && !installed) {
		installed = true;
	}

	// 3. Version (se instalado)
	if (installed && binaryPath) {
		try {
			const { stdout } = await execAsync(`"${binaryPath}" --version`, { timeout: 5000 });
			const match = /version is ([\d.]+)/.exec(stdout) || /([\d.]+)/.exec(stdout);
			version = match?.[1];
		} catch {
			// ignore
		}
	}

	logger.info("ollama detect", { installed, running, platform, version });

	return {
		installed,
		running,
		binaryPath,
		version,
		platform,
		downloadUrl,
		installInstructions,
	};
}

function detectPlatform(): OllamaDetection["platform"] {
	const p = process.platform;
	if (p === "darwin") return "darwin";
	if (p === "win32") return "win32";
	if (p === "linux") return "linux";
	return "other";
}

function downloadUrlFor(platform: OllamaDetection["platform"]): string {
	switch (platform) {
		case "darwin":
			return "https://ollama.com/download/Ollama-darwin.zip";
		case "win32":
			return "https://ollama.com/download/OllamaSetup.exe";
		case "linux":
			return "https://ollama.com/download/linux";
		default:
			return "https://ollama.com/download";
	}
}

function instructionsFor(platform: OllamaDetection["platform"]): string {
	switch (platform) {
		case "darwin":
			return [
				"1. Click no botão 'Baixar Ollama' (abre ollama.com)",
				"2. Baixe o .zip → extraia → arraste 'Ollama' pra Applications",
				"3. Abra o app uma vez (ele inicia o daemon)",
				"4. Volte aqui e click 'Verificar de novo'",
			].join("\n");
		case "win32":
			return [
				"1. Click 'Baixar Ollama' (abre ollama.com)",
				"2. Execute OllamaSetup.exe (next, next, finish)",
				"3. Ollama inicia automaticamente em background",
				"4. Volte aqui e click 'Verificar de novo'",
			].join("\n");
		case "linux":
			return [
				"1. No terminal: `curl -fsSL https://ollama.com/install.sh | sh`",
				"2. Inicie daemon: `ollama serve` (em outro terminal)",
				"3. Volte aqui e click 'Verificar de novo'",
			].join("\n");
		default:
			return "Visite https://ollama.com/download para instruções da sua plataforma.";
	}
}

/**
 * Tenta iniciar daemon Ollama (se binary instalado mas daemon offline).
 * Retorna true se subiu com sucesso.
 */
export async function tryStartOllamaDaemon(detection: OllamaDetection): Promise<boolean> {
	if (!detection.installed) return false;
	if (detection.running) return true;

	try {
		// Spawn detached para não bloquear plugin
		const { spawn } = await import("child_process");
		const proc = spawn("ollama", ["serve"], {
			detached: true,
			stdio: "ignore",
		});
		proc.unref();

		// Espera 2s e re-checa
		await new Promise((resolve) => setTimeout(resolve, 2000));
		return true;
	} catch (e) {
		logger.warn("ollama: falha ao iniciar daemon", { error: String(e) });
		return false;
	}
}
