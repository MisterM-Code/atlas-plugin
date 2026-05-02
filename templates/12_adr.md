---
type: adr
adr_id: ADR-<% tp.date.now("YYYYMMDD") %>-<% tp.user.prompt("Sufixo numérico?") %>
title: <% tp.user.prompt("Título da decisão?") %>
status: proposed
date: <% tp.date.now("YYYY-MM-DD") %>
deciders: 
tags:
  - adr
  - architecture
---

# <% tp.frontmatter.adr_id %>: <% tp.frontmatter.title %>

## Status
**proposed** | accepted | superseded by [[ADR-XXX]] | deprecated

## Contexto
> _Qual problema estamos resolvendo? Por que agora? O que motivou esta decisão?_
- 

## Stakeholders consultados
- 

## Opções consideradas

### Opção A: 
- **Prós:**
- **Contras:**
- **Custo:**

### Opção B: 
- **Prós:**
- **Contras:**
- **Custo:**

### Opção C: (status quo / não fazer nada)
- **Prós:**
- **Contras:**

## Decisão
> _Escolhemos: ___ porque ___._

## Consequências

### Positivas
- 

### Negativas / trade-offs aceitos
- 

### Riscos
- 

## Compliance & regulatório
- BACEN: _OK / N/A_
- LGPD: _OK / N/A_
- Auditoria: _evidência onde_

## Implementação
- Owner: 
- Cronograma:
- Migração necessária:

## Revisão
> _Data prevista para revisitar essa decisão_
- @<% tp.date.now("YYYY") %>-12-31

## Referências
- Confluence:
- Issues relacionadas:
