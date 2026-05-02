import cron, { ScheduledTask } from "node-cron";
import { logger } from "../utils/logger";

export interface ScheduledJob {
	id: string;
	cronExpression: string;
	description: string;
	handler: () => Promise<void> | void;
}

export class Scheduler {
	private tasks = new Map<string, ScheduledTask>();

	/** Schedule a job. Replaces if id already exists. */
	schedule(job: ScheduledJob): boolean {
		this.cancel(job.id);

		if (!cron.validate(job.cronExpression)) {
			logger.warn(`scheduler: cron inválido para ${job.id}: ${job.cronExpression}`);
			return false;
		}

		const task = cron.schedule(
			job.cronExpression,
			async () => {
				logger.info(`scheduler: rodando ${job.id}`);
				try {
					await job.handler();
				} catch (e) {
					logger.error(`scheduler: ${job.id} falhou`, { error: String(e) });
				}
			},
			{ scheduled: true, timezone: getLocalTimezone() }
		);

		this.tasks.set(job.id, task);
		logger.info(`scheduler: ${job.id} agendado (${job.cronExpression})`);
		return true;
	}

	cancel(id: string): void {
		const t = this.tasks.get(id);
		if (t) {
			t.stop();
			this.tasks.delete(id);
		}
	}

	cancelAll(): void {
		for (const id of Array.from(this.tasks.keys())) {
			this.cancel(id);
		}
	}

	listJobs(): string[] {
		return Array.from(this.tasks.keys());
	}
}

function getLocalTimezone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	} catch {
		return "America/Sao_Paulo";
	}
}

/**
 * Convert "HH:MM" + weekdays array → cron string.
 * weekdays: 0=Sun ... 6=Sat. If null, daily.
 */
export function timeToCron(timeStr: string, weekday: number | null = null): string {
	const [hStr, mStr] = timeStr.split(":");
	const h = parseInt(hStr, 10);
	const m = parseInt(mStr, 10);
	if (isNaN(h) || isNaN(m)) {
		throw new Error(`Hora inválida: ${timeStr}`);
	}
	if (weekday === null) {
		return `${m} ${h} * * *`;
	}
	return `${m} ${h} * * ${weekday}`;
}
