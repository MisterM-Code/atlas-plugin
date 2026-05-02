---
date: <% tp.date.now("YYYY-MM-DD") %>
day_of_week: <% tp.date.now("dddd") %>
type: daily
mood: 
energy: 
status: draft
tags:
  - daily
---

# 📓 Daily Log — <% tp.date.now("dddd, DD/MM/YYYY") %>

## 🌅 Plano da manhã (3 prioridades)
- [ ] 
- [ ] 
- [ ] 

## ⚡ Tasks vencendo hoje
```dataview
TASK
WHERE !completed AND due <= date(today)
SORT priority DESC, due ASC
```

## 🤝 Reuniões hoje
```dataview
LIST
FROM "03_Meetings"
WHERE file.cday = date(today) OR contains(file.path, dateformat(date(today), "yyyy-MM-dd"))
```

## 📝 Decisões tomadas
- 

## 🚨 Escalations
- 

## 🧱 Blockers
- 

## 🌡️ Sentiment do time (pulse rápido)
> _Quem parece OK / cansado / engajado / preocupado hoje?_
- 

## ✅ Concluído hoje
- 

## 🔁 Follow-ups (vão virar tasks com data!)
> Use `(@AAAA-MM-DD HH:MM)` para Atlas notificar você
- [ ] #followup _ (@<% tp.date.tomorrow("YYYY-MM-DD") %> 09:00)

## 💡 Insights / aprendizados
- 

## 💭 Reflexão (3 linhas)
- 

## 📊 Energia & Foco (1-5)
- Energia: 
- Foco: 
- Recuperação física:
