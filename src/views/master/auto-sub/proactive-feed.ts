import type AtlasPlugin from "../../../../main";

interface ProactiveItem {
	icon: string;
	label: string;
	subject: string;
	at: string;
	severity: "low" | "medium" | "high";
}

/**
 * Atlas Percebeu sub-view — feed dos eventos detectados pela ProactiveDetector.
 *
 * Mostra: meetings 15min antes, padrões emergindo, pessoas inativas, commitments overdue.
 */
export async function renderProactiveFeedSub(
	container: HTMLElement,
	plugin: AtlasPlugin
): Promise<void> {
	container.empty();

	const intro = container.createDiv();
	intro.style.fontSize = "11px";
	intro.style.opacity = "0.7";
	intro.style.marginBottom = "12px";
	intro.setText(
		"Atlas detecta proativamente: reuniões em 15min, padrões emergindo, pessoas inativas, commitments atrasados, burnout signals. Histórico abaixo."
	);

	// Action bar
	const actions = container.createDiv();
	actions.style.display = "flex";
	actions.style.gap = "8px";
	actions.style.marginBottom = "12px";

	const checkBtn = actions.createEl("button", { text: "🔍 Rodar detecção agora" });
	checkBtn.style.fontSize = "12px";
	checkBtn.style.padding = "6px 14px";
	checkBtn.addClass("mod-cta");
	checkBtn.addEventListener("click", async () => {
		checkBtn.setText("Detectando...");
		checkBtn.disabled = true;
		try {
			await plugin.proactive.checkUpcomingMeetings(
				plugin.settings.behavior.minutesBeforeMeetingNotification
			);
			await plugin.proactive.checkEmergingPatterns();
			await plugin.proactive.checkInactivePeople();
			await plugin.proactive.checkOverdueCommitments();
		} catch {
			// continue
		}
		checkBtn.setText("🔍 Rodar detecção agora");
		checkBtn.disabled = false;
		void renderProactiveFeedSub(container, plugin);
	});

	const refreshBtn = actions.createEl("button", { text: "↻ Atualizar feed" });
	refreshBtn.style.fontSize = "11px";
	refreshBtn.style.padding = "6px 12px";
	refreshBtn.addEventListener("click", () => void renderProactiveFeedSub(container, plugin));

	// Feed
	const head = container.createEl("div", { text: "📡 Eventos disparados (últimos 30)" });
	head.style.fontSize = "10px";
	head.style.fontWeight = "bold";
	head.style.opacity = "0.7";
	head.style.marginTop = "8px";
	head.style.marginBottom = "6px";
	head.style.letterSpacing = "0.5px";

	const list = container.createDiv();
	list.style.maxHeight = "calc(100vh - 320px)";
	list.style.overflowY = "auto";

	const recent = plugin.proactive?.recent(30) ?? [];
	if (recent.length === 0) {
		const empty = list.createDiv();
		empty.style.padding = "32px 16px";
		empty.style.textAlign = "center";
		empty.style.opacity = "0.6";
		empty.setText(
			"📭 Nenhum evento detectado ainda. Click 'Rodar detecção agora' acima ou aguarde o próximo tick (cron 5min/9h diário)."
		);
		return;
	}

	const items = recent.map((r) => mapToItem(r));
	for (const item of items) {
		renderItem(list, item);
	}
}

function mapToItem(r: { kind: string; subject: string; at: string }): ProactiveItem {
	switch (r.kind) {
		case "meeting":
			return {
				icon: "🗓️",
				label: "Reunião próxima",
				subject: r.subject,
				at: r.at,
				severity: "high",
			};
		case "pattern":
			return {
				icon: "💡",
				label: "Padrão emergindo",
				subject: r.subject,
				at: r.at,
				severity: "medium",
			};
		case "inactive":
			return {
				icon: "👤",
				label: "Pessoa sem 1:1",
				subject: r.subject,
				at: r.at,
				severity: "medium",
			};
		case "commitment-overdue":
			return {
				icon: "🔁",
				label: "Commitment atrasado",
				subject: r.subject,
				at: r.at,
				severity: "high",
			};
		default:
			return {
				icon: "•",
				label: r.kind,
				subject: r.subject,
				at: r.at,
				severity: "low",
			};
	}
}

function renderItem(parent: HTMLElement, item: ProactiveItem): void {
	const card = parent.createDiv();
	card.style.display = "flex";
	card.style.alignItems = "flex-start";
	card.style.gap = "10px";
	card.style.padding = "8px 10px";
	card.style.marginBottom = "4px";
	card.style.background = "var(--background-secondary)";
	card.style.borderRadius = "4px";
	card.style.borderLeft = `3px solid ${severityColor(item.severity)}`;

	const iconEl = card.createEl("span", { text: item.icon });
	iconEl.style.fontSize = "16px";
	iconEl.style.lineHeight = "1.2";

	const wrap = card.createDiv();
	wrap.style.flexGrow = "1";
	const labelEl = wrap.createEl("div", { text: item.label });
	labelEl.style.fontSize = "11px";
	labelEl.style.fontWeight = "bold";
	const subjectEl = wrap.createEl("div", { text: item.subject });
	subjectEl.style.fontSize = "10px";
	subjectEl.style.opacity = "0.7";
	subjectEl.style.marginTop = "1px";

	const timeEl = card.createEl("span");
	timeEl.style.fontSize = "9px";
	timeEl.style.opacity = "0.55";
	timeEl.style.whiteSpace = "nowrap";
	timeEl.style.alignSelf = "center";
	timeEl.setText(relativeTime(new Date(item.at)));
}

function severityColor(s: ProactiveItem["severity"]): string {
	switch (s) {
		case "high":
			return "var(--color-red)";
		case "medium":
			return "var(--color-orange)";
		case "low":
			return "var(--color-blue)";
	}
}

function relativeTime(d: Date): string {
	const ms = Date.now() - d.getTime();
	const min = Math.floor(ms / 60_000);
	const h = Math.floor(min / 60);
	const days = Math.floor(h / 24);
	if (min < 1) return "agora";
	if (min < 60) return `há ${min} min`;
	if (h < 24) return `há ${h}h`;
	if (days < 7) return `há ${days}d`;
	return d.toLocaleDateString("pt-BR");
}
