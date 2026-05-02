import { App, Notice, TFile, TFolder, normalizePath } from "obsidian";
import type AtlasPlugin from "../../main";

export async function openOrCreateDailyLog(plugin: AtlasPlugin): Promise<void> {
	const app = plugin.app;
	const settings = plugin.settings;

	const today = new Date();
	const yyyy = today.getFullYear();
	const mm = String(today.getMonth() + 1).padStart(2, "0");
	const dd = String(today.getDate()).padStart(2, "0");

	const folder = `${settings.folders.daily}/${yyyy}/${mm}`;
	const fileName = `${yyyy}-${mm}-${dd}.md`;
	const path = normalizePath(`${folder}/${fileName}`);

	await ensureFolder(app, folder);

	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) {
		await app.workspace.getLeaf().openFile(existing);
		return;
	}

	const content = renderDailyLogTemplate(today, settings.user.displayName || "");
	const file = await app.vault.create(path, content);
	await app.workspace.getLeaf().openFile(file);
	new Notice("Daily log criado.");
}

async function ensureFolder(app: App, path: string): Promise<void> {
	const parts = path.split("/");
	let current = "";
	for (const p of parts) {
		current = current ? `${current}/${p}` : p;
		const exists = app.vault.getAbstractFileByPath(current);
		if (!exists) {
			await app.vault.createFolder(current);
		} else if (!(exists instanceof TFolder)) {
			throw new Error(`Caminho ${current} existe mas não é uma pasta.`);
		}
	}
}

function renderDailyLogTemplate(date: Date, _user: string): string {
	const isoDate = date.toISOString().split("T")[0];
	const ptDate = date.toLocaleDateString("pt-BR", {
		weekday: "long",
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	});
	const tomorrow = new Date(date);
	tomorrow.setDate(tomorrow.getDate() + 1);
	const tomorrowIso = tomorrow.toISOString().split("T")[0];

	return `---
date: ${isoDate}
day_of_week: ${date.toLocaleDateString("pt-BR", { weekday: "long" })}
type: daily
mood:
energy:
status: draft
tags:
  - daily
---

# 📓 Daily Log — ${ptDate}

## 🌅 Plano da manhã (3 prioridades)
- [ ]
- [ ]
- [ ]

## ⚡ Tasks vencendo hoje
\`\`\`dataview
TASK
WHERE !completed AND due <= date(today)
SORT priority DESC, due ASC
\`\`\`

## 🤝 Reuniões hoje
\`\`\`dataview
LIST
FROM "03_Meetings"
WHERE file.cday = date(today) OR contains(file.path, dateformat(date(today), "yyyy-MM-dd"))
\`\`\`

## 📝 Decisões tomadas
-

## 🚨 Escalations
-

## 🧱 Blockers
-

## 🌡️ Sentiment do time
-

## ✅ Concluído hoje
-

## 🔁 Follow-ups (com data!)
- [ ] #followup _ (@${tomorrowIso} 09:00)

## 💡 Insights / aprendizados
-

## 💭 Reflexão (3 linhas)
-

## 📊 Energia & Foco (1-5)
- Energia:
- Foco:
- Recuperação física:
`;
}
