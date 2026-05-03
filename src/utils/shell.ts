/**
 * Atlas v0.52.3 — Shared shell utility.
 *
 * Lazy-loads child_process e util. Top-level imports de child_process podem
 * falhar em alguns ambientes Electron (renderer com nodeIntegration parcial).
 * Lazy import só carrega quando função é chamada — plugin nunca falha no load.
 *
 * Use em vez de: `import { exec } from "child_process"; const execAsync = promisify(exec);`
 */

import { logger } from "./logger";

type ExecAsyncFn = (
	cmd: string,
	opts?: { timeout?: number; maxBuffer?: number; cwd?: string }
) => Promise<{ stdout: string; stderr: string }>;

let cachedExecAsync: ExecAsyncFn | null = null;

async function getExecAsync(): Promise<ExecAsyncFn> {
	if (cachedExecAsync) return cachedExecAsync;
	try {
		const cp = await import("child_process");
		const util = await import("util");
		cachedExecAsync = util.promisify(cp.exec) as unknown as ExecAsyncFn;
		return cachedExecAsync;
	} catch (e) {
		logger.error("shell: child_process não disponível", { error: String(e) });
		throw new Error(
			`Atlas: Node child_process não disponível neste ambiente Obsidian.\nIsso geralmente significa que o plugin está rodando em sandbox restrito. Tente reiniciar Obsidian.`
		);
	}
}

export interface RunShellResult {
	stdout: string;
	stderr: string;
}

/**
 * Executa comando shell. Lazy-loads child_process.
 *
 * Throws com mensagem humana se:
 *  - child_process indisponível (Electron sandbox)
 *  - comando falha (preserva stderr)
 *  - timeout
 */
export async function runShell(
	cmd: string,
	opts: { timeout?: number; maxBuffer?: number; cwd?: string } = {}
): Promise<RunShellResult> {
	const execAsync = await getExecAsync();
	if (!execAsync) {
		throw new Error("Atlas: shell exec não inicializado.");
	}
	return execAsync(cmd, {
		timeout: opts.timeout ?? 30_000,
		maxBuffer: opts.maxBuffer ?? 5 * 1024 * 1024,
		cwd: opts.cwd,
	});
}

/**
 * Verifica se comando shell pode rodar (exit code 0 sem stderr crítico).
 * Útil pra detect platform-specific tools (which/where + binary name).
 */
export async function canRunShell(cmd: string): Promise<boolean> {
	try {
		await runShell(cmd, { timeout: 5_000 });
		return true;
	} catch {
		return false;
	}
}

/**
 * v0.52.6: Idempotent folder creation. Silencia "already exists" errors causados
 * por race conditions (multiple concurrent saves checking folder existence).
 *
 * Use em vez de:
 *   if (!vault.getAbstractFileByPath(path)) await vault.createFolder(path);
 *
 * Que tem race entre check e create.
 */
export async function ensureFolder(
	vault: { getAbstractFileByPath: (p: string) => unknown; createFolder: (p: string) => Promise<unknown> },
	path: string
): Promise<void> {
	if (vault.getAbstractFileByPath(path)) return;
	try {
		await vault.createFolder(path);
	} catch (e) {
		const msg = String(e);
		// Race: outra chamada criou entre nosso check e create. Silencia.
		if (msg.includes("already exists") || msg.includes("Folder already exists") || msg.includes("File already exists")) {
			return;
		}
		throw e;
	}
}
