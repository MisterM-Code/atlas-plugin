import { Notice } from "obsidian";
import axios from "axios";
import { logger } from "../utils/logger";
// v0.52.3: lazy shell — child_process só carrega quando function chama
import { runShell } from "../utils/shell";

export type Severity = "low" | "medium" | "high" | "critical";

export interface NotifyInput {
	title: string;
	message: string;
	severity?: Severity;
	channels?: ("inAppNotice" | "desktop" | "telegram" | "all")[];
	subtitle?: string;
	clickUrl?: string;
}

export interface NotificationsConfig {
	desktopEnabled: boolean;
	telegramEnabled: boolean;
	telegramBotToken: string;
	telegramChatId: string;
	minimumSeverity: Severity;
	quietHoursStart: string;
	quietHoursEnd: string;
}

const SEVERITY_RANK: Record<Severity, number> = {
	low: 0,
	medium: 1,
	high: 2,
	critical: 3,
};

let focusModeUntil: number | null = null;

export function setFocusMode(durationMin: number): void {
	if (durationMin <= 0) {
		focusModeUntil = null;
		return;
	}
	focusModeUntil = Date.now() + durationMin * 60_000;
	new Notice(`Atlas: Focus Mode ON por ${durationMin} min.`);
}

export function isFocusMode(): boolean {
	if (focusModeUntil === null) return false;
	if (Date.now() > focusModeUntil) {
		focusModeUntil = null;
		return false;
	}
	return true;
}

function isQuietHours(now: Date, start: string, end: string): boolean {
	const [sH, sM] = start.split(":").map((x) => parseInt(x, 10));
	const [eH, eM] = end.split(":").map((x) => parseInt(x, 10));
	if (isNaN(sH) || isNaN(eH)) return false;
	const minutesNow = now.getHours() * 60 + now.getMinutes();
	const sMin = sH * 60 + sM;
	const eMin = eH * 60 + eM;
	if (sMin < eMin) return minutesNow >= sMin && minutesNow < eMin;
	// crosses midnight
	return minutesNow >= sMin || minutesNow < eMin;
}

export class Notifier {
	constructor(private cfg: NotificationsConfig) {}

	updateConfig(cfg: NotificationsConfig): void {
		this.cfg = cfg;
	}

	async notify(input: NotifyInput): Promise<void> {
		const sev = input.severity ?? "low";
		const channels = input.channels ?? ["inAppNotice", "desktop"];

		// Severity filter
		if (SEVERITY_RANK[sev] < SEVERITY_RANK[this.cfg.minimumSeverity]) {
			logger.debug("notify: silenciado por severity", { sev });
			return;
		}

		// Focus mode bypass for critical only
		if (isFocusMode() && sev !== "critical") {
			logger.debug("notify: silenciado por focus mode", { title: input.title });
			return;
		}

		// Quiet hours bypass for critical only
		if (
			isQuietHours(new Date(), this.cfg.quietHoursStart, this.cfg.quietHoursEnd) &&
			sev !== "critical"
		) {
			logger.debug("notify: silenciado por quiet hours");
			return;
		}

		const wantAll = channels.includes("all");

		// In-app Notice (Obsidian)
		if (wantAll || channels.includes("inAppNotice")) {
			const duration = sev === "critical" ? 0 : sev === "high" ? 15000 : 6000;
			new Notice(`${input.title}\n${input.message}`, duration);
		}

		// Desktop native
		if (this.cfg.desktopEnabled && (wantAll || channels.includes("desktop"))) {
			await this.sendDesktop(input.title, input.message, input.subtitle);
		}

		// Telegram push
		if (
			this.cfg.telegramEnabled &&
			this.cfg.telegramBotToken &&
			this.cfg.telegramChatId &&
			(wantAll || channels.includes("telegram"))
		) {
			await this.sendTelegram(input);
		}
	}

	private async sendDesktop(title: string, message: string, subtitle?: string): Promise<void> {
		try {
			const platform = process.platform;
			if (platform === "darwin") {
				const safeTitle = title.replace(/"/g, '\\"');
				const safeMsg = message.replace(/"/g, '\\"').replace(/\n/g, " ");
				const safeSub = (subtitle ?? "Atlas").replace(/"/g, '\\"');
				const script = `display notification "${safeMsg}" with title "${safeTitle}" subtitle "${safeSub}" sound name "Submarine"`;
				await runShell(`osascript -e '${script}'`);
			} else if (platform === "win32") {
				const safeTitle = title.replace(/'/g, "''");
				const safeMsg = message.replace(/'/g, "''").replace(/\n/g, " ");
				const ps = `Add-Type -AssemblyName System.Windows.Forms; $b = New-Object System.Windows.Forms.NotifyIcon; $b.Icon = [System.Drawing.SystemIcons]::Information; $b.BalloonTipTitle = '${safeTitle}'; $b.BalloonTipText = '${safeMsg}'; $b.Visible = $true; $b.ShowBalloonTip(8000); Start-Sleep -Seconds 9; $b.Dispose()`;
				await runShell(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`);
			} else if (platform === "linux") {
				const safeTitle = title.replace(/"/g, '\\"');
				const safeMsg = message.replace(/"/g, '\\"');
				await runShell(`notify-send "${safeTitle}" "${safeMsg}"`);
			}
		} catch (e) {
			logger.warn("notify: desktop falhou", { error: String(e) });
		}
	}

	private async sendTelegram(input: NotifyInput): Promise<void> {
		try {
			const url = `https://api.telegram.org/bot${this.cfg.telegramBotToken}/sendMessage`;
			const text = `*${input.title}*\n${input.message}${input.clickUrl ? `\n\n${input.clickUrl}` : ""}`;
			await axios.post(url, {
				chat_id: this.cfg.telegramChatId,
				text,
				parse_mode: "Markdown",
			}, { timeout: 8000 });
		} catch (e) {
			logger.warn("notify: telegram falhou", { error: String(e) });
		}
	}

	async testTelegram(): Promise<{ ok: boolean; error?: string }> {
		if (!this.cfg.telegramBotToken || !this.cfg.telegramChatId) {
			return { ok: false, error: "Token ou chat_id ausente" };
		}
		try {
			const url = `https://api.telegram.org/bot${this.cfg.telegramBotToken}/sendMessage`;
			await axios.post(url, {
				chat_id: this.cfg.telegramChatId,
				text: "🧠 Atlas — teste de notificação. Tudo OK!",
			}, { timeout: 8000 });
			return { ok: true };
		} catch (e) {
			return { ok: false, error: e instanceof Error ? e.message : String(e) };
		}
	}
}
