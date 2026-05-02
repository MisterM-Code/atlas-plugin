import { Plugin, HoverParent, HoverPopover, MarkdownView } from "obsidian";
import type AtlasPlugin from "../../main";
import { isCoachPath } from "../coach/scope";

const POPOVER_SOURCE = "atlas-person-card";

/**
 * Hover sobre um wikilink [[Pessoa]] mostra mini-card com:
 *  - últimas 3 sessões
 *  - top 3 commitments abertos
 *  - top 3 temas
 *  - próximos action items
 *
 * Usa hover-link source nativo do Obsidian. Aparece como popover near link.
 */
export class HoverCardManager {
	private hoverDelay = 600; // ms

	constructor(private plugin: AtlasPlugin) {}

	register(): void {
		// hover-link event is emitted by Obsidian core but not in typed API.
		// Cast workspace.on to accept the string-typed event name.
		const wsOn = (this.plugin.app.workspace as unknown as {
			on: (name: string, cb: (e: HoverLinkEvent) => void) => unknown;
		}).on;

		const off = wsOn.call(this.plugin.app.workspace, "hover-link", (event: HoverLinkEvent) => {
			const linktext = event.linktext;
			if (!linktext) return;

			const person = this.plugin.kg.findPersonByName(linktext);
			if (!person) return;

			// Privacy: in Work Mode, never show coach-encrypted person
			if (person.encrypted && !isCoachPath(person.notePath ?? "")) {
				return;
			}

			if (event.hoverParent && event.targetEl) {
				this.attachPopover(event);
			}
		});

		// Register with plugin lifecycle for cleanup
		this.plugin.register(() => {
			if (off && typeof (off as { unsubscribe?: () => void }).unsubscribe === "function") {
				(off as { unsubscribe: () => void }).unsubscribe();
			}
		});
	}

