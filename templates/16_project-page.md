---
type: project
name: <% tp.user.prompt("Nome do projeto?") %>
project_type: <% tp.user.suggester(["delivery", "platform", "migration", "compliance", "tech-debt", "rd"], ["delivery", "platform", "migration", "compliance", "tech-debt", "rd"]) %>
status: active
phase: 
rag: green
owner: 
po: 
sponsor: 
start_date: <% tp.date.now("YYYY-MM-DD") %>
target_date: 
tags:
  - project
---

# 🚀 <% tp.frontmatter.name %>

**Tipo:** <% tp.frontmatter.project_type %>
**Status:** <% tp.frontmatter.status %>
**RAG:** <% tp.frontmatter.rag %>
**Owner:** [[<% tp.frontmatter.owner %>]]
**PO:** <% tp.frontmatter.po %>
**Sponsor:** <% tp.frontmatter.sponsor %>

---

## 🎯 Objetivo / value proposition
- 

## 📋 Escopo
### In scope
- 

### Out of scope
- 

## 🏗️ Fases / milestones
- [ ] **M1** — _Discovery_ — Due: _
- [ ] **M2** — _Design_ — Due: _
- [ ] **M3** — _Build_ — Due: _
- [ ] **M4** — _Deploy_ — Due: _

## 👥 Time alocado
- 

## 🚦 Status histórico
| Semana | RAG | Comentário |
|---|---|---|
| W<% tp.date.now("WW") %>-<% tp.date.now("YYYY") %> | 🟢 | _Início_ |

## ⚠️ Riscos & dependências
```dataview
LIST
FROM "07_RAID"
WHERE project = "<% tp.frontmatter.name %>"
```

## 📊 Métricas
- Velocity: _ pts/sprint
- Burn rate: _% / total
- Bugs abertos: _
- SLA atual:

## 📝 Decisões importantes (ADRs)
- 

## 🔗 Links
- Confluence:
- Jira epic:
- Repo:
- Architecture diagram:
- Stakeholder map:
