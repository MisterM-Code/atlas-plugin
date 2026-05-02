---
type: theme
name: <% tp.user.prompt("Nome do tema (ex: carga-trabalho)?") %>
sentiment: <% tp.user.suggester(["blocker", "strength", "growth", "neutral"], ["blocker", "strength", "growth", "neutral"]) %>
scope: <% tp.user.suggester(["pessoa", "time", "cross-team"], ["pessoa", "time", "cross-team"]) %>
first_seen: <% tp.date.now("YYYY-MM-DD") %>
last_seen: <% tp.date.now("YYYY-MM-DD") %>
status: active
tags:
  - theme
---

# 🏷️ Theme: <% tp.frontmatter.name %>

**Sentiment:** <% tp.frontmatter.sentiment %>
**Scope:** <% tp.frontmatter.scope %>
**First seen:** <% tp.frontmatter.first_seen %>
**Last seen:** <% tp.frontmatter.last_seen %>

---

## 📝 Descrição
> _O que é esse tema? Como se manifesta?_
- 

## 👥 Pessoas afetadas
- [[Pessoa A]]
- [[Pessoa B]]

## 📅 Timeline de menções (auto-detectado)
<!-- atlas-mentions-start -->
<!-- atlas-mentions-end -->

## 📊 Frequência
- Total de menções: _
- Menções últimos 30 dias: _
- Tendência: ↑ / ↓ / =

## 🎯 Hipóteses de causa
- 

## 🛠️ Intervenções tentadas
| Data | Ação | Resultado |
|---|---|---|
| _ | _ | _ |

## 📌 Próximos passos
- 

## 🔗 Conexões com outros temas
- Relacionado a: [[Theme X]]
- Bloqueia: [[Theme Y]]
- Causa de: [[Theme Z]]
