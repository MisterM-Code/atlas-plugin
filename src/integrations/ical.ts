/**
 * Atlas iCal integration — read-only fetcher + parser minimal.
 *
 * User cola URL .ics em settings.profile.calendarUrl
 * (Google Calendar → Settings → Integrate → secret address in iCal format).
 *
 * Atlas faz fetch periódico (1×/h por padrão), cacheia em .atlas/ical-cache.json,
 * Today widget mostra agenda do dia.
 *
 * Parser minimal — extrai só VEVENT (SUMMARY, DTSTART, DTEND, LOCATION, DESCRIPTION).
 * Não suporta RRULE complex, timezone full, ou recurring overrides — ok para MVP.
 */

import { App, normalizePath, TFile } from "obsidian";
import { logger } from "../utils/logger";

export interface IcalEvent {
	uid: string;
	summary: string;
	startsAt: string; // ISO
	endsAt: string; // ISO
	allDay: boolean;
	location?: string;
	description?: string;
	attendees?: string[];
}

interface IcalCache {
	version: 1;
	url: string;
	fetchedAt: string;
	events: IcalEvent[];
}

const CACHE_PATH_SUFFIX = "ical-cache.json";

export class IcalClient {
	constructor(private app: App, private atlasFolder: string) {}

	private get cachePath(): string {
		return normalizePath(`${this.atlasFolder}/${CACHE_PATH_SUFFIX}`);
	}

	/** Fetcha + parseia + persiste cache. Retorna events. */
	async fetchAndCache(url: string): Promise<IcalEvent[]> {
		try {
			const response = await fetch(url, {
				method: "GET",
				headers: { Accept: "text/calendar" },
			});
			if (!response.ok) {
				throw new Error(`HTTP ${response.status} ao buscar iCal`);
			}
			const ics = await response.text();
			const events = parseIcal(ics);
			await this.writeCache({ version: 1, url, fetchedAt: new Date().toISOString(), events });
			logger.info("ical: fetched", { url, count: events.length });
			return events;
		} catch (e) {
			logger.warn("ical: fetch falhou", { error: String(e) });
			return [];
		}
	}

	async loadCache(): Promise<IcalCache | null> {
		const file = this.app.vault.getAbstractFileByPath(this.cachePath);
		if (!(file instanceof TFile)) return null;
		try {
			const raw = await this.app.vault.read(file);
			const parsed = JSON.parse(raw);
			if (parsed.version === 1) return parsed;
			return null;
		} catch (e) {
			logger.warn("ical: cache load falhou", { error: String(e) });
			return null;
		}
	}

	private async writeCache(cache: IcalCache): Promise<void> {
		const json = JSON.stringify(cache, null, 2);
		try {
			const file = this.app.vault.getAbstractFileByPath(this.cachePath);
			if (file instanceof TFile) {
				await this.app.vault.modify(file, json);
			} else {
				if (!this.app.vault.getAbstractFileByPath(this.atlasFolder)) {
					await this.app.vault.createFolder(this.atlasFolder);
				}
				await this.app.vault.create(this.cachePath, json);
			}
		} catch (e) {
			logger.warn("ical: cache save falhou", { error: String(e) });
		}
	}

	/**
	 * Retorna eventos hoje (do cache).
	 */
	async eventsToday(): Promise<IcalEvent[]> {
		const cache = await this.loadCache();
		if (!cache) return [];
		const today = new Date().toISOString().split("T")[0];
		return cache.events
			.filter((e) => e.startsAt.startsWith(today))
			.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
	}

	/**
	 * Eventos próximos N minutos (pra pre-meeting nudge).
	 */
	async eventsUpcoming(minutesAhead = 15): Promise<IcalEvent[]> {
		const cache = await this.loadCache();
		if (!cache) return [];
		const now = Date.now();
		const cutoff = now + minutesAhead * 60_000;
		return cache.events.filter((e) => {
			const startMs = new Date(e.startsAt).getTime();
			return startMs >= now && startMs <= cutoff;
		});
	}
}

/**
 * Parser iCal minimal. Extrai VEVENT blocks.
 */
export function parseIcal(ics: string): IcalEvent[] {
	const events: IcalEvent[] = [];
	// Unfold lines (linhas continuadas começam com espaço/tab)
	const unfolded = ics.replace(/\r?\n[ \t]/g, "");
	const lines = unfolded.split(/\r?\n/);

	let inEvent = false;
	let current: Partial<IcalEvent> & { attendees: string[] } = { attendees: [] };

	for (const line of lines) {
		if (line === "BEGIN:VEVENT") {
			inEvent = true;
			current = { attendees: [] };
			continue;
		}
		if (line === "END:VEVENT") {
			if (current.uid && current.summary && current.startsAt && current.endsAt) {
				events.push({
					uid: current.uid,
					summary: current.summary,
					startsAt: current.startsAt,
					endsAt: current.endsAt,
					allDay: current.allDay ?? false,
					location: current.location,
					description: current.description,
					attendees: current.attendees.length > 0 ? current.attendees : undefined,
				});
			}
			inEvent = false;
			continue;
		}
		if (!inEvent) continue;

		const colonIdx = line.indexOf(":");
		if (colonIdx === -1) continue;
		const keyPart = line.substring(0, colonIdx);
		const value = line.substring(colonIdx + 1);
		const baseKey = keyPart.split(";")[0];
		const params = keyPart.split(";").slice(1);

		switch (baseKey) {
			case "UID":
				current.uid = value;
				break;
			case "SUMMARY":
				current.summary = unescapeIcalText(value);
				break;
			case "LOCATION":
				current.location = unescapeIcalText(value);
				break;
			case "DESCRIPTION":
				current.description = unescapeIcalText(value).substring(0, 500);
				break;
			case "DTSTART": {
				const isAllDay = params.some((p) => p === "VALUE=DATE");
				current.allDay = isAllDay;
				current.startsAt = parseIcalDate(value, isAllDay);
				break;
			}
			case "DTEND": {
				const isAllDay = params.some((p) => p === "VALUE=DATE");
				current.endsAt = parseIcalDate(value, isAllDay);
				break;
			}
			case "ATTENDEE": {
				// CN=Name:mailto:email@... — pegamos CN se houver, senão email
				const cnParam = params.find((p) => p.startsWith("CN="));
				const name = cnParam ? cnParam.substring(3) : value.replace(/^mailto:/, "");
				current.attendees.push(name);
				break;
			}
		}
	}

	return events;
}

function unescapeIcalText(s: string): string {
	return s.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function parseIcalDate(s: string, isAllDay: boolean): string {
	// YYYYMMDD (all-day) ou YYYYMMDDTHHmmssZ (UTC) ou YYYYMMDDTHHmmss (local)
	if (isAllDay) {
		// YYYYMMDD → YYYY-MM-DDT00:00:00Z
		const y = s.substring(0, 4);
		const m = s.substring(4, 6);
		const d = s.substring(6, 8);
		return `${y}-${m}-${d}T00:00:00.000Z`;
	}
	// YYYYMMDDTHHmmssZ
	const y = s.substring(0, 4);
	const mo = s.substring(4, 6);
	const d = s.substring(6, 8);
	const h = s.substring(9, 11);
	const mi = s.substring(11, 13);
	const se = s.substring(13, 15);
	const z = s.endsWith("Z") ? "Z" : "";
	return `${y}-${mo}-${d}T${h}:${mi}:${se}${z}`;
}
