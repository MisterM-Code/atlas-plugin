import { App, normalizePath, TFile } from "obsidian";
import { KnowledgeGraph, KnowledgeGraphT, emptyGraph, slugify } from "./schemas";
import type {
	PersonT,
	SessionT,
	ActionItemT,
	CommitmentT,
	ThemeT,
	SystemT,
	ProductT,
	RoleT,
	CourseT,
	CourseModuleT,
} from "./schemas";
import { applyScope } from "../coach/scope";
import { logger } from "../utils/logger";

const KG_FILE = "kg.json";

export class KGStore {
	private graph: KnowledgeGraphT;
	private dirty = false;
	private flushTimer: number | null = null;

	constructor(private app: App, private atlasFolder: string) {
		this.graph = emptyGraph();
	}

	private get path(): string {
		return normalizePath(`${this.atlasFolder}/${KG_FILE}`);
	}

	async load(): Promise<void> {
		try {
			const file = this.app.vault.getAbstractFileByPath(this.path);
			if (!(file instanceof TFile)) {
				logger.info("KG: novo (arquivo não existe)");
				this.graph = emptyGraph();
				return;
			}
			const raw = await this.app.vault.read(file);
			const parsed = JSON.parse(raw);
			const result = KnowledgeGraph.safeParse(parsed);
			if (!result.success) {
				logger.warn("KG: arquivo inválido, recriando", {
					issues: result.error.issues,
				});
				this.graph = emptyGraph();
				return;
			}
			this.graph = result.data;
			logger.info("KG: carregado", {
				people: this.graph.people.length,
				sessions: this.graph.sessions.length,
				actionItems: this.graph.actionItems.length,
			});
		} catch (e) {
			logger.error("KG load failed", { error: String(e) });
			this.graph = emptyGraph();
		}
	}

	async save(): Promise<void> {
		this.graph.updatedAt = new Date().toISOString();
		const json = JSON.stringify(this.graph, null, 2);
		const file = this.app.vault.getAbstractFileByPath(this.path);
		try {
			if (file instanceof TFile) {
				await this.app.vault.modify(file, json);
			} else {
				const folder = this.app.vault.getAbstractFileByPath(this.atlasFolder);
				if (!folder) {
					await this.app.vault.createFolder(this.atlasFolder);
				}
				await this.app.vault.create(this.path, json);
			}
			this.dirty = false;
		} catch (e) {
			logger.error("KG save failed", { error: String(e) });
		}
	}

	/** Mark dirty and schedule a debounced flush. */
	touch(): void {
		this.dirty = true;
		if (this.flushTimer !== null) {
			window.clearTimeout(this.flushTimer);
		}
		this.flushTimer = window.setTimeout(() => {
			void this.save();
		}, 1500);
	}

	/**
	 * v0.44 E1: Export current KG to backup file.
	 * Used by atlas:export-kg-backup command + weekly scheduler.
	 * @returns the backup file path on success
	 */
	async exportBackup(): Promise<string> {
		const backupFolder = normalizePath(`${this.atlasFolder}/backups`);
		if (!this.app.vault.getAbstractFileByPath(backupFolder)) {
			await this.app.vault.createFolder(backupFolder);
		}
		// Use ISO week format YYYY-Www for rolling 4-week backup
		const now = new Date();
		const week = isoWeek(now);
		const filename = `kg-${now.getFullYear()}-W${String(week).padStart(2, "0")}.json`;
		const path = normalizePath(`${backupFolder}/${filename}`);
		const json = JSON.stringify(this.graph, null, 2);

		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, json);
		} else {
			await this.app.vault.create(path, json);
		}

		// Rotation: keep last 4 weeks
		await this.rotateBackups(backupFolder, 4);

		logger.info(`KG backup exported: ${path}`);
		return path;
	}

	/**
	 * Restore KG from backup file path. After restore, in-memory graph is replaced.
	 * Caller should reload UI / reindex if needed.
	 */
	async importBackup(filePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			throw new Error(`Backup file not found: ${filePath}`);
		}
		const raw = await this.app.vault.read(file);
		const parsed = JSON.parse(raw);
		const result = KnowledgeGraph.safeParse(parsed);
		if (!result.success) {
			throw new Error(`Backup invalid: ${result.error.message}`);
		}
		this.graph = result.data;
		await this.save();
		logger.info(`KG restored from backup: ${filePath}`);
	}

	/** Internal: keep only N most recent backup files. */
	private async rotateBackups(folder: string, keep: number): Promise<void> {
		const files = this.app.vault
			.getFiles()
			.filter(
				(f) => f.path.startsWith(folder + "/") && f.name.startsWith("kg-") && f.name.endsWith(".json")
			)
			.sort((a, b) => b.stat.mtime - a.stat.mtime);
		const toDelete = files.slice(keep);
		for (const f of toDelete) {
			try {
				await this.app.vault.delete(f);
			} catch (e) {
				logger.warn("backup rotate: delete failed", { path: f.path, error: String(e) });
			}
		}
	}

	get data(): KnowledgeGraphT {
		return this.graph;
	}

	// ─────────────────────────────────────────────────────────────
	// Upsert helpers — match by ID or alias

	upsertPerson(input: {
		name: string;
		aliases?: string[];
		role?: string;
		team?: string;
		manager?: string;
		startDate?: string;
		email?: string;
		notePath?: string;
		type?: PersonT["type"];
	}): PersonT {
		const id = slugify(input.name);
		const now = new Date().toISOString();
		let p = this.graph.people.find(
			(x) => x.id === id || x.aliases.includes(input.name) || x.name === input.name
		);
		if (p) {
			if (input.aliases) p.aliases = Array.from(new Set([...p.aliases, ...input.aliases]));
			if (input.role && !p.role) p.role = input.role;
			if (input.team && !p.team) p.team = input.team;
			if (input.manager && !p.manager) p.manager = input.manager;
			if (input.startDate && !p.startDate) p.startDate = input.startDate;
			if (input.email && !p.email) p.email = input.email;
			if (input.notePath && !p.notePath) p.notePath = input.notePath;
			if (input.type && p.type === "other") p.type = input.type;
			p.updatedAt = now;
		} else {
			p = {
				id,
				name: input.name,
				aliases: input.aliases ?? [],
				role: input.role,
				team: input.team,
				manager: input.manager,
				startDate: input.startDate,
				email: input.email,
				type: input.type ?? "other",
				encrypted: false,
				notePath: input.notePath,
				createdAt: now,
				updatedAt: now,
			};
			this.graph.people.push(p);
		}
		this.touch();
		return p;
	}

	findPersonByName(name: string): PersonT | undefined {
		const id = slugify(name);
		return this.graph.people.find(
			(p) =>
				p.id === id ||
				p.name === name ||
				p.aliases.includes(name) ||
				p.aliases.some((a) => slugify(a) === id)
		);
	}

	listPeople(): PersonT[] {
		return [...this.graph.people].sort((a, b) => a.name.localeCompare(b.name));
	}

	upsertSession(input: Omit<SessionT, "createdAt" | "updatedAt"> & { createdAt?: string }): SessionT {
		const now = new Date().toISOString();
		let s = this.graph.sessions.find((x) => x.id === input.id);
		if (s) {
			Object.assign(s, input, { updatedAt: now });
		} else {
			s = { ...input, createdAt: input.createdAt ?? now, updatedAt: now };
			this.graph.sessions.push(s);
		}
		this.touch();
		return s;
	}

	listSessionsByPerson(personId: string, since?: Date): SessionT[] {
		const sinceIso = since ? since.toISOString() : null;
		const filtered = this.graph.sessions
			.filter((s) => s.personId === personId || s.participantIds.includes(personId))
			.filter((s) => (sinceIso ? s.date >= sinceIso : true));
		return applyScope(filtered).sort((a, b) => b.date.localeCompare(a.date));
	}

	upsertActionItem(input: Omit<ActionItemT, "createdAt" | "updatedAt"> & { createdAt?: string }): ActionItemT {
		const now = new Date().toISOString();
		let a = this.graph.actionItems.find((x) => x.id === input.id);
		if (a) {
			Object.assign(a, input, { updatedAt: now });
		} else {
			a = { ...input, createdAt: input.createdAt ?? now, updatedAt: now };
			this.graph.actionItems.push(a);
		}
		this.touch();
		return a;
	}

	listOpenActionItemsForPerson(personId: string): ActionItemT[] {
		const filtered = this.graph.actionItems.filter(
			(a) => a.ownerId === personId && a.status !== "completed" && a.status !== "cancelled"
		);
		return applyScope(filtered).sort((a, b) =>
			(a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")
		);
	}

	upsertCommitment(input: Omit<CommitmentT, "createdAt" | "updatedAt"> & { createdAt?: string }): CommitmentT {
		const now = new Date().toISOString();
		let c = this.graph.commitments.find((x) => x.id === input.id);
		if (c) {
			Object.assign(c, input, { updatedAt: now });
		} else {
			c = { ...input, createdAt: input.createdAt ?? now, updatedAt: now };
			this.graph.commitments.push(c);
		}
		this.touch();
		return c;
	}

	listOpenCommitmentsBetween(madeBy: string, madeTo: string): CommitmentT[] {
		const filtered = this.graph.commitments.filter(
			(c) =>
				c.status === "open" &&
				((c.madeBy === madeBy && c.madeTo === madeTo) ||
					(c.madeBy === madeTo && c.madeTo === madeBy))
		);
		return applyScope(filtered).sort((a, b) =>
			(a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")
		);
	}

	upsertTheme(input: { name: string; sentiment?: ThemeT["sentiment"]; scope?: ThemeT["scope"]; personId?: string; sessionId?: string; }): ThemeT {
		const id = slugify(input.name);
		const now = new Date().toISOString();
		let t = this.graph.themes.find((x) => x.id === id);
		if (t) {
			t.lastSeen = now;
			t.frequency += 1;
			if (input.personId && !t.personIds.includes(input.personId)) t.personIds.push(input.personId);
			if (input.sessionId && !t.sessionIds.includes(input.sessionId)) t.sessionIds.push(input.sessionId);
			t.updatedAt = now;
		} else {
			t = {
				id,
				name: input.name,
				sentiment: input.sentiment ?? "neutral",
				scope: input.scope ?? "pessoa",
				personIds: input.personId ? [input.personId] : [],
				sessionIds: input.sessionId ? [input.sessionId] : [],
				firstSeen: now,
				lastSeen: now,
				frequency: 1,
				createdAt: now,
				updatedAt: now,
			};
			this.graph.themes.push(t);
		}
		this.touch();
		return t;
	}

	listTopThemesForPerson(personId: string, limit = 5): ThemeT[] {
		return this.graph.themes
			.filter((t) => t.personIds.includes(personId))
			.sort((a, b) => b.frequency - a.frequency)
			.slice(0, limit);
	}

	// ──────────────────────────────────────────────────────────────────
	// v0.5 — Systems

	upsertSystem(input: Partial<SystemT> & { name: string }): SystemT {
		const id = input.id ?? slugify(input.name);
		const now = new Date().toISOString();
		let s = this.graph.systems.find((x) => x.id === id);
		if (s) {
			Object.assign(s, input, { id, updatedAt: now });
		} else {
			s = {
				id,
				name: input.name,
				aliases: input.aliases ?? [],
				type: input.type ?? "other",
				vendor: input.vendor,
				ownerPersonId: input.ownerPersonId,
				status: input.status ?? "healthy",
				sla: input.sla,
				description: input.description,
				tags: input.tags ?? [],
				notePath: input.notePath,
				createdAt: input.createdAt ?? now,
				updatedAt: now,
			};
			this.graph.systems.push(s);
		}
		this.touch();
		return s;
	}

	listSystems(): SystemT[] {
		return [...this.graph.systems].sort((a, b) => a.name.localeCompare(b.name));
	}

	findSystemByName(name: string): SystemT | undefined {
		const id = slugify(name);
		return this.graph.systems.find(
			(s) => s.id === id || s.name === name || s.aliases.some((a) => slugify(a) === id)
		);
	}

	deleteSystem(id: string): boolean {
		const idx = this.graph.systems.findIndex((s) => s.id === id);
		if (idx < 0) return false;
		this.graph.systems.splice(idx, 1);
		this.touch();
		return true;
	}

	// ──────────────────────────────────────────────────────────────────
	// v0.5 — Products

	upsertProduct(input: Partial<ProductT> & { name: string }): ProductT {
		const id = input.id ?? slugify(input.name);
		const now = new Date().toISOString();
		let p = this.graph.products.find((x) => x.id === id);
		if (p) {
			Object.assign(p, input, { id, updatedAt: now });
		} else {
			p = {
				id,
				name: input.name,
				category: input.category,
				ownerPersonId: input.ownerPersonId,
				systemIds: input.systemIds ?? [],
				status: input.status ?? "active",
				description: input.description,
				notePath: input.notePath,
				createdAt: input.createdAt ?? now,
				updatedAt: now,
			};
			this.graph.products.push(p);
		}
		this.touch();
		return p;
	}

	listProducts(): ProductT[] {
		return [...this.graph.products].sort((a, b) => a.name.localeCompare(b.name));
	}

	deleteProduct(id: string): boolean {
		const idx = this.graph.products.findIndex((p) => p.id === id);
		if (idx < 0) return false;
		this.graph.products.splice(idx, 1);
		this.touch();
		return true;
	}

	// ──────────────────────────────────────────────────────────────────
	// v0.5 — Roles

	upsertRole(input: Partial<RoleT> & { title: string }): RoleT {
		const id = input.id ?? slugify(input.title);
		const now = new Date().toISOString();
		let r = this.graph.roles.find((x) => x.id === id);
		if (r) {
			Object.assign(r, input, { id, updatedAt: now });
		} else {
			r = {
				id,
				title: input.title,
				level: input.level,
				responsibilities: input.responsibilities ?? [],
				reportsToRoleId: input.reportsToRoleId,
				notePath: input.notePath,
				createdAt: input.createdAt ?? now,
				updatedAt: now,
			};
			this.graph.roles.push(r);
		}
		this.touch();
		return r;
	}

	listRoles(): RoleT[] {
		return [...this.graph.roles].sort((a, b) => a.title.localeCompare(b.title));
	}

	deleteRole(id: string): boolean {
		const idx = this.graph.roles.findIndex((r) => r.id === id);
		if (idx < 0) return false;
		this.graph.roles.splice(idx, 1);
		this.touch();
		return true;
	}

	deletePerson(id: string): boolean {
		const idx = this.graph.people.findIndex((p) => p.id === id);
		if (idx < 0) return false;
		this.graph.people.splice(idx, 1);
		this.touch();
		return true;
	}

	// ──────────────────────────────────────────────────────────────────
	// v0.7 Sprint 19 — Courses

	upsertCourse(input: Partial<CourseT> & { name: string }): CourseT {
		const id = input.id ?? slugify(input.name);
		const now = new Date().toISOString();
		// Garante array courses (migração soft de KGs antigos)
		this.graph.courses ??= [];
		let c = this.graph.courses.find((x) => x.id === id);
		if (c) {
			Object.assign(c, input, { id, updatedAt: now });
		} else {
			c = {
				id,
				name: input.name,
				provider: input.provider,
				url: input.url,
				startDate: input.startDate,
				targetEndDate: input.targetEndDate,
				status: input.status ?? "active",
				modules: input.modules ?? [],
				totalHoursEstimated: input.totalHoursEstimated,
				hoursLogged: input.hoursLogged ?? 0,
				certificateNotePath: input.certificateNotePath,
				notes: input.notes ?? [],
				flashcardDeckId: input.flashcardDeckId,
				rating: input.rating,
				takeaways: input.takeaways ?? [],
				tags: input.tags ?? [],
				notePath: input.notePath,
				createdAt: input.createdAt ?? now,
				updatedAt: now,
			};
			this.graph.courses.push(c);
		}
		this.touch();
		return c;
	}

	listCourses(): CourseT[] {
		this.graph.courses ??= [];
		return [...this.graph.courses].sort((a, b) => a.name.localeCompare(b.name));
	}

	findCourseByName(name: string): CourseT | undefined {
		this.graph.courses ??= [];
		const id = slugify(name);
		return this.graph.courses.find((c) => c.id === id || c.name === name);
	}

	deleteCourse(id: string): boolean {
		this.graph.courses ??= [];
		const idx = this.graph.courses.findIndex((c) => c.id === id);
		if (idx < 0) return false;
		this.graph.courses.splice(idx, 1);
		this.touch();
		return true;
	}

	updateCourseModule(courseId: string, moduleId: string, patch: Partial<CourseModuleT>): boolean {
		this.graph.courses ??= [];
		const c = this.graph.courses.find((x) => x.id === courseId);
		if (!c) return false;
		const m = c.modules.find((x) => x.id === moduleId);
		if (!m) return false;
		Object.assign(m, patch);
		if (patch.status === "done" && !m.completedAt) {
			m.completedAt = new Date().toISOString();
		}
		c.updatedAt = new Date().toISOString();
		this.touch();
		return true;
	}

	addCourseModule(courseId: string, mod: Partial<CourseModuleT> & { title: string }): CourseModuleT | null {
		this.graph.courses ??= [];
		const c = this.graph.courses.find((x) => x.id === courseId);
		if (!c) return null;
		const newMod: CourseModuleT = {
			id: mod.id ?? `m-${Date.now().toString(36)}`,
			title: mod.title,
			status: mod.status ?? "todo",
			completedAt: mod.completedAt,
			notePath: mod.notePath,
			estimateHours: mod.estimateHours,
		};
		c.modules.push(newMod);
		c.updatedAt = new Date().toISOString();
		this.touch();
		return newMod;
	}
}

/** v0.44 E1: ISO week number (1-53) helper for backup filenames */
function isoWeek(d: Date): number {
	const target = new Date(d.valueOf());
	const dayNr = (d.getDay() + 6) % 7;
	target.setDate(target.getDate() - dayNr + 3);
	const firstThursday = target.valueOf();
	target.setMonth(0, 1);
	if (target.getDay() !== 4) {
		target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
	}
	return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}
