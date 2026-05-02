---
type: person
name: <% tp.user.prompt("Nome completo?") %>
role: 
team: 
relationship: <% tp.user.suggester(["direct-report", "peer", "manager", "stakeholder", "coachee", "skip-level"], ["direct-report", "peer", "manager", "stakeholder", "coachee", "skip-level"]) %>
start_date: 
manager: 
location: 
encrypted: false
tags:
  - person
---

# 👤 <% tp.frontmatter.name %>

**Cargo:** <% tp.frontmatter.role %>
**Time:** <% tp.frontmatter.team %>
**Relação:** <% tp.frontmatter.relationship %>

---

## 👀 Sobre
> _Background, contexto pessoal/profissional relevante (com consentimento), interesses_
- 

## 🎯 Goals atuais (IDP / coaching agreement)
```dataview
LIST
FROM "06_People/<% tp.frontmatter.name %>"
WHERE type = "goal" AND status = "active"
```

## 🤝 Histórico de 1:1s
```dataview
TABLE date AS "Data", framework AS "Framework"
FROM "03_Meetings/1on1"
WHERE person = "<% tp.frontmatter.name %>"
SORT date DESC
```

## 🏷️ Temas recorrentes (auto-detectados pelo Atlas)
<!-- atlas-themes-start -->
<!-- atlas-themes-end -->

## ✅ Action items dela (abertos)
```dataview
TASK
WHERE !completed AND contains(text, "<% tp.frontmatter.name %>")
SORT due ASC
```

## 🔁 Meus commitments com ela
```dataview
TASK
WHERE !completed AND contains(tags, "followup") AND contains(text, "<% tp.frontmatter.name %>")
```

## 📈 Performance & growth
- Strengths observadas:
- Growth areas:
- Próxima conversa de carreira:
- Risco de retenção:

## 🌡️ Sentiment / well-being
- Última leitura:
- Tendência:
- Sinais de atenção:

## 🎓 Skills
- Atuais (forte / desenvolvendo / lacuna):
- Em desenvolvimento ativo:

## 📝 Feedbacks dados (estrutura SBI)
- 

## 📝 Feedbacks recebidos sobre ela (de pares, stakeholders)
- 

## 🔗 Links
- LinkedIn:
- Jira account:
- Email:
