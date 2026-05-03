import { App, normalizePath, TFile } from "obsidian";
import { logger } from "../utils/logger";

/**
 * Mem0-lite: episodic + semantic memory between conversations.
 * Persists in `.atlas/memory.json`.
 */

export interface MemoryFact {
	id: string;
	type: "preference" | "fact" | "context" | "instruction";
	text: string;
	createdAt: string;
	lastUsedAt?: string;
	useCount: number;
}

export interface ConversationTurn {
	role: "user" | "assistant";
	content: string;
	timestamp: string;
	citations?: string[];
}

export interface ConversationSession {
	id: string;
	startedAt: string;
	lastUpdatedAt: string;
	turns: ConversationTurn[];
}

interface MemoryState {
	version: 1;
	facts: MemoryFact[];
	sessions: ConversationSession[]; // last N sessions
	currentSessionId: string | null;
}

const MAX_SESSIONS_KEEP = 20;
const MAX_TURNS_PER_SESSION = 40;

/** v0.47 E2: Pending slot pra slot-filling conversational */
export interface PendingSlot {
	intent: string;
	tool: string;
	args: Record<string, unknown>;
	missing: string;
	expiresAt: number; // epoch ms
}

export class Memory {
	private state: MemoryState;
	private dirty = false;
	private flushTimer: number | null = null;
	/** v0.47 E2: in-memory pending slot (não persiste — TTL 5min) */
	private pendingSlot: PendingSlot | null = null;

	constructor(private app: App, private folder: string) {
		this.state = {
			version: 1,
			facts: [],
			sessions: [],
			currentSessionId: null,
		};
	}

	private get path(): string {
		return normalizePath(`${this.folder}/memory.json`);
	}

	async load(): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(this.path);
		if (!(file instanceof TFile)) return;
		try {
			const raw = await this.app.vault.read(file);
			const parsed = JSON.parse(raw) as MemoryState;
			if (parsed.version === 1) {
				this.state = parsed;
				logger.info("memory: carregado", {
					facts: parsed.facts.length,
					sessions: parsed.sessions.length,
				});
			}
		} catch (e) {
			logger.warn("memory: load falhou", { error: String(e) });
		}
	}

	async save(): Promise<void> {
		try {
			const json = JSON.stringify(this.state, null, 2);
			// v0.53.1: adapter.write idempotent (cria OU sobrescreve sem race)
			// User logs mostravam: "memory: save falhou: Folder already exists" ×8
			const adapter = this.app.vault.adapter;
			const folderExists = await adapter.exists(this.folder);
			if (!folderExists) {
				try {
					await adapter.mkdir(this.folder);
				} catch (folderErr) {
					if (!String(folderErr).includes("already exists")) throw folderErr;
				}
			}
			await adapter.write(this.path, json);
			this.dirty = false;
		} catch (e) {
			logger.error("memory: save falhou", { error: String(e) });
		}
	}

	private touch(): void {
		this.dirty = true;
		if (this.flushTimer !== null) window.clearTimeout(this.flushTimer);
		this.flushTimer = window.setTimeout(() => void this.save(), 1500);
	}

	// ─────────── Facts (semantic) ───────────

	addFact(input: { type: MemoryFact["type"]; text: string }): MemoryFact {
		const id = `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
		const fact: MemoryFact = {
			id,
			type: input.type,
			text: input.text,
			createdAt: new Date().toISOString(),
			useCount: 0,
		};
		this.state.facts.push(fact);
		this.touch();
		return fact;
	}

	updateFactUsage(id: string): void {
		const f = this.state.facts.find((x) => x.id === id);
		if (f) {
			f.lastUsedAt = new Date().toISOString();
			f.useCount += 1;
			this.touch();
		}
	}

	deleteFact(id: string): boolean {
		const idx = this.state.facts.findIndex((f) => f.id === id);
		if (idx >= 0) {
			this.state.facts.splice(idx, 1);
			this.touch();
			return true;
		}
		return false;
	}

	getFacts(): MemoryFact[] {
		return [...this.state.facts];
	}

	getRelevantFacts(query: string, limit = 5): MemoryFact[] {
		const queryLower = query.toLowerCase();
		const queryTokens = queryLower.split(/\s+/).filter((t) => t.length > 3);

		const scored = this.state.facts
			.map((f) => {
				const txt = f.text.toLowerCase();
				let score = 0;
				for (const t of queryTokens) {
					if (txt.includes(t)) score += 1;
				}
				// Recency bonus
				const daysSince = f.lastUsedAt
					? (Date.now() - new Date(f.lastUsedAt).getTime()) / 86400000
					: 365;
				score += Math.exp(-daysSince / 30) * 0.5;
				// Use count bonus
				score += Math.log1p(f.useCount) * 0.3;
				return { fact: f, score };
			})
			.filter((s) => s.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, limit);

		return scored.map((s) => s.fact);
	}

	// ─────────── Sessions (episodic) ───────────

	startNewSession(): string {
		const id = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
		const session: ConversationSession = {
			id,
			startedAt: new Date().toISOString(),
			lastUpdatedAt: new Date().toISOString(),
			turns: [],
		};
		this.state.sessions.push(session);
		this.state.currentSessionId = id;

		// Trim old sessions
		if (this.state.sessions.length > MAX_SESSIONS_KEEP) {
			this.state.sessions = this.state.sessions.slice(-MAX_SESSIONS_KEEP);
		}

		this.touch();
		return id;
	}

	getCurrentSession(): ConversationSession | null {
		const id = this.state.currentSessionId;
		if (!id) return null;
		return this.state.sessions.find((s) => s.id === id) ?? null;
	}

	/** v0.47 E2: pending slot management — TTL 5min, single slot at a time */
	setPendingSlot(slot: PendingSlot): void {
		this.pendingSlot = slot;
	}

	getPendingSlot(): PendingSlot | null {
		if (!this.pendingSlot) return null;
		if (this.pendingSlot.expiresAt < Date.now()) {
			this.pendingSlot = null;
			return null;
		}
		return this.pendingSlot;
	}

	clearPendingSlot(): void {
		this.pendingSlot = null;
	}

	addTurn(turn: Omit<ConversationTurn, "timestamp">): void {
		let session = this.getCurrentSession();
		if (!session) {
			this.startNewSession();
			session = this.getCurrentSession()!;
		}
		session.turns.push({
			...turn,
			timestamp: new Date().toISOString(),
		});
		session.lastUpdatedAt = new Date().toISOString();

		if (session.turns.length > MAX_TURNS_PER_SESSION) {
			session.turns = session.turns.slice(-MAX_TURNS_PER_SESSION);
		}

		this.touch();
	}

	getRecentTurns(limit = 6): ConversationTurn[] {
		const s = this.getCurrentSession();
		if (!s) return [];
		return s.turns.slice(-limit);
	}

	clearCurrentSession(): void {
		this.state.currentSessionId = null;
		this.touch();
	}

	listSessions(): ConversationSession[] {
		return [...this.state.sessions].sort((a, b) =>
			b.lastUpdatedAt.localeCompare(a.lastUpdatedAt)
		);
	}
}
