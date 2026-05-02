# Atlas — Local-first Second Brain for Obsidian

> _"It doesn't forget. It summarizes. It reports. It asks. It teaches."_

[![Latest release](https://img.shields.io/github/v/release/MisterM-Code/atlas-plugin?display_name=tag)](https://github.com/MisterM-Code/atlas-plugin/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-1.5%2B-7c3aed)](https://obsidian.md)
[![100% local](https://img.shields.io/badge/AI-100%25%20local%20via%20Ollama-22c55e)](https://ollama.com)

**Atlas** turns your Obsidian vault into a proactive personal assistant. It captures, links, summarizes, generates reports, and answers questions about your notes — all running **100% locally** via [Ollama](https://ollama.com), so your data never leaves your machine.

Built for **15 professional profiles** out of the box (engineering, product, design, marketing, sales, coaching, HR, finance, legal, healthcare, education, research, student, and more), Atlas adapts its templates, AI tools, and metrics to who you are.

---

## ✨ Highlights

- **🧠 Jarvis voice mode** — full-screen modal with animated orb. Push-to-talk creates entities ("create person João, direct-report, team Payments" → cadastrado in your KG).
- **💬 Chat with tool calling** — Atlas's chat agent can mutate your vault: create person/system/product/role/course, schedule meetings, compose email, set reminders. Same permissions as voice.
- **📥 Frictionless capture** — `Cmd+Shift+A` from any app opens a modal. Natural-language dates ("sexta 14h"). Voice notes via whisper.cpp.
- **🌐 Knowledge Graph** — auto-extracts people, projects, themes, action items, commitments from your notes. Hybrid retrieval (BM25 + embeddings + reranker).
- **📊 Weekly reports auto** — Friday 4 PM, Atlas generates an executive markdown + PDF with charts. One-click email.
- **📈 Analytics dashboard** — ECharts-powered: 365-day heatmap, trends, force-directed KG graph, mood timeline.
- **🤝 Pre-meeting briefs** — 15 minutes before any 1:1, Atlas surfaces last sessions, open commitments, recurring themes.
- **🔔 Reminders tab** — countdown live, snooze, complete, with desktop + Telegram + email notifications.
- **🃏 Spaced repetition** — FSRS-4.5 algorithm. Auto-generate flashcards from notes. Sync to Anki.
- **🎓 Course manager** — track modules, hours, certificates, takeaways across courses you're taking.
- **🔐 100% local** — no telemetry, no external API calls (except optional opt-in: SMTP, Telegram bot, iCal URL you provide).

---

## 🚀 Installation

### Prerequisites

1. **Obsidian** ≥ 1.5.0 — [download](https://obsidian.md)
2. **Ollama** running locally — [download](https://ollama.com/download) (1-click installer for macOS/Windows/Linux)

### Beta install via BRAT (recommended for now)

1. Install **BRAT** plugin: Settings → Community plugins → Browse → search "BRAT" → Install + Enable
2. `Cmd/Ctrl+P` → "BRAT: Add a beta plugin with frozen version"
3. Paste: `https://github.com/MisterM-Code/atlas-plugin`
4. Pick **0.9.0** (or "Latest version")
5. Settings → Community plugins → enable **Atlas** ✅

### First run (5 minutes)

The 11-screen onboarding wizard runs automatically:

1. Welcome
2. **Profile** — pick 1+ of 15 profiles (engineer, coordinator, coach, student, etc.)
3. **Workflow** — briefing time, weekly day, quiet hours
4. **Goals** — what you want help with first
5. Vault structure
6. Ollama — auto-detect + pull recommended models for your RAM
7. Color theme
8. Email (SMTP, optional)
9. Telegram bot (optional, mobile push)
10. Calendar URL (iCal read-only, optional)
11. Done

Click the brain icon in the ribbon or open the command palette to start using Atlas.

---

## 📐 Master Sidebar

A single side panel with 16 tabs replaces a dozen smaller plugins:

| Tab | What it does |
|---|---|
| ☀️ Today | Dashboard: tasks, agenda (vault + iCal), themes, flashcards, achievement widget with streak/badges |
| 💬 Chat | RAG chat with KG citations, streaming tokens, tool calling for mutations |
| ✅ Hub | All open action items consolidated, filtered by today/overdue/week |
| 🔔 Reminders | Countdown live, snooze, complete |
| 🔗 Suggest | Smart link suggestions while you write |
| 🌐 Knowledge | People · Projects · Themes — searchable card grid |
| 🖥️ Systems | CRUD for systems you manage (PIX, Stripe, internal tools), with auto-detection in your notes |
| 📦 Products | Portfolio with associated systems |
| 🎓 Roles | Standardized titles |
| 🎙️ Reports | Timeline · Composer (multi-dim filters) · Templates (visual editor) |
| 📈 Analytics | Heatmap · Trends · KG Graph (Cytoscape) · Mood radar (ECharts) |
| 🧪 Lab | 15+ AI tools grouped by category (reasoning, architecture, docs, analysis, writing, media) |
| 🤖 Auto | Tagger · Aliaser · Rules · Atlas Percebeu monitoring |
| 🃏 Study | Flashcards · Courses · Papers |
| 🩺 Health | Workspace health score |
| ⚙️ Status | Ollama daemon · RAM · model catalog |

---

## 🛠️ AI Tools (15+)

Filtered by your active profile. Reasoning: chain-of-thought, pre-mortem oracle. Architecture: C4 diagrams (Mermaid), flow charts. Documentation: ADR generator, runbook (SRE), postmortem (blameless 5-whys), API doc extractor. Analysis: tech-debt scanner, capacity planner. Synthesis: context collapse, decision diary, year-in-review. Writing: manager README, NPR-style podcast generator. And more.

---

## 🎙️ Voice & Jarvis mode

`Cmd+Shift+J` opens Jarvis: a full-screen modal with a 200px animated orb. Push-to-talk (hold `Space`) records, transcribes via whisper.cpp, and dispatches the command:

- **"Atlas, create person João, direct-report, team Payments"** → KG entry
- **"Atlas, create system PIX, vendor BCB"** → system cadastrado
- **"Atlas, schedule meeting with Maria tomorrow 2 PM"** → meeting note created
- **"Atlas, send email to João about Friday confirmation"** → compose modal pre-filled
- **"Atlas, switch to coach profile"** → tools/templates re-applied
- **"Atlas, capture: buy milk tomorrow"** → task in inbox with parsed due date
- **"Atlas, status"** → spoken briefing of overdue/today/flashcards

The same 12 tool handlers used by voice are exposed to the chat agent via Ollama's function calling API. The chat can also mutate your vault.

---

## 🔐 Privacy

**100% local** by default. Atlas does **not** make external network calls except:

- Ollama at `localhost:11434` (your local LLM)
- Optional, opt-in only: your configured SMTP server (email), Telegram bot API (mobile push), the iCal URL you provided (calendar sync)

There is no telemetry, no analytics, no remote crash reporting. Your KG (`.atlas/kg.json`), embeddings, audit log all live inside your vault. Right-to-be-forgotten is one command.

See [PRIVACY.md](./PRIVACY.md) for the full threat model.

---

## 🏗️ Architecture

```
📓 Obsidian
   ├─ Atlas plugin (TypeScript ~1.8 MB)
   ├─ Master Sidebar (16 tabs)
   ├─ Native notifications + Telegram (opt-in)
   └─ Settings tab built-in
        ↕ HTTP localhost:11434
🤖 Ollama (manages models locally)
   ├─ Generation: qwen2.5:7b / 14b / 32b
   ├─ Light: phi-4-mini (auto-tagging, classification)
   ├─ Embeddings: bge-m3 (PT/EN/multilingual)
   ├─ Reranker: bge-reranker-v2-m3
   └─ Vision (optional): llama3.2-vision
```

**Hardware** — 8 GB RAM minimum (Atlas auto-falls-back to qwen2.5:1.5b + phi-4-mini). 16 GB recommended. 32 GB premium.

---

## 🎯 Compatibility

- **Obsidian** ≥ 1.5.0 (Bases support)
- **Desktop only** (Electron Node APIs are required for child_process, nodemailer, etc.)
- macOS / Windows / Linux

---

## 📚 Docs

- [CHANGELOG.md](./CHANGELOG.md) — version history
- [PRIVACY.md](./PRIVACY.md) — threat model & data handling
- [docs/](./docs/) — deeper guides

---

## 🤝 Contributing

Issues and PRs welcome. The project is single-maintainer at the moment; please open an issue first for large changes.

---

## 📜 License

MIT © Miguel Veríssimo

---

## ☕ Support

If Atlas saves you 2-6 hours a week, consider [becoming a sponsor](https://github.com/sponsors/MisterM-Code).
