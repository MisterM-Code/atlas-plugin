# Changelog

Todas as mudanças notáveis do Atlas.

Format: [Keep a Changelog](https://keepachangelog.com/) · Versionamento: [SemVer](https://semver.org/).

## [0.7.2] — 2026-05-02 — "Visual Identity"

Sprint 22 — eleva nota da identidade visual de 3.9/10 → 7+/10.

### Added — Atlas Header persistente

- **Sidebar header** sempre no topo do tabContentEl com logo Atlas SVG (32px, breathing animation 4s loop) + nome "Atlas" + nome do perfil ativo
- Logo recebe class `.atlas-thinking` durante chat streaming → glow pulse animado
- Click no header → abre Atlas Settings
- Hover state: border accent + settings icon revealed

### Added — 15 Lucide icons (substitui emojis nas tabs)

- ☀️ Today → `sun`, 💬 Chat → `message-circle`, ✅ Hub → `check-square`
- 🔗 Suggest → `link`, 🌐 Knowledge → `network`, 🖥️ Sistemas → `server`
- 📦 Produtos → `package`, 🎓 Cargos → `graduation-cap`
- 🎙️ Reports → `file-bar-chart`, 📈 Analytics → `trending-up`
- 🧪 Lab → `flask-conical`, 🤖 Auto → `bot`
- 🃏 Study → `book-open`, 🩺 Health → `stethoscope`, ⚙️ Status → `settings-2`
- Active tab agora usa `--atlas-accent` com `box-shadow` glow (não só bg change)

### Added — Card categorias aplicadas

- `.atlas-card-system-down` aplica em sistemas com status="down" → pulse contínuo vermelho
- `.atlas-card-system-degraded` em status="degraded" → border-left orange
- `.atlas-card-interactive` aplicado universalmente → hover lift+shadow

### Added — Status bar Atlas rico

- Bolinha indicador (verde=Ollama up, vermelho=down pulsando, orange=thinking)
- "🧠 Atlas" + Coach mode badge + cards due badge
- Async ping atualiza estado em tempo real
- API `setStatusBarThinking(true/false)` para sinalizar LLM ativo

### Métricas

| | v0.7.1 | v0.7.2 |
|---|---|---|
| main.js | 1.77 MB | 1.78 MB |
| Arquivos .ts | 137 | 138 |

## [0.7.1] — 2026-05-02 — "P0 Fixes"

Sprint 21 — corrige features-fantasma críticas detectadas em auditoria honesta de v0.7.

### Fixed — features fantasma

- **Color theme do perfil agora APLICA dinamicamente** — settings.profile.colorAccent → CSS variables `--atlas-accent`/`--atlas-accent-glow`/`--atlas-accent-soft` injetadas via `<style id="atlas-theme">`. Antes salvava mas só aplicava após reload Obsidian. Now: re-aplica em onload + saveSettings + onboarding complete sem reload.
- **OOM auto-switch real** — quando `OllamaOOMError` capturado em `chat()` ou `chatStream()`, plugin troca automaticamente pra modelo menor (qwen 32b→14b→7b→1.5b→0.5b cascade) e faz retry com mesma query. Notice mostra a troca. 1 retry máximo.
- **Streaming chat token-by-token REAL** — `OllamaClient.chatStream()` novo via fetch + ReadableStream. Tab Chat usa streaming real (não typing simulado). Cursor `▎` piscando + tokens chegam ao vivo. Logo do header recebe glow durante geração.
- **Sound effects implementados** — `src/ui/sound-fx.ts` Web Audio API (zero KB). 4 sons sintetizados: ding (tab switch), whoosh (action), success (achievement arpeggio C4→E4→G4), error (descending square). Toggle via settings.animations.soundEffects.
- **Tutorial auto-trigger** — após onboarding, plugin lê `settings.profile.initialGoal` e dispara tour correspondente automaticamente em 3.5s. weekly-report→weekly tour, 1on1-prep→one-on-one, research→flashcards, personal→first-steps.

### Added — Atlas theme system

- CSS variables `--atlas-accent/--atlas-accent-glow/--atlas-accent-soft/--atlas-accent-strong/--atlas-radius-sm/md/lg/--atlas-shadow-sm/md/lg/--atlas-transition-fast/normal/slow`
- Card category classes `.atlas-card-action-overdue/today/future`, `.atlas-card-system-down/degraded`, `.atlas-card-knowledge`, `.atlas-card-report`
- Logo breathing animation `.atlas-header-logo` + glow durante thinking `.atlas-thinking`
- HUD floating CSS `.atlas-hud` (preparado pra v0.7.4)
- Status bar indicator `.atlas-statusbar-indicator` com states green/red/orange (preparado pra v0.7.2)

### Métricas

| | v0.7.0 | v0.7.1 |
|---|---|---|
| main.js | 1.76 MB | 1.77 MB |
| Arquivos .ts | 135 | 137 |

### Próximas versões

- **v0.7.2** — Identidade Visual Premium (logo header, 15 Lucide icons, status bar, empty states)
- **v0.7.3** — Animações Contínuas (logo glow integrado, tab transitions, stagger cards)
- **v0.7.4** — Voice Jarvis Real (whisper input + Piper output + comandos + HUD)
- **v0.7.5/6/7** — Modelos novos + Settings Profile + Vosk hotword + integrations

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
