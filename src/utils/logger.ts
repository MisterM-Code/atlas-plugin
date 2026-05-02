type Level = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<Level, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

let minLevel: Level = "info";

export function setLogLevel(level: Level): void {
	minLevel = level;
}

export interface LogEntry {
	ts: string; // ISO
	level: Level;
	msg: string;
	meta?: Record<string, unknown>;
}

const RING_MAX = 1000;
const ringBuffer: LogEntry[] = [];

/**
 * v0.52 Sprint C: persistent log ring buffer + file flush.
 * Acumulado em-memória; UI Log View lê daqui.
 * Flush em arquivo `.atlas/atlas.log` é opt-in via `attachLogPersistence`.
 */

export function getLogEntries(filter?: { level?: Level; search?: string; limit?: number }): LogEntry[] {
	let result = [...ringBuffer];
	if (filter?.level) {
		const min = LEVEL_PRIORITY[filter.level];
		result = result.filter((e) => LEVEL_PRIORITY[e.level] >= min);
	}
	if (filter?.search) {
		const q = filter.search.toLowerCase();
		result = result.filter(
			(e) =>
				e.msg.toLowerCase().includes(q) ||
				(e.meta && JSON.stringify(e.meta).toLowerCase().includes(q))
		);
	}
	if (filter?.limit) result = result.slice(-filter.limit);
	return result;
}

export function clearLogEntries(): void {
	ringBuffer.length = 0;
}

/** Format entry as text line for export/copy. */
export function formatLogEntry(e: LogEntry): string {
	const head = `[Atlas ${e.ts} ${e.level.toUpperCase()}]`;
	if (e.meta && Object.keys(e.meta).length > 0) {
		return `${head} ${e.msg} ${JSON.stringify(e.meta)}`;
	}
	return `${head} ${e.msg}`;
}

/** Persist hooks: caller pode passar callback pra append em vault file etc. */
type PersistHook = (entry: LogEntry) => void;
let persistHook: PersistHook | null = null;

export function attachLogPersistence(hook: PersistHook): void {
	persistHook = hook;
}

export function detachLogPersistence(): void {
	persistHook = null;
}

function fmt(level: Level, msg: string, meta?: Record<string, unknown>): string {
	const ts = new Date().toISOString();
	const prefix = `[Atlas ${ts} ${level.toUpperCase()}]`;
	if (meta && Object.keys(meta).length > 0) {
		return `${prefix} ${msg} ${JSON.stringify(meta)}`;
	}
	return `${prefix} ${msg}`;
}

function log(level: Level, msg: string, meta?: Record<string, unknown>): void {
	if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel]) return;

	const entry: LogEntry = { ts: new Date().toISOString(), level, msg, meta };

	// Ring buffer (always)
	ringBuffer.push(entry);
	if (ringBuffer.length > RING_MAX) ringBuffer.shift();

	// Persist hook (best-effort, fire-and-forget)
	if (persistHook) {
		try {
			persistHook(entry);
		} catch {
			// suppress — persistence is non-critical
		}
	}

	// Console output
	const out = fmt(level, msg, meta);
	switch (level) {
		case "debug":
			console.debug(out);
			break;
		case "info":
			// Obsidian guideline: prefer warn/error/debug; info treated as debug
			console.debug(out);
			break;
		case "warn":
			console.warn(out);
			break;
		case "error":
			console.error(out);
			break;
	}
}

export const logger = {
	debug: (msg: string, meta?: Record<string, unknown>) => log("debug", msg, meta),
	info: (msg: string, meta?: Record<string, unknown>) => log("info", msg, meta),
	warn: (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta),
	error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
};
