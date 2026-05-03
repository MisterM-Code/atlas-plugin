<div align="center">

# 🌌 Atlas

### Your Iron Man HUD for Obsidian — local-first AI second brain.

> *"It doesn't forget. It summarizes. It reports. It asks. It teaches. Voice. Vision. Memory."*

[![Latest release](https://img.shields.io/github/v/release/MisterM-Code/atlas-plugin?display_name=tag&color=00e5e5&style=for-the-badge)](https://github.com/MisterM-Code/atlas-plugin/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-6366f1?style=for-the-badge)](./LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-1.5%2B-7c3aed?style=for-the-badge&logo=obsidian)](https://obsidian.md)
[![100% Local](https://img.shields.io/badge/AI-100%25_local_via_Ollama-22c55e?style=for-the-badge)](https://ollama.com)
[![Bilingual](https://img.shields.io/badge/i18n-PT--BR_%2B_EN-f59e0b?style=for-the-badge)](#-bilingual--customizable)

```
                    ╭──────────────────╮
                    │   ◯─◯─◯─◯─◯─◯   │
                    │  ╱  ATLAS HUD ╲  │
                    │  ╲  ▁▃▅▇▅▃▁  ╱  │
                    │   ╲___________╱   │
                    ╰──────────────────╯
            local · private · adaptive · proactive
```

</div>

---

## 🚀 What is Atlas?

**Atlas** turns your Obsidian vault into a proactive AI co-pilot — a *second brain* that **listens, watches, remembers, and acts**.

Speak to it. Type to it. It creates documents. It categorizes. It opens files. It cites real notes. It generates weekly reports. It detects patterns across hundreds of meetings. It runs **100% on your machine** via [Ollama](https://ollama.com) — or pluggable into 9 cloud providers (OpenAI / Anthropic / Google / Mistral / xAI / OpenRouter / Groq / DeepSeek / Cohere) with **per-feature cost tracking + budget gates**.

Built for **15 professional profiles** out of the box: engineering, product, design, marketing, sales, coaching, HR, finance, legal, healthcare, education, research, student, manager, hybrid.

---

## ⚡ Highlights

| Feature | What it does |
|---|---|
| 🎙️ **Jarvis voice mode** | Full-screen modal with animated orb (cyan glow + breathing). Push-to-talk creates entities. *"Create person João, direct-report, team Payments"* → registered in your KG. |
| 💬 **Chat with tool calling** | Agent mutates your vault: create person/system/product/role/course, schedule meetings, compose emails, set reminders, **create_note** with auto-categorization + auto-open. |
| 📥 **Frictionless capture** | `Cmd+Shift+A` from *any app* → modal. Natural-language dates (*"friday 14h"*). Voice via whisper.cpp + Web Speech fallback. |
| 🪟 **Cockpit popout** | OS-level Electron window — multi-monitor, always-on-top toggle, Iron Man HUD aesthetic. Voice + chat strip persistent. |
| 📥 **Vault Importer Wizard** | Migrate 100-1000 notes from external vaults / Notion / Roam / Logseq with **auto-detection** (UUID strip + frontmatter conversion) + **6-stage review pipeline** + cost <$0.10 per 500 notes. |
| 🌐 **Knowledge Graph** | People, projects, themes, systems, products, courses, roles auto-extracted via LLM with **citation whitelist** (real paths validated against vault). |
| 🚦 **Smart routing** | `complexityHint: simple\|complex` auto-downgrades Sonnet→Haiku, GPT-4o→mini for 12-16× cheaper calls without quality loss. |
| 📊 **ECharts analytics** | Heatmap (365-day grid), Trends (KG growth + sessions/week + themes), KG Graph (force-directed Cytoscape), Mood radar from daily logs. |
| 🎓 **Course manager** | Track courses, modules, certificates + spaced repetition flashcards (FSRS-4.5) + Anki Mobile sync. |
| 🩺 **Health dashboard** | 7-system live check (Ollama / Cost / Router / LLM / KG / Whisper / Cloud) — visible in Settings. |

---

## 🌐 Bilingual & Customizable

- **PT-BR + EN** — runtime switch via `Settings → Atlas → 🌐 Idioma da interface`. Re-renders without reload.
- **~354 i18n keys** covering ~99% of UX strings.
- **Color theme** picker (cyan / indigo / orange / rose / forest) — applied dynamically via CSS variables.
- **15 professional profiles** with adaptive toolset, templates, frameworks, and KPIs.

---

## 🎨 Visual System — Iron Man HUD aesthetic

- **Color palette**: cyan `#00e5e5` × indigo `#6366f1` gradients
- **Backdrop**: deep navy `#050B18 → #000510` cosmic gradient
- **Animations**: GSAP slide-ins, breathing logo, orb pulses, sonar rings, particle systems (200+ with glow + trails + parallax)
- **Audio**: synthetic Web Audio FX (ding / whoosh / success / error) + Piper TTS for voice output
- **Premium polish**: cards with hover lift + accent line, message bubbles with bouncy slide-in, mic button red pulse during recording, send button gradient with hover scale

```
        ╔════════════════════════════════════════╗
        ║  ░░░░  cyan.glow ──── indigo.flow  ░░░░  ║
        ║  ▁▃▅▇█  voice.wave  █▇▅▃▁              ║
        ║  ◐ ◓ ◑ ◒  jarvis.thinking               ║
        ╚════════════════════════════════════════╝
```

---

## 🛠️ Capabilities Matrix

### 📝 Document creation (chat OR voice)
- `"Create a daily log for today"` → `02_Daily/2026-05-03.md` + auto-open
- `"Generate weekly report on Q2 sales"` → `04_Reports/weekly/2026-05-03-q2-sales.md` (slugified)
- `"Create ADR about adopting Postgres"` → `09_Knowledge/adrs/...md`
- 12 noteTypes: daily / 1on1 / meeting / weekly-status / project / raid / incident / adr / paper / course / knowledge / inbox

### 🤖 14 agentic tools
| Tool | Mutates |
|---|---|
| `create_person` / `create_system` / `create_product` / `create_role` / `create_course` | Knowledge Graph entities |
| `create_note` ⭐ | Markdown file + folder + auto-open |
| `create_action_item` / `create_reminder` | Hub + Reminders tab |
| `schedule_meeting` | Meeting note with attendees + agenda |
| `compose_email` | SMTP send via nodemailer |
| `report_person_sessions` | Aggregated person report |
| `aggregate_systems_by_period` | System mentions across timeframe |
| `forget_person` (RTBF) | LGPD-compliant deletion |
| `index_vault` | Embeddings + KG refresh |
| `switch_profile` | Adaptive toolset swap |

### 🎙️ Voice mode (Jarvis)
- **Whisper.cpp** local (auto-detect Homebrew paths) OR **Web Speech API** browser fallback
- Push-to-talk via Spacebar in Jarvis modal
- 14 voice commands: capture, daily, status, lembrar, criar pessoa/sistema/produto/cargo/curso/nota/relatório, mandar email, agendar reunião, trocar perfil
- **Piper TTS** for assistant responses (toggle 🔊 in chat)

### 📥 Vault Importer Wizard
- **6 stages**: Scan → Classify (heuristic, zero-LLM) → Extract (LLM only if confidence<0.7) → Categorize → Move (preserves backlinks via fileManager.renameFile) → Index
- **7 review screens**: source picker → categories table → people detected → systems detected → tags + themes → folder mapping → final config
- **Source format auto-detection**: Notion (UUID strip + frontmatter conversion) / Roam (JSON parser) / Logseq (journals/pages) / Obsidian
- **Conflict resolution**: filename suffix `-imported-N` + broken-link comments + archive on collision
- **Cost ~$0.10 for 500 notes** with cloud Haiku routing

### 🚦 Smart cost routing (cloud opt-in)
- 9 providers: OpenAI / Anthropic / Google / Mistral / xAI / OpenRouter / Groq / DeepSeek / Cohere
- Per-task routing: `chat / reasoning / embedding / vision / summarization / extraction`
- `complexityHint`: simple → Haiku/mini, complex → Sonnet/Opus
- **Per-feature cost tracking** (`feature: "kg.extractor" / "agent.chat"`) with daily/monthly budget + soft warn + hard cutoff
- Spend dashboard with ECharts breakdowns by day/provider/feature/task

### 🔐 Privacy & security
- **100% local** by default via Ollama
- **Coach mode** isolation (separate vault scope, audit-friendly)
- **Audit log** SHA-256 hash chain in `.atlas/audit.jsonl`
- **Light encryption** for SMTP password / Telegram token
- **No telemetry** — zero outbound network calls without explicit user opt-in

---

## 🎬 Onboarding & Tutorials

- **First-run wizard** (11 steps): language picker → welcome → profile multi-select (15 options) → workflow → goals → vault structure → Ollama setup → email → telegram → done
- **Auto-launches** interactive tutorial after onboarding completes (driver.js-style highlights)
- **5 guided tours**: First steps · One-on-one · Weekly report · Flashcards · Knowledge Graph
- **WhatsNew modal** showcases recent features per version
- **Smoke test** + **self-test diagnostic** built-in (Cmd+P → Atlas: Self-test)

---

## 📦 Install (BRAT — works today)

The fastest way — works while we wait for Obsidian's official Community Plugins approval:

1. Install **BRAT** plugin: `Settings → Community Plugins → Browse → BRAT`
2. Enable BRAT, then `Cmd+P → "BRAT: Add a beta plugin to update with frequent updates"`
3. Paste: `https://github.com/MisterM-Code/atlas-plugin`
4. Click Install. Atlas will auto-update on each new release.

### After install
1. `Cmd+P → Atlas: Setup vault structure` — creates the folder skeleton (`02_Daily/`, `03_Meetings/`, etc.)
2. Install [Ollama](https://ollama.com) and pull `qwen2.5:7b` + `bge-m3`:
   ```bash
   ollama pull qwen2.5:7b
   ollama pull bge-m3
   ```
3. Restart Obsidian → onboarding wizard auto-opens

---

## 🖥️ Hardware

| Tier | RAM | Recommended models |
|---|---|---|
| **Light** | 8–16 GB | qwen2.5:7b + bge-m3 (default) |
| **Heavy** | 16–32 GB | qwen2.5:14b + bge-m3 + bge-reranker-v2-m3 |
| **Cloud** | any | Anthropic Haiku (cheap) or OpenAI mini |

Atlas detects available RAM at onboarding and recommends the best stack.

---

## ⌨️ Default hotkeys

| Hotkey | Action |
|---|---|
| `Cmd+Shift+J` | Open Jarvis (full-screen voice mode) |
| `Cmd+Shift+A` | Quick capture (works from any app) |
| `Cmd+K` | Atlas Spotlight (universal launcher) |
| `Cmd+Shift+H` | Atlas HUD overlay |
| `Cmd+Shift+R` | Reasoning modal (chain-of-thought) |
| Spacebar (in Jarvis) | Push-to-talk |

---

## 🧬 Architecture

```
User input (text/voice)
    ↓
Intent Dispatcher (regex + KG entity lookup, ZERO-LLM first)
    ↓
   confidence ≥ 0.85 → DIRECT execute tool
   confidence < 0.85 → Orchestrator
                            ↓
                     Researcher (cheap LLM) + Writer (quality LLM) split
                            ↓
                     14 agentic tools → mutate vault + KG
```

Built on:
- **TypeScript** + **esbuild** + **zod** schemas
- **Ollama** local LLM + 9 cloud providers via `LLMService` façade
- **Hybrid retrieval**: BM25 + dense embeddings + bge-reranker
- **FSRS-4.5** spaced repetition
- **Cytoscape.js** + **ECharts** for analytics
- **Whisper.cpp** + **Piper TTS** for voice
- **chrono-node** for natural language dates

---

## 🤝 Credits & Inspirations

- [Obsidian](https://obsidian.md) — the foundation
- [Ollama](https://ollama.com) — local LLM runtime
- [Whisper.cpp](https://github.com/ggerganov/whisper.cpp) — local speech-to-text
- [Piper TTS](https://github.com/rhasspy/piper) — local text-to-speech
- [Apache ECharts](https://echarts.apache.org/) — analytics
- [Cytoscape.js](https://js.cytoscape.org/) — graph visualization
- [chrono-node](https://github.com/wanasit/chrono) — natural date parsing
- Tony Stark — for the aesthetic 🦾

---

## 📜 License

MIT — see [LICENSE](./LICENSE).

---

<div align="center">

**Atlas v0.81.0** — built with ❤️ + 🌌 by [@MisterM-Code](https://github.com/MisterM-Code)

*If you find Atlas useful, [⭐ star the repo](https://github.com/MisterM-Code/atlas-plugin) — it helps a lot.*

</div>
