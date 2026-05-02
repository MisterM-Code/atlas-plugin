import { Notice, normalizePath, TFile } from "obsidian";
import type AtlasPlugin from "../../main";

/**
 * Templates embutidos no plugin (escritos como strings para evitar dependência de bundler asset).
 * Mantidos in-sync com /templates/ folder.
 */

const TEMPLATES: Record<string, string> = {
	"01_daily-log.md": `---
date: <% tp.date.now("YYYY-MM-DD") %>
type: daily
mood:
energy:
status: draft
tags: [daily]
---

# 📓 Daily Log — <% tp.date.now("dddd, DD/MM/YYYY") %>

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
LIST FROM "03_Meetings"
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
- [ ] #followup _ (@<% tp.date.tomorrow("YYYY-MM-DD") %> 09:00)

## 💡 Insights / aprendizados
-

## 💭 Reflexão
-

## 📊 Energia & Foco (1-5)
- Energia:
- Foco:
`,
	"02_weekly-review.md": `---
type: weekly-review
week: <% tp.date.now("WW-YYYY") %>
---

# 🔄 Weekly Review — Semana <% tp.date.now("WW") %>

## 🏆 Top 3 wins da semana
1.
2.
3.

## 🪞 O que não foi tão bem
-

## 🎓 Aprendizados
-

## 🎯 Foco da próxima semana
1.
2.
3.

## 🩺 Pulse pessoal
- Energia (1-5):
- Sentimento dominante:
`,
	"03_1on1-grow.md": `---
type: 1on1
person: <% tp.user.prompt("Pessoa?") %>
date: <% tp.date.now("YYYY-MM-DD") %>
framework: GROW
status: scheduled
tags: [1on1]
---

# 1:1 com [[<% tp.frontmatter.person %>]] — <% tp.date.now("DD/MM/YYYY") %>

## 🤖 Atlas Brief
<!-- atlas-brief-start -->
<!-- atlas-brief-end -->

## 🎯 Goal
-

## 🔍 Reality
-

## 💡 Options
-

## 🏃 Will
-

## ✅ Action Items
- [ ] [[<% tp.frontmatter.person %>]] — _ (@<% tp.date.tomorrow("YYYY-MM-DD") %>)

## 🔁 Meus follow-ups
- [ ] eu — _ (@<% tp.date.tomorrow("YYYY-MM-DD") %>)

## 🏷️ Themes
#theme/

## 📌 Recall (próxima sessão)
-
`,
	"04_1on1-clear.md": `---
type: 1on1
person: <% tp.user.prompt("Pessoa?") %>
date: <% tp.date.now("YYYY-MM-DD") %>
framework: CLEAR
tags: [1on1]
---

# 1:1 com [[<% tp.frontmatter.person %>]] — <% tp.date.now("DD/MM/YYYY") %>

## 🤖 Atlas Brief
<!-- atlas-brief-start -->
<!-- atlas-brief-end -->

## 📝 Contract
-

## 👂 Listen
-

## 🔎 Explore
-

## 🏃 Action
-

## 🔄 Review
-
`,
	"05_coaching-session.md": `---
type: coaching-session
coachee: <% tp.user.prompt("Coachee?") %>
date: <% tp.date.now("YYYY-MM-DD") %>
framework: GROW
confidential: true
tags: [coaching, confidential]
---

# Sessão — [[<% tp.frontmatter.coachee %>]] — <% tp.date.now("DD/MM/YYYY") %>

> ⚠️ CONFIDENCIAL · Vault de coaching · LGPD/ICF

## 🎯 Objetivo do contrato
-

## 📌 Status
-

## 🤝 Check-in
-

## 🎯 Foco da sessão
-

## 🔍 Reality
-

## 💡 Options
-

## 🏃 Will
-

## ✨ Insights
-

## 🪞 Padrões observados (não compartilhados)
-
`,
	"06_meeting-notes.md": `---
type: meeting
title: <% tp.user.prompt("Título?") %>
date: <% tp.date.now("YYYY-MM-DD HH:mm") %>
attendees:
tags: [meeting]
---

# 📋 <% tp.frontmatter.title %>

## 👥 Participantes
-

## 📝 Agenda
1.

## 💬 Discussão
-

## ✅ Decisões
-

## 🚦 Action Items
- [ ] [Owner] — _ (@<% tp.date.tomorrow("YYYY-MM-DD") %>)
`,
	"07_status-report-weekly.md": `---
type: weekly-status
week: <% tp.date.now("WW-YYYY") %>
status: draft
generated_by: manual
tags: [report, weekly]
---

# 📊 Weekly Status — W<% tp.date.now("WW") %>

> Gere automaticamente via Command: "Atlas: Gerar weekly report agora"

## 🟢 Highlights
-

## 🔴 Lowlights
-

## 🚦 RAG Status
\`\`\`dataview
TABLE rag, comment
FROM "04_Projects"
\`\`\`

## ⚠️ Top Risks
\`\`\`dataview
LIST FROM "07_RAID/risks"
WHERE priority >= 4 AND status = "open"
LIMIT 3
\`\`\`

## 🎯 Próxima semana
-
`,
	"09_postmortem-rca.md": `---
type: postmortem
incident_id: <% tp.user.prompt("Incident ID?") %>
severity:
status: draft
tags: [incident, postmortem]
---

# 🚨 Postmortem — <% tp.frontmatter.incident_id %>

## Resumo Executivo
-

## Timeline
| Hora | Evento | Quem |
|---|---|---|

## Root Cause (5 Whys)
1. Por quê?
2. Por quê?
3. Por quê?
4. Por quê?
5. Por quê?

## Action Items
- [ ]
`,
	"10_raid-entry.md": `---
type: raid
raid_type: <% tp.user.suggester(["Risk","Issue","Decision","Dependency"], ["Risk","Issue","Decision","Dependency"]) %>
status: open
priority:
created: <% tp.date.now("YYYY-MM-DD") %>
tags: [raid]
---

# <% tp.frontmatter.raid_type %>

## Descrição
-

## Avaliação
- Probability (1-5):
- Impact (1-5):
- Priority: P1/P2/P3/P4

## Mitigation
-

## Próximo review
- (@<% tp.date.tomorrow("YYYY-MM-DD") %>)
`,
	"13_paper-note.md": `---
type: paper
citekey: <% tp.user.prompt("Citekey?") %>
title:
authors:
year:
read_status: to-read
tags: [paper, study]
---

# 📄 {{title}}

## 📋 Abstract (minha versão)
-

## 🔑 Key Points
-

## 🧠 Síntese (Feynman)
-

## 🃏 Spaced Repetition
> Comando: "Atlas: gerar flashcards desta nota"

#flashcard
Q::
A::
`,
	"15_person-page.md": `---
type: person
name: <% tp.user.prompt("Nome?") %>
role:
team:
relationship: <% tp.user.suggester(["direct-report","peer","manager","stakeholder","coachee"], ["direct-report","peer","manager","stakeholder","coachee"]) %>
tags: [person]
---

# 👤 <% tp.frontmatter.name %>

## 👀 Sobre
-

## 🎯 Goals atuais
-

## 🤝 Histórico de 1:1s
\`\`\`dataview
TABLE date AS Data, framework
FROM "03_Meetings/1on1"
WHERE person = "<% tp.frontmatter.name %>"
SORT date DESC
\`\`\`

## 🏷️ Temas recorrentes
<!-- atlas-themes-start -->
<!-- atlas-themes-end -->
`,
	"16_project-page.md": `---
type: project
name: <% tp.user.prompt("Projeto?") %>
status: active
rag: green
owner:
tags: [project]
---

# 🚀 <% tp.frontmatter.name %>

## 🎯 Objetivo
-

## 📋 Escopo
-

## 🏗️ Milestones
- [ ] M1 — _ (@_)
- [ ] M2 — _ (@_)

## 🚦 Status histórico
| Semana | RAG | Comentário |
|---|---|---|
`,
};

export interface ApplyTemplatesResult {
	created: number;
	skipped: number;
}

export async function applyTemplatesToVault(plugin: AtlasPlugin): Promise<ApplyTemplatesResult> {
	const targetFolder = "00_System/Templates";
	if (!plugin.app.vault.getAbstractFileByPath(targetFolder)) {
		await plugin.app.vault.createFolder(targetFolder);
	}

	let created = 0;
	let skipped = 0;
	for (const [name, content] of Object.entries(TEMPLATES)) {
		const path = normalizePath(`${targetFolder}/${name}`);
		const existing = plugin.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			skipped++;
			continue;
		}
		try {
			await plugin.app.vault.create(path, content);
			created++;
		} catch (e) {
			console.warn(`Atlas: falhou criar template ${name}`, e);
		}
	}

	new Notice(`Atlas: ${created} templates criados, ${skipped} já existiam.`);
	return { created, skipped };
}
