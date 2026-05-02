---
type: weekly-review
week: <% tp.date.now("WW-YYYY") %>
period_start: <% tp.date.weekday("YYYY-MM-DD", 1) %>
period_end: <% tp.date.weekday("YYYY-MM-DD", 5) %>
---

# 🔄 Weekly Review — Semana <% tp.date.now("WW") %> / <% tp.date.now("YYYY") %>

> Tempo recomendado: 30-45 min, sexta tarde ou domingo manhã

## 1. 🎯 Revisão de OKRs
```dataview
TABLE objective, kr, score, confidence
FROM "11_Metrics" 
WHERE quarter = "Q<% Math.ceil((tp.date.now('M', 0) ) / 3) %>"
```

## 2. 📅 Reuniões da semana
```dataview
LIST
FROM "03_Meetings"
WHERE file.cday >= date(today) - duration(7 days)
SORT file.cday DESC
```

## 3. ✅ Tasks concluídas
```dataview
TASK
WHERE completed AND completion >= date(today) - duration(7 days)
GROUP BY file.folder
```

## 4. 🚧 Tasks ainda abertas (top 10)
```dataview
TASK
WHERE !completed
SORT priority DESC, due ASC
LIMIT 10
```

## 5. 🌡️ Pulse do time
- O que foi mencionado mais de 1x em 1:1s essa semana?
- Quem está em risco? (cansado, desengajado, bloqueado)
- Quem teve breakthrough?

## 6. ⚠️ RAID em revisão
```dataview
LIST
FROM "07_RAID"
WHERE status = "open"
SORT priority DESC
LIMIT 5
```

## 7. 🏆 Top 3 wins da semana
1. 
2. 
3. 

## 8. 🪞 O que não foi tão bem
- 

## 9. 🎓 Aprendizados
- 

## 10. 🎯 Foco da próxima semana (3 prioridades)
1. 
2. 
3. 

## 11. 💌 Quem agradecer / dar feedback
- 

## 12. 🩺 Pulse pessoal
- Energia geral (1-5):
- Sentimento dominante:
- O que precisa de cuidado essa próxima semana:
