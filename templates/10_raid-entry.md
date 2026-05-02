---
type: raid
raid_type: <% tp.user.suggester(["Risk", "Assumption", "Issue", "Decision", "Dependency"], ["Risk", "Assumption", "Issue", "Decision", "Dependency"]) %>
raid_id: <% tp.date.now("YYYYMMDD") %>-<% tp.user.prompt("Sufixo numérico (ex: 001)?") %>
status: open
priority: 
created: <% tp.date.now("YYYY-MM-DD") %>
owner: 
project: 
tags:
  - raid
---

# <% tp.frontmatter.raid_type %> — <% tp.frontmatter.raid_id %>

## 📝 Descrição (1 parágrafo)
- 

## 📊 Avaliação
- **Probability** (1-5): _
- **Impact** (1-5): _
- **Score** (P × I): _
- **Priority**: P1 / P2 / P3 / P4

## 🎯 Mitigation Plan
- 

## 🆘 Contingency Plan (se materializar)
- 

## 👤 Owner
- [[<% tp.frontmatter.owner %>]]

## 📅 Datas
- **Identificado em:** <% tp.date.now("YYYY-MM-DD") %>
- **Próximo review:** _(@<% tp.date.tomorrow("YYYY-MM-DD") %>)_
- **Vence em:** 

## 🔗 Projeto / contexto
- [[<% tp.frontmatter.project %>]]

## 📜 Histórico
| Data | Status | Comentário |
|---|---|---|
| <% tp.date.now("YYYY-MM-DD") %> | Open | _Criado_ |
