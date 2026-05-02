# Changelog

Todas as mudanças notáveis do Atlas.

Format: [Keep a Changelog](https://keepachangelog.com/) · Versionamento: [SemVer](https://semver.org/).

## [0.7.0] — 2026-05-01 — "Jarvis Edition"

Lançamento beta consolidado com 7 sprints (11, 12, 13, 14, 15, 18, 19). Pulou v0.2-v0.6 unificando.

### Added — Tabs novas

- **📈 Analytics tab** com 4 sub-tabs (Heatmap calendar 365-day, Trends 4 charts, KG Graph force-directed, Mood line+radar) via ECharts tree-shaken
- **🧪 Lab tab** com 4 sub-tabs (Tools IA / Serendipity / Capsules / Entity Tree)
- **🤖 Auto tab** com 4 sub-tabs (AutoTagger / Aliaser / Rules / Atlas Percebeu)
- **📊 Reports tab** virou hub com sub-tabs (Timeline / Composer / **📐 Templates editor visual**)
- **🃏 Study tab** virou sub-tabs (Flashcards / **🎓 Cursos** / Papers)
- **⚙️ Status tab** virou sub-tabs (Diagnóstico / **📦 Catálogo** com 15 modelos curados)

### Added — 8 Tools IA TI-focused

- 🏗️ Architecture Diagram Generator (Mermaid C4)
- 📜 ADR Generator (formato Michael Nygard)
- 💸 Tech Debt Scanner (escaneia vault, classifica severity + esforço)
- 🚑 Runbook Generator (SRE: Detection/Triage/Mitigation/Rollback/Prevention)
- 🚨 Postmortem Builder (blameless RCA 5-whys)
- 📊 Flow Chart Generator (Mermaid flowchart)
- 📘 API Doc Extractor (TS/JS/Python → markdown)
- 👥 Capacity Planner (KG analysis + sobrecargas)

### Added — Inteligência Adaptativa Multi-perfil

- **15 perfis profissionais** (TI/Eng, Coordenador TI, Produto, Design, Marketing, Vendas, Coach, RH, Financeiro, Jurídico, Saúde, Educação, Pesquisa, Estudante, Pessoal)
- Cada perfil define templates priorizados, tools IA filtradas, frameworks sugeridos, métricas relevantes, defaults (briefing time, color, severity)
- Profile picker no onboarding com multi-select
- Lab → Tools IA filtra por perfil ativo + agrupa em 6 categorias

### Added — Onboarding 2.0

- Expandido de 6 → 11 telas (Welcome / Profile / Workflow / Goals / Vault / Ollama / Color / Email / Telegram / Calendar / Done)
- Profile-driven defaults aplicados automaticamente após escolha
- Ollama detector com platform-specific install guide (mac/win/linux)

### Added — Course Manager

- Schema `Course` + `CourseModule` no KG
- KGStore com `upsertCourse`, `listCourses`, `updateCourseModule`, `addCourseModule`
- Course CRUD UI com cards (status colorido + barra progresso), slide-over com módulos checkable, takeaways, rating, edit/delete
- Auto-create note em `12_Studies/courses/[slug].md`

### Added — Integrations

- **iCal client** (parser minimal, fetch + cache em `.atlas/ical-cache.json`, eventsToday + eventsUpcoming)
- Today widget Agenda enriquecido com eventos do iCal
- **Bookmarklet** com protocol handler `obsidian://atlas-capture-url` — capture URL+highlight de qualquer site

### Added — Animations & Polish (Sprint 12)

- Web Animations API helpers (zero KB): fadeIn/slideIn/scaleIn/staggerCards/pulse/shake/typeWriter/confettiBurst/tabSlideTransition
- Skeleton loaders 5 variantes (line/paragraph/title/card/avatar) com shimmer
- Splash screen first-run 5s (SVG inline + CSS keyframes)
- Confetti burst em achievement unlock + level up via canvas-confetti
- Typing effect na resposta do chat (typeWriter 14ms/char)
- CSS classes globais (atlas-skeleton, atlas-spinner, atlas-card-interactive)

### Fixed — P0 bugs

- **17 modais cortados em viewports menores** → helper `applyResponsiveModal()` com `width: min(NNNpx, 95vw) + maxHeight: 85vh + scroll interno`
- **`pullModel` TypeError "X.on is not a function"** → reescrito com fetch API + ReadableStream (axios stream não funciona em Electron renderer)
- `require("os")` em runtime → import normal
- `require("../automation/markdown-html")` em runtime → import normal

### Added — 15 Modelos Curados

- Tiny (≤2 GB): qwen2.5:0.5b, llama3.2:1b, gemma2:2b
- Light (4-6 GB): qwen2.5:1.5b, llama3.2:3b, phi-4-mini
- Balanced (6-8 GB): qwen2.5:7b-instruct, llama3.1:8b
- Quality (12-16 GB): qwen2.5:14b, qwen2.5-coder:14b, phi-4
- Pro (24+ GB): qwen2.5:32b, qwen2.5-coder:32b
- Embeddings: bge-m3, snowflake-arctic-embed:l
- Reranker: bge-reranker-v2-m3
- Vision (opt-in): llama3.2-vision:11b
- Recomendação dinâmica baseada em RAM detectada

### Added — Settings novos

- `profile.ids[]` (multi-select de 15 perfis)
- `profile.colorAccent` (hex)
- `profile.calendarUrl` (iCal URL)
- `profile.initialGoal` (tour automático)
- `profile.showAllToolsOverride` (override do filter)
- `animations.{enabled, soundEffects, typingEffect, confetti}`
- `onboarding.splashSeen`

### Métricas v0.7

| Métrica | v0.6 | v0.7 |
|---|---|---|
| main.js | 928 KB | **1.76 MB** |
| Arquivos .ts | 118 | **135** |
| Tabs sidebar | 14 | **15** |
| Tools IA | 7 | **15** |
| Modelos catalogados | 0 | **15** |
| Perfis profissionais | 3 | **15** |
| Templates default | 17 | **17 + custom** |

### Deferido pra v0.7.1 / v0.8

- Sprint 16: Streaming chat token-by-token + Voice (whisper input/Piper output/Vosk hotword)
- 14 templates de meeting expandidos (standup, retro, planning, kickoff, qbr, etc)
- Submit oficial em obsidian-releases
- Right-to-be-forgotten command
- Auto-install Ollama (apenas detect+guide implementado, install programático fica pra depois)

## [0.1.0] — 2026-05-01

### Added — primeira release

**Captura zero-fricção**
- Quick Capture modal com hotkey `Cmd+Shift+A` (parser de linguagem natural PT-BR para datas)
- Daily log auto-criado com Dataview queries embutidas
- Voice capture stub (whisper.cpp shell call)
- 17 templates ricos para coordenador / coach / estudante (GROW, CLEAR, BICEPS, RAID, OKR, ADR, paper, course, etc.)

**Knowledge Graph automático**
- Extração estruturada (Pydantic-like via Zod) via Ollama: Person, Session, ActionItem, Commitment, Theme, Goal, Project, Risk
- Alias resolution para nomes (mesma "João S." / "João" agrupados)
- Persistência em `.atlas/kg.json`
- Detecção automática de padrões emergindo (theme com freq ≥ threshold)

**Hybrid search (RAG)**
- Indexer com chunking heading-aware + contextual prefix (Anthropic-style)
- BM25 + dense embeddings (bge-m3) + Reciprocal Rank Fusion
- Embeddings cache com SHA-256 dedupe
- Modal de busca interativo (`Cmd+Shift+K`) com snippets clicáveis

**Tools agentic**
- `summarize_person`: Map-Reduce + Chain-of-Density consolidando 1 ano de 1:1s
- `prepare_next_1on1`: brief automático (últimas sessões + commitments + temas + perguntas socráticas)
- `generate_weekly_report`: status report executivo com Mermaid charts + métricas KG
- `morning_briefing` / `evening_review`: agenda + pendências + alertas
- `auto_generate_flashcards`: cards LLM-generated com princípios de Wozniak
- `socratic_question`: Feynman check (5 perguntas que expõem lacunas)

**Sistema proativo**
- Reminder watcher: parser global de `(@datetime)` em qualquer task → notification 15 min antes + 24h overdue
- Pre-meeting nudge automático
- Pattern detection (theme threshold)
- Inactivity nudge (direct-reports sem 1:1)
- Commitments severamente atrasados

**Notificações multi-canal**
- macOS Notification Center (osascript) / Windows Toast (PowerShell) / Linux notify-send
- Telegram bot (push mobile gratuito)
- Email (nodemailer + Gmail App Password com encryption AES-256-GCM at-rest)
- TTS via Piper (PT-BR, "ouvir summary no carro")

**Anti-fatigue**
- Quiet hours configuráveis (default 18-7h)
- Focus mode 90 min (`Cmd+Shift+F`)
- Severity filter (low/medium/high/critical)
- Batch mode opcional

**Chat lateral (Jarvis)**
- ItemView dentro do Obsidian (`Cmd+Shift+J`)
- Memória conversacional (Mem0-lite) entre sessões
- Citações como chips clicáveis (abre nota fonte)
- Intent classification (summarize / pending / general)

**Coach Mode (LGPD/ICF)**
- Vault separado para coachees com isolation runtime
- Status bar clicável alterna Work ↔ Coach mode
- Audit log de toda mudança de modo
- Notas de coaching nunca aparecem em queries de trabalho

**Spaced Repetition**
- FSRS-4.5 algorithm (estado-da-arte, supera SM-2 do Anki)
- Sessão interativa com keyboard shortcuts (Espaço/1-4)
- Export TSV para Anki Desktop / formato Obsidian Spaced Repetition

**Schedulers (8 jobs ativos)**
- Morning briefing 7h
- Evening review 17h
- Weekly report sexta 16h
- Task watcher 9h+14h
- Reminder tick a cada 5 min
- Proactive meetings a cada 5 min
- Proactive daily 9h (padrões + inatividade + commitments)

**Onboarding**
- Wizard 5 telas (welcome → vault → ollama → email → telegram → done)
- Auto-detect Ollama + offer pull modelos com progress bar
- Apply 17 templates automático
- LGPD-compliant: encryption at-rest pra SMTP password

**Compliance & audit**
- `.atlas/audit.jsonl` append-only
- Email send / coach mode toggle / extraction logged

### Stack
- TypeScript + esbuild
- Obsidian Plugin API (1.5+)
- Ollama (qwen2.5:14b + bge-m3 default; llama3.2:3b fallback)
- nodemailer · node-cron · chokidar · chrono-node · zod · axios

### Build metrics
- 45 arquivos TypeScript
- ~7.100 linhas
- main.js: 506 KB minified
- 0 erros TypeScript strict mode
