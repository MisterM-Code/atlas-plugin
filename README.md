# 🧠 Atlas v0.7 — Jarvis Edition

> _"Ele não esquece. Ele resume. Ele relata. Ele pergunta. Ele ensina."_

**Atlas** transforma seu vault Obsidian num **assistente proativo** para 15 perfis profissionais (TI, Coordenador, Produto, Design, Marketing, Vendas, Coach, RH, Financeiro, Jurídico, Saúde, Educação, Pesquisa, Estudante, Pessoal). 100% local via Ollama — privacidade absoluta.

---

## 🚀 Como instalar (5 minutos)

### Pré-requisitos
1. **Obsidian** ≥ 1.5.0 — [download](https://obsidian.md)
2. **Ollama** — [download](https://ollama.com/download) (Mac/Win/Linux, instalação 1 click)

### Passo a passo

1. Instale o plugin **BRAT** no Obsidian:
   - Settings → Community plugins → Browse → buscar "BRAT" → Install + Enable

2. No BRAT, adicione Atlas como beta plugin:
   - `Cmd+P` → "BRAT: Add a beta plugin with frozen version"
   - Cole: `https://github.com/MisterM-Code/atlas-plugin`
   - Selecione versão **v0.7.0** (ou "Latest version")

3. Settings → Community plugins → habilite **"Atlas"** ✅

4. Atlas inicia o **onboarding wizard** automaticamente (11 telas, 5 min):
   - Welcome
   - **Profile** (escolha 1+ de 15 perfis profissionais)
   - **Workflow** (briefing time, weekly day, quiet hours)
   - **Goals** (o que mais te ajudaria primeiro)
   - Vault structure
   - Ollama (auto-detect + pull modelos recomendados pra sua RAM)
   - Color theme
   - Email (opcional)
   - Telegram (opcional)
   - Calendar URL (iCal opcional)
   - Done!

Pronto. Click no ícone 🧠 do ribbon ou aperte `Cmd+Shift+O` pra abrir a Master Sidebar.

---

## ✨ O que vem em v0.7

### 📐 Master Sidebar com 15 tabs

| Tab | Sub-tabs | O que faz |
|---|---|---|
| ☀️ **Today** | — | Dashboard rico: stats, agenda (iCal+vault), tasks, themes, flashcards, **Achievements widget** com level/streak/badges/tour picker |
| 💬 **Chat** | — | Atlas Chat com KG + memória + skeleton loader + typing effect |
| ✅ **Hub** | — | Action Items consolidados com filtros (hoje/atrasadas/semana) |
| 🔗 **Suggest** | — | Smart link suggestions live durante edição |
| 🌐 **Knowledge** | Pessoas \| Projetos \| Temas \| Tudo | Grid de cards do KG |
| 🖥️ **Sistemas** | — | CRUD: PIX, Stripe, apps internos com auto-detection em notas |
| 📦 **Produtos** | — | Portfolio com sistemas associados |
| 🎓 **Cargos** | — | Cargos padronizados do time |
| 🎙️ **Reports** | Timeline \| Composer \| Templates | Reports gerados + composer multi-dim + visual template editor |
| 📈 **Analytics** | Heatmap \| Trends \| KG Graph \| Mood | **ECharts** dashboards (force-directed graph, 365-day calendar, radar mensal) |
| 🧪 **Lab** | Tools IA \| Serendipity \| Capsules \| Tree | 15 ferramentas IA agrupadas em 6 categorias |
| 🤖 **Auto** | Tagger \| Aliaser \| Rules \| Atlas Percebeu | Monitor das automações silenciosas |
| 🃏 **Study** | Flashcards \| Cursos \| Papers | **Course Manager** com módulos checkable |
| 🩺 **Health** | — | Workspace health score |
| ⚙️ **Status** | Diagnóstico \| Catálogo | Ollama + RAM + **15 modelos curados pra pull** |

### 🛠️ 15 Tools IA (Lab tab → Tools IA, filtradas por perfil)

**Reasoning:** 🧠 Pense comigo (CoT) · ⚰️ Pre-mortem Oracle
**TI · Arquitetura:** 🏗️ Architecture Diagram (Mermaid C4) · 📊 Flow Chart Generator
**TI · Documentação:** 📜 ADR Generator (Michael Nygard) · 🚑 Runbook Generator (SRE) · 🚨 Postmortem Builder (blameless 5-whys) · 📘 API Doc Extractor
**TI · Análise:** 💸 Tech Debt Scanner · 👥 Capacity Planner
**Síntese:** 🔮 Context Collapse · 📔 Decision Diary · 🎉 Year in Review (Atlas Wrapped)
**Escrita:** 📋 Manager README · 🎙️ Podcast NPR-style

### ⚡ Performance & Stack

- **main.js** ~1.76 MB minified (ECharts tree-shaken)
- **TypeScript strict** zero erros
- **15 modelos curados** com recomendação dinâmica por RAM (qwen 0.5B/1.5B/7B/14B/32B, llama 1B/3B/8B, phi-4-mini, phi-4, gemma2, bge-m3, bge-reranker, llama3.2-vision)
- **15 perfis profissionais** com toolset adaptativo
- Animations Web Animations API (zero KB) + canvas-confetti (6 KB)

---

## 🔐 Privacidade

100% local. Default zero network calls externos. Veja [PRIVACY.md](./PRIVACY.md) para threat model completo.

---

## 🏗️ Arquitetura

```
📓 Obsidian (a única coisa que ele abre)
   ├─ Plugin Atlas (TypeScript ~1.76 MB)
   ├─ Master Sidebar com 15 tabs
   ├─ Notifications nativas + Telegram (opt-in)
   └─ Settings tab embutido
        ↕ HTTP localhost:11434
🤖 Ollama (gerencia modelos local)
   ├─ qwen2.5:7b ou qwen2.5:14b (geração)
   ├─ phi-4-mini (small / classification)
   ├─ bge-m3 (embeddings PT-BR)
   ├─ bge-reranker-v2-m3 (rerank)
   └─ llama3.2-vision (opt-in)
```

Hardware mínimo: **8 GB RAM** (Atlas pula automaticamente para qwen2.5:1.5b + phi-4-mini). Recomendado: **16 GB RAM** para qwen2.5:7b. Premium: **32 GB RAM** para qwen2.5:14b.

---

## 📚 Documentação

- [CHANGELOG.md](./CHANGELOG.md) — histórico de versões
- [PRIVACY.md](./PRIVACY.md) — privacidade & threat model
- [docs/](./docs/) — guias

---

## 🤝 Contribuir

Issues + PRs bem-vindos. Roadmap v0.8 em discussão:
- Sprint 16: Streaming chat token-by-token + Voice (whisper input + Piper output + Vosk hotword "Atlas")
- Submit oficial em obsidian-releases (community plugins)
- 14 templates de meeting (standup, retro, planning, kickoff, qbr, ...)
- Auto-install Ollama + auto-pull stack
- Right-to-be-forgotten command (LGPD)

---

## 📜 Licença

MIT © Miguel Veríssimo

---

## ☕ Apoie

Se Atlas economizou 2-6 horas/semana da sua vida, considere [virar sponsor](https://github.com/sponsors/MisterM-Code).
