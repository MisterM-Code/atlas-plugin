/**
 * Atlas v0.17 — Cost tracker.
 *
 * Logs every paid API call to .atlas/spend-log.jsonl
 * Enforces budgets (daily/monthly/per-feature). Provides aggregate views.
 */

import type { App } from "obsidian";
import { logger } from "../utils/logger";
import type { ProviderId, TokenUsage, TaskKind, ProviderModel } from "./types";
import { findModel, computeCost } from "./registry";

export interface SpendEntry {
	ts: string; // ISO datetime
	provider: ProviderId;
	model: string;
	taskKind?: TaskKind;
	feature?: string;
	usage: TokenUsage;
	costUSD: number;
	success: boolean;
}

export interface BudgetSettings {
	enabled: boolean;
	monthlyUSD?: number;
	dailyUSD?: number;
	perFeatureUSD?: Record<string, number>; // { "chat-tab": 1.0, "weekly-report": 0.50, ... }
	hardCutoff: boolean; // true = throw on exceed; false = warn but allow
	warnAtPct: number; // 0.8 → warn when 80% of budget consumed
}

export interface SpendAggregate {
	periodStart: string;
	periodEnd: string;
	totalUSD: number;
	byProvider: Record<string, number>;
	byModel: Record<string, number>;
	byFeature: Record<string, number>;
	byDay: { date: string; usd: number }[];
	callCount: number;
	totalTokens: number;
}

const SPEND_LOG_PATH = ".atlas/spend-log.jsonl";

export class CostTracker {
	private cachedEntries: SpendEntry[] | null = null;
	private cacheLoadedAt = 0;
	private warnCallback: ((pctConsumed: number, budgetType: "daily" | "monthly") => void) | null = null;

	constructor(
		private readonly app: App,
		private budget: BudgetSettings = { enabled: false, hardCutoff: false, warnAtPct: 0.8 }
	) {}

	updateBudget(b: BudgetSettings): void {
		this.budget = b;
	}

	onWarn(cb: (pctConsumed: number, budgetType: "daily" | "monthly") => void): void {
		this.warnCallback = cb;
	}

	/**
	 * Log a successful API call. Cost computed via registry pricing.
	 */
	async log(params: {
		provider: ProviderId;
		model: string;
		usage: TokenUsage;
		taskKind?: TaskKind;
		feature?: string;
		success?: boolean;
	}): Promise<void> {
		const m = findModel(params.provider, params.model);
		const cost = m
			? computeCost(m, { promptTokens: params.usage.promptTokens, completionTokens: params.usage.completionTokens })
			: 0;

		const entry: SpendEntry = {
			ts: new Date().toISOString(),
			provider: params.provider,
			model: params.model,
			taskKind: params.taskKind,
			feature: params.feature,
			usage: params.usage,
			costUSD: cost,
			success: params.success ?? true,
		};

		await this.appendEntry(entry);
		this.cachedEntries = null; // invalidate

		// Warn if approaching budget
		if (this.budget.enabled && cost > 0) {
			await this.checkBudgetWarning();
		}
	}

	/**
	 * Pre-flight check before making a paid call. Throws if hardCutoff and budget exceeded.
	 */
	async checkBudget(estimatedCostUSD: number, feature?: string): Promise<{ allowed: boolean; reason?: string }> {
		if (!this.budget.enabled) return { allowed: true };

		const spent = await this.getSpend({ window: "month" });
		const dayspent = await this.getSpend({ window: "day" });

		if (this.budget.monthlyUSD && spent.totalUSD + estimatedCostUSD > this.budget.monthlyUSD) {
			const reason = `Budget mensal excedido (${spent.totalUSD.toFixed(4)} + ${estimatedCostUSD.toFixed(4)} > ${this.budget.monthlyUSD})`;
			if (this.budget.hardCutoff) return { allowed: false, reason };
		}
		if (this.budget.dailyUSD && dayspent.totalUSD + estimatedCostUSD > this.budget.dailyUSD) {
			const reason = `Budget diário excedido (${dayspent.totalUSD.toFixed(4)} + ${estimatedCostUSD.toFixed(4)} > ${this.budget.dailyUSD})`;
			if (this.budget.hardCutoff) return { allowed: false, reason };
		}
		if (feature && this.budget.perFeatureUSD?.[feature]) {
			const featureSpent = await this.getSpend({ window: "month", feature });
			const cap = this.budget.perFeatureUSD[feature];
			if (featureSpent.totalUSD + estimatedCostUSD > cap) {
				const reason = `Budget feature '${feature}' excedido (${featureSpent.totalUSD.toFixed(4)} + ${estimatedCostUSD.toFixed(4)} > ${cap})`;
				if (this.budget.hardCutoff) return { allowed: false, reason };
			}
		}
		return { allowed: true };
	}

	/**
	 * Estimate cost for a given model + token count. Used by budget pre-flight.
	 */
	estimateCost(model: ProviderModel, promptTokens: number, completionTokens: number): number {
		return computeCost(model, { promptTokens, completionTokens });
	}

	/**
	 * Aggregate spend over a window.
	 */
	async getSpend(opts: {
		window?: "day" | "week" | "month" | "year" | "all";
		startDate?: string;
		endDate?: string;
		feature?: string;
		provider?: ProviderId;
	} = {}): Promise<SpendAggregate> {
		const entries = await this.loadEntries();
		const now = new Date();
		const windowKind = opts.window ?? "month";

		const start = (() => {
			if (opts.startDate) return new Date(opts.startDate);
			if (windowKind === "day") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
			if (windowKind === "week") return new Date(now.getTime() - 7 * 86_400_000);
			if (windowKind === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
			if (windowKind === "year") return new Date(now.getFullYear(), 0, 1);
			return new Date(0);
		})();
		const end = opts.endDate ? new Date(opts.endDate) : now;

		const filtered = entries.filter((e) => {
			const t = new Date(e.ts);
			if (t < start || t > end) return false;
			if (opts.feature && e.feature !== opts.feature) return false;
			if (opts.provider && e.provider !== opts.provider) return false;
			return true;
		});

		const byProvider: Record<string, number> = {};
		const byModel: Record<string, number> = {};
		const byFeature: Record<string, number> = {};
		const byDayMap = new Map<string, number>();
		let totalUSD = 0;
		let totalTokens = 0;

		for (const e of filtered) {
			byProvider[e.provider] = (byProvider[e.provider] ?? 0) + e.costUSD;
			byModel[e.model] = (byModel[e.model] ?? 0) + e.costUSD;
			if (e.feature) byFeature[e.feature] = (byFeature[e.feature] ?? 0) + e.costUSD;
			const dayKey = e.ts.split("T")[0];
			byDayMap.set(dayKey, (byDayMap.get(dayKey) ?? 0) + e.costUSD);
			totalUSD += e.costUSD;
			totalTokens += e.usage.totalTokens;
		}

		const byDay = Array.from(byDayMap.entries())
			.map(([date, usd]) => ({ date, usd }))
			.sort((a, b) => a.date.localeCompare(b.date));

		return {
			periodStart: start.toISOString(),
			periodEnd: end.toISOString(),
			totalUSD,
			byProvider,
			byModel,
			byFeature,
			byDay,
			callCount: filtered.length,
			totalTokens,
		};
	}

	async getRecentEntries(limit = 50): Promise<SpendEntry[]> {
		const entries = await this.loadEntries();
		return entries.slice(-limit).reverse();
	}

	private async checkBudgetWarning(): Promise<void> {
		try {
			const monthSpent = await this.getSpend({ window: "month" });
			if (this.budget.monthlyUSD) {
				const pct = monthSpent.totalUSD / this.budget.monthlyUSD;
				if (pct >= this.budget.warnAtPct && this.warnCallback) {
					this.warnCallback(pct, "monthly");
				}
			}
			const daySpent = await this.getSpend({ window: "day" });
			if (this.budget.dailyUSD) {
				const pct = daySpent.totalUSD / this.budget.dailyUSD;
				if (pct >= this.budget.warnAtPct && this.warnCallback) {
					this.warnCallback(pct, "daily");
				}
			}
		} catch (e) {
			logger.warn("cost-tracker: budget warn check failed", { error: String(e) });
		}
	}

	private async appendEntry(entry: SpendEntry): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;
			const exists = await adapter.exists(SPEND_LOG_PATH);
			const line = JSON.stringify(entry) + "\n";
			if (exists) {
				const existing = await adapter.read(SPEND_LOG_PATH);
				await adapter.write(SPEND_LOG_PATH, existing + line);
			} else {
				// ensure parent
				const parent = ".atlas";
				if (!(await adapter.exists(parent))) {
					await adapter.mkdir(parent);
				}
				await adapter.write(SPEND_LOG_PATH, line);
			}
		} catch (e) {
			logger.warn("cost-tracker: append failed", { error: String(e) });
		}
	}

	private async loadEntries(): Promise<SpendEntry[]> {
		// 30s cache to avoid re-reading on every getSpend call within a render
		if (this.cachedEntries && Date.now() - this.cacheLoadedAt < 30_000) {
			return this.cachedEntries;
		}
		try {
			const adapter = this.app.vault.adapter;
			if (!(await adapter.exists(SPEND_LOG_PATH))) {
				this.cachedEntries = [];
				this.cacheLoadedAt = Date.now();
				return this.cachedEntries;
			}
			const raw = await adapter.read(SPEND_LOG_PATH);
			const lines = raw.split("\n").filter((l) => l.trim());
			const out: SpendEntry[] = [];
			for (const line of lines) {
				try {
					out.push(JSON.parse(line) as SpendEntry);
				} catch {
					// skip malformed
				}
			}
			this.cachedEntries = out;
			this.cacheLoadedAt = Date.now();
			return out;
		} catch (e) {
			logger.warn("cost-tracker: load failed", { error: String(e) });
			return [];
		}
	}
}

/**
 * Estimate token count via simple heuristic: chars / 4. Good enough for budget pre-flight.
 * Real count comes from provider response.usage.
 */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}
