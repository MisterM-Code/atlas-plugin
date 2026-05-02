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