	private attachPopover(event: HoverLinkEvent): void {
		const linktext = event.linktext;
		const person = this.plugin.kg.findPersonByName(linktext);
		if (!person) return;

		const popover = new HoverPopover(event.hoverParent, event.targetEl, this.hoverDelay);
		const container = popover.hoverEl;
		container.style.maxWidth = "380px";
		container.style.minWidth = "300px";
		container.style.padding = "12px";
		container.style.fontSize = "12px";
		container.empty();
		container.addClass("atlas-hover-card");

		// Header
		const header = container.createDiv();
		header.style.display = "flex";
		header.style.alignItems = "center";
		header.style.gap = "8px";
		header.style.marginBottom = "8px";
		header.style.paddingBottom = "8px";
		header.style.borderBottom = "1px solid var(--background-modifier-border)";

		const avatar = header.createEl("div", {
			text: getInitials(person.name),
		});
		avatar.style.width = "32px";
		avatar.style.height = "32px";
		avatar.style.borderRadius = "50%";
		avatar.style.background = stringToColor(person.name);
		avatar.style.color = "white";
		avatar.style.display = "flex";
		avatar.style.alignItems = "center";
		avatar.style.justifyContent = "center";
		avatar.style.fontWeight = "bold";
		avatar.style.fontSize = "13px";

		const titleWrap = header.createDiv();
		titleWrap.style.flexGrow = "1";
		const name = titleWrap.createEl("div", { text: person.name });
		name.style.fontWeight = "bold";
		name.style.fontSize = "13px";

		const meta = titleWrap.createEl("div");
		meta.style.fontSize = "10px";
		meta.style.opacity = "0.6";
		const parts: string[] = [];
		if (person.role) parts.push(person.role);
		if (person.type && person.type !== "other") parts.push(person.type);
		meta.setText(parts.join(" · ") || "—");

		// Sessions
		const sessions = this.plugin.kg.listSessionsByPerson(person.id).slice(0, 3);
		if (sessions.length > 0) {
			const sec = section(container, "🤝 Últimas sessões");
			for (const s of sessions) {
				const li = sec.createEl("div");
				li.style.padding = "2px 0";
				li.style.fontSize = "11px";
				const dateLabel = formatDate(s.date);
				const fwLabel = s.framework !== "adhoc" ? ` · ${s.framework}` : "";
				li.setText(`• ${dateLabel}${fwLabel}`);
			}
		}

		// Open commitments (between this person and "eu")
		const commits = this.plugin.kg.listOpenCommitmentsBetween(person.id, "eu").slice(0, 3);
		if (commits.length > 0) {
			const sec = section(container, "🔁 Commitments abertos");
			for (const c of commits) {
				const li = sec.createEl("div");
				li.style.padding = "2px 0";
				li.style.fontSize = "11px";
				const who = c.madeBy === "eu" ? "Eu" : person.name;
				const due = c.dueDate ? ` · ${formatDate(c.dueDate)}` : "";
				const truncated =
					c.text.length > 60 ? c.text.substring(0, 60) + "…" : c.text;
				li.setText(`• ${who}: "${truncated}"${due}`);
			}
		}

		// Open action items
		const actions = this.plugin.kg.listOpenActionItemsForPerson(person.id).slice(0, 3);
		if (actions.length > 0) {
			const sec = section(container, "✅ Action items pendentes");
			for (const a of actions) {
				const li = sec.createEl("div");
				li.style.padding = "2px 0";
				li.style.fontSize = "11px";
				const due = a.dueDate ? ` · ${formatDate(a.dueDate)}` : "";
				const txt =
					a.description.length > 60
						? a.description.substring(0, 60) + "…"
						: a.description;
				li.setText(`• ${txt}${due}`);
			}
		}

		// Top themes
		const themes = this.plugin.kg.listTopThemesForPerson(person.id, 3);
		if (themes.length > 0) {
			const sec = section(container, "🏷️ Temas recorrentes");
			const chips = sec.createDiv();
			chips.style.display = "flex";
			chips.style.flexWrap = "wrap";
			chips.style.gap = "4px";
			for (const t of themes) {
				const chip = chips.createEl("span");
				chip.style.padding = "2px 6px";
				chip.style.borderRadius = "4px";
				chip.style.fontSize = "10px";
				chip.style.background = sentimentColor(t.sentiment);
				chip.style.color = "white";
				chip.setText(`${t.name} (${t.frequency}×)`);
			}
		}

		// Empty state
		if (sessions.length === 0 && commits.length === 0 && actions.length === 0 && themes.length === 0) {
			const empty = container.createEl("div", {
				text: "Atlas ainda não tem dados sobre essa pessoa. Indexe o vault.",
			});
			empty.style.fontSize = "11px";
			empty.style.opacity = "0.6";
			empty.style.fontStyle = "italic";
			empty.style.padding = "8px 0";
		}

		// Footer hint
		const footer = container.createEl("div", {
			text: "Click no link para abrir a página completa",
		});
		footer.style.marginTop = "8px";
		footer.style.fontSize = "10px";
		footer.style.opacity = "0.5";
		footer.style.textAlign = "center";
	}
}

interface HoverLinkEvent {
	event: MouseEvent;
	source: string;
	hoverParent: HoverParent;
	targetEl: HTMLElement;
	linktext: string;
	sourcePath?: string;
}

function section(container: HTMLElement, title: string): HTMLDivElement {
	const wrap = container.createDiv();
	wrap.style.marginTop = "8px";
	const h = wrap.createEl("div", { text: title });
	h.style.fontWeight = "bold";
	h.style.fontSize = "10px";
	h.style.opacity = "0.7";
	h.style.marginBottom = "2px";
	const body = wrap.createDiv();
	body.style.paddingLeft = "4px";
	return body;
}

function getInitials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function stringToColor(s: string): string {
	let hash = 0;
	for (let i = 0; i < s.length; i++) {
		hash = s.charCodeAt(i) + ((hash << 5) - hash);
	}
	const h = Math.abs(hash) % 360;
	return `hsl(${h}, 60%, 45%)`;
}

function sentimentColor(sentiment: string): string {
	switch (sentiment) {
		case "blocker":
			return "#c62828";
		case "growth":
			return "#1976d2";
		case "strength":
			return "#2e7d32";
		default:
			return "#616161";
	}
}

function formatDate(iso: string): string {
	if (!iso) return "—";
	try {
		const d = new Date(iso);
		const today = new Date();
		const diffDays = Math.floor((today.getTime() - d.getTime()) / 86_400_000);
		if (diffDays === 0) return "hoje";
		if (diffDays === 1) return "ontem";
		if (diffDays < 7) return `há ${diffDays}d`;
		if (diffDays < 30) return `há ${Math.floor(diffDays / 7)}sem`;
		return d.toISOString().split("T")[0];
	} catch {
		return iso.substring(0, 10);
	}
}
