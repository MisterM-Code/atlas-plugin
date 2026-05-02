---
type: weekly-status
week: <% tp.date.now("WW-YYYY") %>
period_start: <% tp.date.weekday("YYYY-MM-DD", 1) %>
period_end: <% tp.date.weekday("YYYY-MM-DD", 5) %>
sent_to: 
status: draft
generated_by: atlas
tags:
  - report
  - weekly
---

# 📊 Weekly Status Report — W<% tp.date.now("WW") %>/<% tp.date.now("YYYY") %>

> [📧 **Aprovar e enviar para gerência**](atlas://send-weekly?week=<% tp.date.now("WW-YYYY") %>)

**Período:** <% tp.date.weekday("DD/MM", 1) %> a <% tp.date.weekday("DD/MM", 5) %>
**Coordenador:** _(seu nome)_
**Time:** _(nome do squad)_

---

## 🟢 Highlights (top 3)
1. 
2. 
3. 

## 🔴 Lowlights / O que não rolou
- 

## 🚦 RAG Status — Portfolio
```dataview
TABLE rag AS "Status", phase AS "Fase", owner AS "Owner", comment AS "Comentário"
FROM "04_Projects"
WHERE rag
SORT rag DESC
```

| Projeto | Status | Comentário |
|---|---|---|
| _Projeto A_ | 🟢 Green | _On track_ |
| _Projeto B_ | 🟡 Amber | _Atrasado em milestone X_ |

## 📈 Métricas-chave
| Métrica | Esta semana | Tendência |
|---|---|---|
| Velocity | _ pts | ↑/↓/= |
| SLA compliance | _ % | ↑/↓/= |
| Open critical bugs | _ | ↑/↓/= |
| 1:1s realizadas | _ / _ planejadas | ↑/↓/= |
| Action items completion | _ % | ↑/↓/= |

![[charts/velocity-trend-W<% tp.date.now('WW') %>.png]]
![[charts/rag-grid-W<% tp.date.now('WW') %>.png]]

## ⚠️ Top 3 Risks
```dataview
TABLE description, probability AS "Prob", impact AS "Imp", mitigation AS "Mitigação"
FROM "07_RAID/risks"
WHERE status = "open" AND priority >= 4
SORT priority DESC
LIMIT 3
```

## 🆘 Asks (preciso de ajuda)
- 

## 🎯 Próxima semana — foco
1. 
2. 
3. 

## 🔗 Links
- Jira sprint board: _link_
- Confluence: _link_

---

## 📊 Detalhes (anexo)

### Incidentes da semana
```dataview
LIST
FROM "08_Incidents"
WHERE file.cday >= date(today) - duration(7 days)
```

### Compliance status
- BACEN 4.893: _OK / pendente_
- LGPD ROPA: _OK / pendente_

### Equipe
- eNPS pulse: _ /10
- Headcount: _ / _ planejado
