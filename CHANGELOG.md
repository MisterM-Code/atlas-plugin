# Changelog

Todas as mudanças notáveis do Atlas.

Format: [Keep a Changelog](https://keepachangelog.com/) · Versionamento: [SemVer](https://semver.org/).

## [0.12.0] — 2026-05-02 — "5 inovações Tier 3 do roadmap original"

### Added — 5 features inovadoras (Tier 3 v0.2 do roadmap)

#### 👻 Ghost Mentor (`Cmd+P → Atlas: Ghost Mentor`)
Atlas adota persona de mentor real e responde em estilo característico:
- 👑 **Camille Fournier** (Manager's Path) — direta, pragmática
- 💜 **Lara Hogan** (Resilient Management) — empática, BICEPS framework
- 📚 **Pat Kua** (Tech Lead Coach) — sistemático, retros, learning loops
- 🧱 **Will Larson** (Staff Engineer + Elegant Puzzle) — estratégico, scale-first
- ⚓ **Grace Hopper** — audaciosa, "ask forgiveness, not permission"

Cada persona tem: emoji, role, expertise tags, style description e prompt customizado com frameworks favoritos. Salva sessão como nota em `09_Knowledge/mentoring/`.

#### 🌸 Cross-Pollination AI (`Cmd+P → Atlas: Cross-Pollination AI`)
Encontra pontes conceituais entre 2 áreas distintas. User informa "DE" e "PARA" áreas; Atlas gera 4-6 conceitos da área origem aplicáveis na destino, cada um com:
- O que é em [origem]
- Aplicação em [destino]
- Ação experimentável (1 ação concreta pra testar amanhã)

Sugere temas top do KG como atalhos de input. Salva como nota em `09_Knowledge/cross-pollination/`.

#### 🛑 Anti-Procrastination Buddy (`Cmd+P → Atlas: Anti-Procrastination`)
Detecta tasks com `#defer`/`#snoozed` no vault e oferece quebrar em **3 micro-ações de 5 min** via LLM. Critérios:
- 1ª ação absurdamente fácil (vence inércia)
- Cada uma concreta + ordenada
- Append automático no fim da nota fonte

#### 🔥 Habit Streaks Auto-Detect (`Cmd+P → Atlas: Habit Streaks`)
Analisa daily logs dos últimos 30 dias e detecta padrões repetitivos via regex matching (8 hábitos default: meditação, pomodoro, leitura, exercício, journaling, estudo, sleep, daily log). Mostra:
- Streak (dias com ocorrência)
- Total de menções
- Confidence % (ocorrências / 30 dias)
- Visual progress bar gradient

Awards XP por hábito detectado.

#### 🕰️ Future Self Letter (`Cmd+P → Atlas: Future Self Letter`)
Modal com 2 modos baseados em research de Hal Hershfield (future-self continuity):
1. **📮 Para meu eu do FUTURO** — você escreve hoje, Atlas sela e abre em 3/6/12/24 meses (cria reminder automático)
2. **📜 Do meu eu do PASSADO** — você escreve carta como se fosse o você de 1 ano atrás dando conselhos. Reframe psicológico.

6 prompts sugeridos por modo (clicáveis pra inserir no textarea). Word count + ratio. Salva em `09_Knowledge/letters/` + cria reminder automático na data de abertura.

### Smart Pause Timer (helper class)
`SmartPauseTimer` em `work-rhythm.ts` — chamável por qualquer feature pra detectar 90+ min sem pausa, sugerir pausa de 10 min com tip aleatório (alongamento, água, caminhada, respiração 4-7-8).

### Stack
- main.js: 1.8 MB (sem deps adicionais)
- styles.css: 55 KB → **63 KB**
- 4 novos arquivos: `ghost-mentor.ts` + `cross-pollination.ts` + `work-rhythm.ts` + `future-self-letter.ts`
- Reaproveita Ollama generate + KG + scheduler existentes

### 6 novos commands no Cmd+P (total: 121)

## [0.11.0] — 2026-05-02 — "Tier B innovations: Tone Bifold + Graph Pruning + Easter Eggs"

### Added — 3 features inovadoras (Tier B do roadmap original)

#### ✍️ Tone Bifold Editor (`Cmd+P → Atlas: Tone Bifold Editor`)
Modal split-view com texto original (esq.) + reescrita LLM (dir.), ambos editáveis. **7 tons disponíveis:**
- 🎩 Formal · 😎 Casual · 💼 Executivo (bullets) · 🤗 Amigável · ✂️ Conciso · 🌳 Expandido · 📚 Acadêmico

Word counts live + ratio (% do original). Botão "⇄ Trocar lados" pra permutar. "Aplicar original" ou "Aplicar reescrita" volta na nota ativa.

Por que: muitos editores têm "rewrite" mas raros mostram side-by-side editável — permite **blend** entre original e IA.

#### ✂️ Graph Pruning Assistant (`Cmd+P → Atlas: Graph Pruning Assistant`)
Análise de saúde do Knowledge Graph com 4 seções:
- **📊 Overview** — total nodes, edges, densidade %, componentes
- **🩺 Verdict** — healthy / mid / warning baseado em fragmentação
- **🧩 Disconnected components** — clusters separados detectados via BFS
- **🏝️ Orphan entities** — nodes sem nenhuma conexão
- **🔗 Merge suggestions** — entidades com nomes muito similares (Jaro-like sim ≥ 0.7) com botão "Adicionar como alias" 1-click

Por que: KG cresce organicamente e fragmenta. Esse tool dá visibilidade + ação imediata.

#### 🎮 Easter Eggs (descoberta gradual)
- **Konami code** (↑↑↓↓←→←→BA) — ativa modo nostálgico com confetti, +30 XP, mensagens randomizadas, glow drama 4s
- **7 comandos secretos** acessíveis via Spotlight (não documentados):
  - "coffee" / "café" → pausa recomendada
  - "thanks" / "obrigado" → resposta randomizada
  - "42" → meaning of life
  - "hello world" → hello reply
  - "jarvis" → abre Jarvis
  - "matrix" / "neo" → modo matrix 6s
  - "xp" → +10 XP cheat

Por que: pequenos detalhes que recompensam usuários atentos = produto vivo.

### Stack
- main.js: 1.8 MB (sem deps adicionais)
- styles.css: 51 KB → **55 KB**
- Reaproveita Web Animations API + canvas-confetti existentes
- Graph Pruning usa BFS nativo (zero deps)

### NÃO incluído (intencional)
- **3D KG Graph (Three.js)** — bundle bloat ~500 KB, ECharts force-directed existente já é robusto
- **Vosk hotword "Atlas" always-listening** — 50 MB modelo + privacy-sensitive, push-to-talk via Web Speech suficiente
- **GraphRAG / HippoRAG** — research-level, fora do escopo de plugin Obsidian

## [0.10.0] — 2026-05-02 — "Final migration: Reports Composer + Visual Template Editor → CSS"

### Changed — Last 2 heavy files migrated to CSS classes

| File | Before | After |
|---|---|---|
| `tab-reports-composer.ts` | 116 | 2 (drag positions in inline-menu) |
| `editor-ui.ts` template editor | 137 | 3 (dynamic per-block-kind colors via `setProperty`) |

styles.css: 46 KB → **51 KB** (added ~280 lines for composer filters/chips/cron + template editor blocks/preview/picker).

### v0.10.0 — Compliance milestone reached

After 11 versions of incremental migration (v0.9.0 → v0.10.0), all 18 most-visible Atlas component files have been migrated from inline `element.style.X` patterns to CSS classes. The Atlas plugin is now fully compliant with Obsidian's "Use CSS classes for better theming and maintainability" guideline for the entire user-facing surface.

**Total inline styles eliminated across all components: ~1,080**

Files fully migrated:
- Jarvis suite (7 files): jarvis-core, jarvis-tutorial, jarvis-overlay, etc.
- HUD + Header + FAB
- Master Sidebar + Status + Settings
- Reminders + Jarvis tabs
- 3 CRUD tabs (Systems / Products / Roles)
- Onboarding wizard (11 screens)
- **Reports Composer** (filters, chips, saved views, cron modal)
- **Template Editor** (drag-drop block editor, preview, picker)

Remaining inline styles in source: only legitimate dynamic per-element values:
- Drag positions (HUD, inline-menu coordinates per anchor)
- Dynamic % widths (RAM bar fill)
- Per-block-kind border-left colors (template editor)
- Color swatch backgrounds (onboarding color picker)

These are appropriate uses of `style.setProperty()` — runtime-computed values where CSS classes don't apply.

### Stack milestones at v0.10.0
- main.js: 1.8 MB minified (TypeScript strict, 0 errors)
- styles.css: 51 KB (well-structured, BEM-like naming)
- 0 `innerHTML =`
- 0 `<style>` element creation at runtime
- 0 `eval()` / `new Function()`
- 0 `prompt()` / `confirm()` globals (replaced with Modal subclasses)
- 0 default hotkeys (user-configurable)
- 0 plugin-id prefix in command IDs (Obsidian auto-prefixes)
- 0 plugin-name prefix in command names

## [0.9.9] — 2026-05-02 — "Onboarding wizard migrated to CSS classes (first-run UX)"

### Changed
- `onboarding.ts`: 127 → 1 inline style (the only remaining is `setProperty("background", preset.hex)` for color swatch dynamic colors)

The 11-screen first-run wizard is the **most-visible UX surface** for new users — every Atlas user sees this on install. Now fully CSS-class based.

State changes via classes: `.is-current/.is-done` (progress dots), `.is-selected` (profile/color cards), `.is-empty` (summary state), `.is-shown` (vault setup log), `.is-power/.is-balanced/.is-light` (RAM profile badge).

styles.css: 39 KB → ~46 KB (added ~440 lines: header, progress dots, profile grid, summary, goal rows, color swatches, RAM detection, Ollama status, pull log, hints, help expander).

## [0.9.8] — 2026-05-02 — "All 3 CRUD tabs (Systems, Products, Roles) to CSS classes"

### Changed
- `tab-systems.ts`: 118 → 0 inline styles
- `tab-products.ts`: 75 → 0 inline styles
- `tab-roles.ts`: 62 → 0 inline styles

Also replaced `window.confirm()` with `confirmAsync()` modal in delete actions for systems/products/roles (Obsidian guideline).

styles.css: 30 KB → 39 KB (added ~340 lines of CRUD-shared + entity-specific classes).

Shared CSS classes introduced (reusable for any future CRUD tab):
- `.atlas-crud-tab/.atlas-crud-{header,title,header-actions,add-btn,refresh-btn,filter-bar,filter-chip,search,list,empty,empty-btn}`
- `.atlas-form-{field,label,input,select,textarea}` + `.atlas-crud-form-actions`

Entity-specific classes per CRUD type — Systems: `.atlas-system-card-*` + `.atlas-system-detail-*`. Products: `.atlas-product-card-*` + `.atlas-product-detail-*`. Roles: `.atlas-role-card-*` + `.atlas-role-detail-*`.

## [0.9.7] — 2026-05-02 — "Master Sidebar + Status panel + Settings to CSS classes"

### Changed — 3 most-visible UI shells migrated

| File | Before | After |
|---|---|---|
| `master-sidebar-view.ts` | ~64 inline | 0 |
| `atlas-status.ts` | ~76 inline | 1 (dynamic % width via `setProperty`) |
| `settings-tab.ts` profile section | ~37 inline | 0 |

State changes via classes: `.is-active` (activity bar tab), `.is-low/.is-mid/.is-high` (RAM bar fill severity), `.is-configured` (model row), `.is-warning` (settings summary), `.is-selected` (profile card).

styles.css: 25 KB → **30 KB** (added ~370 lines for sidebar + status + settings).

These 3 files are the **most-visible UI surfaces** in Atlas — what every user sees on opening the plugin, opening status, or opening settings. With v0.9.7 they're fully CSS-class based.

## [0.9.6] — 2026-05-02 — "More CSS class migration: HUD, FAB, Reminders, Header"

### Changed — 5 more components migrated

| File | Before | After |
|---|---|---|
| `atlas-hud.ts` | ~30 inline | 7 (drag positions only — necessary inline) |
| `atlas-header.ts` | ~22 inline | 0 |
| `quick-add-fab.ts` | ~74 inline | 0 |
| `tab-reminders.ts` | ~44 inline | 0 |
| `tab-jarvis.ts` | 2 | 0 |

State changes via classes (`.is-recording`, `.is-popover-open`, `.is-up`, `.is-down`, `.is-overdue`, `.is-today`, `.is-future`).

styles.css: 17 KB → 25 KB (added ~340 lines of HUD + FAB + Reminders + header CSS).

The 7 remaining inline styles in `atlas-hud.ts` are drag-position coords (`top/left` per-instance) and `userSelect="none"` during drag — legitimate uses where CSS classes don't apply (per-element runtime values).

## [0.9.5] — 2026-05-02 — "Showcase components migrated to CSS classes"

### Changed — Inline-style → CSS classes refactor
Converted the 6 most-visible component files to use CSS classes instead of `element.style.X` (Obsidian guideline). All component-specific CSS now lives in `styles.css`.

Files refactored:
- `src/ui/jarvis-core.ts` (~700 LOC, ~40 inline styles → 0; orb state animations via `is-idle/is-listening/is-thinking/is-speaking` classes)
- `src/ui/jarvis-tutorial.ts` (~12 inline styles → 0)
- `src/ui/jarvis-overlay.ts` (sizing via `.atlas-jarvis-modal` CSS rules)
- `src/ui/empty-states.ts` (~9 inline styles → 0)
- `src/ui/prompt-modal.ts` (~8 inline styles → 0)
- `src/ui/confirm-modal.ts` (~7 inline styles → 0)
- `src/innovations/compose-email.ts` (~14 inline styles → 0)

`styles.css` grew to ~17 KB (still small for what it covers). New CSS classes:
`.atlas-jarvis-{container,hex-bg,particles,header,title-*,btn,orb-{stage,v2,highlight,core},waveform,ring,subtitle,history,history-line,hint,status}`,
`.atlas-tutorial-{progress,progress-dot,body,emoji,title,text,cta,cta-{label,example},footer}`,
`.atlas-empty-state-{wrap,icon,title,subtitle,actions}`,
`.atlas-{prompt-input,confirm-message,modal-button-row}`,
`.atlas-email-{text-full,body-label,body-wrap,body-textarea,actions-bar,action-row}`,
plus `is-{fullscreen,sidebar,active,shown,idle,listening,thinking,speaking}` modifiers.

### Why this matters
The bot's review of v0.9.1 listed ~50 inline-style warnings across the showcase Jarvis components. v0.9.5 zeros them out for these files. Older components with inline styles remain (Tasks, Dataview etc. use the same pattern; non-blocking).

## [0.9.4] — 2026-05-02 — "No-runtime-style compliance"

### Changed — Removed all `<style>` element creation at runtime
Per Obsidian guideline ("Creating and attaching style elements is not allowed; use styles.css instead"), removed all 3 sites that injected `<style>` tags:

- `src/ui/theme-applier.ts` — refactored to use `document.body.style.setProperty()` for CSS variables only. All static CSS class rules + `@keyframes` moved to `styles.css`.
- `src/ui/splash.ts` — splash screen `@keyframes` moved to `styles.css`. `injectCss()` now no-op.
- `src/ui/animations.ts` — `injectGlobalAnimationStyles()` keyframes + skeleton/spinner CSS moved to `styles.css`. Function kept as no-op for retro-compat.

`styles.css` grew from ~9 KB to ~13 KB (still tiny for what it covers).

`removeAtlasTheme()` now uses `document.body.style.removeProperty()` per CSS variable instead of removing a `<style>` element.

## [0.9.3] — 2026-05-02 — "Obsidian community-plugins compliance"

### Changed — Bot review fixes (PR #12473 Tier 1 + Tier 2)
- **Type guards** in tool registry — `String(params.X)` replaced with `asStr(v: unknown, fallback)` helper that guards against `[object Object]` stringification (~15 warnings resolved)
- **Command IDs** no longer prefixed with `atlas-` (Obsidian auto-prefixes with plugin ID — was causing double-prefix `atlas:atlas-jarvis`)
- **Command names** no longer prefixed with "Atlas " (plugin name shown automatically by Obsidian UI)
- **Default hotkeys removed** from all commands — users configure via Settings → Hotkeys per Obsidian guideline
- **`window.confirm()` replaced** with new `confirmAsync` modal (`src/ui/confirm-modal.ts`) used by destructive tools
- **`fetch()` replaced with `requestUrl`** in non-streaming sites: ical.ts, vision.ts, health-check.ts (Ollama streaming sites keep fetch — required for ReadableStream)
- **`.obsidian` hardcoded replaced with `app.vault.configDir`** in 10 sites (per Obsidian guideline — config dir is configurable)
- **`noticeEl` → `messageEl`** in main.ts (deprecated property fix)
- All updates to `executeCommandById("atlas:atlas-X")` references corrected to `executeCommandById("atlas:X")`

### Note
The bot's "inline element.style.X" warnings (~50 occurrences across the codebase) are documented as cosmetic; many approved Obsidian plugins use the same pattern. Will be migrated to CSS classes incrementally in future versions without blocking initial approval.

## [0.9.2] — 2026-05-02 — "Jarvis Sci-Fi: sidebar default + conversational + Web Speech"

### Added — Sprint 32.1: Jarvis sidebar tab (default)
- New 🤖 **Jarvis** tab in Master Sidebar — first tab user sees, replaces Today as default
- Compact mode (orb 120px) inside sidebar; expand button opens fullscreen overlay (Cmd+Shift+J)
- Jarvis state shared between sidebar and fullscreen — same orb, same conversation history

### Added — Sprint 32.2: Sci-fi visual upgrade (Iron Man HUD aesthetic)
- **Animated particle network** background (35-70 nodes with connection lines, color-changes per state)
- **Hex grid** subtle pattern overlay (SVG data URL)
- **Multi-layer orb** with 4 distinct gradients per state (idle blue, listening red, thinking amber, speaking green)
- **Reflective highlight** + inner core pulse animation
- **Concentric ripples** emanating during listening/speaking
- **Live waveform** circular around orb during listening (96 segments, RMS-driven noise)
- **Scanning line** during thinking (rotating ray from orb center)
- **Decorative outer ring** rotating slowly (30s loop)
- Title text "ATLAS · JARVIS" with monospace font + green status dot pulsing

### Added — Sprint 32.3: Web Speech API fallback (zero-config voice)
- New `src/automation/web-speech.ts` — browser-native voice recognition
- **Auto-fallback**: when whisper.cpp not configured, Atlas uses Web Speech API automatically
- Real-time partial transcripts shown live in subtitle while user speaks
- PT-BR support (default `pt-BR`, configurable via `settings.voice.language`)
- Status bar shows current input mode: `INPUT: WHISPER.CPP` or `INPUT: WEB SPEECH API`

### Added — Sprint 32.4: Conversational tool calling (Jarvis asks for missing fields)
- Voice command "Atlas, criar pessoa" (sem nome) → Jarvis pergunta nome → pergunta tipo → cria
- "Atlas, criar pessoa João" (sem tipo) → Jarvis pergunta tipo → cria
- "Atlas, criar sistema" → pergunta nome → vendor → cria
- "Atlas, agendar reunião com Maria" (sem data) → pergunta quando → cria 1:1 GROW
- "Atlas, lembrar" → pergunta texto → quando → cria reminder
- "Atlas, mandar email" → pergunta destinatário → assunto → abre modal pré-preenchido
- New `detectPartialIntent()` in voice-commands.ts identifies bare commands and triggers conversation flow
- `JarvisCore.startToolConversation()` manages stateful multi-turn collection
- TTS speaks each follow-up question; user can answer by voice in same flow

### Added — Sprint 32.5: Interactive tutorial (first-time)
- New `src/ui/jarvis-tutorial.ts` — 5-step modal coach mark walkthrough
- Auto-shown the first time user opens Jarvis tab; persisted via `settings.onboarding.jarvisTutorialSeen`
- Steps: intro → how to talk → Jarvis CRIA coisas → Jarvis AGENDA coisas → compact vs fullscreen
- Each step has "Tente:" CTA with example phrase
- Progress dots, smooth slide transitions, skip button

### Refactored
- `src/ui/jarvis-overlay.ts` slim 49-line wrapper — delegates to `JarvisCore` shared component
- `src/ui/jarvis-core.ts` (new, 700 LOC) handles all rendering, state machine, voice IO, conversations

## [0.9.1] — 2026-05-02 — "Publication readiness for obsidian-releases"

### Changed
- README rewritten in **English** with shields.io badges, install instructions (BRAT), Master Sidebar table (16 tabs), Jarvis section, hardware requirements
- `manifest.json` description switched to English: *"Local-first second brain. 15 professional profiles, 15 AI tools, ECharts analytics, course manager, knowledge graph, 100% local via Ollama."* — synced with community-plugins.json submission

### Compliance — Obsidian developer policies
- **0 `innerHTML =`** remaining in source (was 7 occurrences):
  - splash.ts logo → `createElementNS` SVG
  - atlas-hud.ts / atlas-header.ts → `DOMParser` + `importNode`
  - tutorial-system.ts body → `MarkdownRenderer.render()`
  - weekly-report.ts preview → `MarkdownRenderer.render()`
  - auto-link-systems.ts highlight → `createEl("mark") + appendText`
  - onboarding.ts iCal help → DOM API
- 0 `eval()` / `new Function()`
- `child_process.exec` calls limited to whisper.cpp, piper, osascript, ollama (path-controlled, not user input)
- No private API usage (`app.account`, etc.)

### Released
- GitHub Release tagged **0.9.1** (no `v` prefix, matching `manifest.version` exactly per Obsidian convention)
- Backwards-compat: `v0.9.1` tag also pushed for existing BRAT installs

## [0.9.0] — 2026-05-02 — "Jarvis Real + Tool Calling + FAB v2 + Reminders + Polish"

### Added — Jarvis Real (Sprint 28)
- **Tool registry** with 12 mutators: create_person/system/product/role/course, create_action_item, create_reminder, schedule_meeting, compose_email, switch_profile, index_vault, forget_person (destructive)
- **Agent.run() function calling** — chat now mutates vault via Ollama tools API. Same permissions as voice.
- **chatWithTools()** in OllamaClient with OOM auto-fallback
- **+8 voice command mutators** routed through the same registry
- **JarvisOverlay** — full-screen Cmd+Shift+J modal with 200px animated orb (4 states: idle breathing, listening waveform, thinking glow rotating, speaking sync)
- **TTS speaking events** — Piper emits `atlas:tts-start/stop`, orb syncs

### Added — Polish (Sprint 29)
- **FAB v2** — 16 items in 3 categories (Capturar / Criar / Tools IA), 45° rotation when open
- **Reminders tab** (16th tab) with countdown live, snooze (+1h/tomorrow), complete, "+ Novo" inline
- **Empty states util** with 30 personalidade-Atlas copies
- **Card unification** — `.atlas-card-interactive` hover translateY+shadow, action/system/knowledge variants

### Added — Email + Chat redesign (Sprint 30)
- **ComposeEmailModal** — recipient autocomplete via KG email field, AI assist (LLM drafts), templates, send via SMTP
- **Chat tab tagline** differentiating from Jarvis with link to switch
- **Tool call meta info** in chat assistant message (🛠️ ✓ create_person...)

### Stack
- Bundle: 1.8 MB main.js minified
- TypeScript strict — 0 errors

## [0.8.4] — 2026-05-02 — "Polish: Sound FX wired + Hub cards + Status bar HUD"

### Added — Sound FX wired

- Tab activate (Master Sidebar) toca `playDing()` se `settings.animations.soundEffects` ON
- (achievement unlock + level up já tocavam confetti + visual; agora consistente)

### Added — Action Items Hub card categories

- Cada task no Hub recebe class por urgência:
  - `.atlas-card-action-overdue` → border-left vermelho (atrasada)
  - `.atlas-card-action-today` → border-left laranja (vence hoje)
  - `.atlas-card-action-future` → border-left verde (futuro)
- Visual scan rápido de prioridade

### Changed — Status bar Atlas indicator agora abre HUD

- Click → toggle HUD floating (Cmd+Shift+H equivalent)
- Right-click → toggle Coach Mode (era click antes)
- Title atualizado: "Click: toggle HUD · Right-click: toggle coach mode"

### Fixed — innerHTML zero em LLM outputs

- `reasoning-modal.ts` `renderAnswer()` refatorado: tokenizer regex + `createEl()` em vez de innerHTML
- `appendInlineTokens()` cria `<strong>`, `<code>` via DOM API
- Suporta headings (h3/h4), bullets, paragraphs, line breaks
- chat-view.ts já tinha sido refatorado em v0.8.2

### Status XSS

| Lugar | innerHTML antes | innerHTML agora |
|---|---|---|
| chat-view.ts | LLM output | ✅ DOM API (v0.8.2) |
| reasoning-modal.ts | LLM output | ✅ DOM API (v0.8.4) |
| splash.ts | hardcoded SVG | OK (estático) |
| tutorial-system.ts | renderInline interno | OK (controlado) |
| weekly-report.ts | Mermaid output | OK (interno) |
| auto-link-systems.ts | system names | OK (controlado) |
| onboarding.ts | help text hardcoded | OK (estático) |

LLM output → 0 innerHTML. Reviewer Obsidian feliz.

## [0.8.3] — 2026-05-02 — "Vision Multimodal"

### Added — Vision (multimodal via llama3.2-vision)

`src/innovations/vision.ts` — VisionTool + VisionModal:

- Lê arquivo imagem (.png/.jpg/.jpeg/.webp) → base64 → POST /api/generate com `images: [base64]`
- 5 tipos de análise:
  - 📝 **Describe** — descrição geral em PT-BR
  - 🔤 **OCR** — extrai todo texto preservando estrutura
  - 📊 **Table** — extrai tabelas como markdown table
  - 🔀 **Diagram** — converte diagrama em Mermaid markdown
  - 💡 **Summarize** — bullet points + action items
- Resultado salvo em `09_Knowledge/vision/[date]-[image].md`
- Comando `Atlas: 👁️ Vision: analisar imagem`
- Modal alerta sobre RAM (~8 GB temporário)
- Requer `llama3.2-vision:11b` pulled (Status → Catálogo)

### Use cases reais

- **Whiteboard photo** → markdown texto pra weekly report
- **Screenshot do Slack** → action items extraídos
- **Slide deck** → bullet points pra resumo
- **Receipt/nota fiscal** → tabela de gastos
- **Anotações à mão** → markdown digitalizado
- **Diagrama no quadro** → Mermaid pra ADR

### Métricas

| | v0.8.2 | v0.8.3 |
|---|---|---|
| main.js | 1.82 MB | 1.82 MB |
| Tools IA | 15 | **16** (+ vision) |

## [0.8.2] — 2026-05-02 — "Spotlight Premium + innerHTML refactor"

### Added — Atlas Spotlight visual upgrade (v0.8.1)

Cmd+K spotlight com look Linear/Raycast:
- Gradient cosmic no header (atlas-accent-soft fade)
- Ícone ⚡ accent na barra de busca
- Animação fadeIn + scaleIn (180ms) ao abrir
- Active row com box-shadow inset accent + ↵ keystroke hint visível
- Categories como badges UPPERCASE com letter-spacing
- Smooth transitions em hover

### Fixed — innerHTML XSS surface zero (v0.8.2)

Chat-view.ts agora renderiza assistant content via DOM API pure (zero innerHTML):
- `renderAssistantContentToDom()` substitui `renderAssistantContent()`
- Tokenizer regex pra **bold**, `code`, [Nota: x] highlight
- `appendInlineTokens()` cria `<strong>`, `<code>`, `<span>` via createEl
- Mantém todas funcionalidades visuais sem riscos XSS

Acelera review do PR oficial #12473 — reviewer Obsidian costuma flagger innerHTML em LLM output.

### Métricas

| | v0.8.0 | v0.8.2 |
|---|---|---|
| main.js | 1.81 MB | 1.82 MB |
| innerHTML criticos (LLM output) | 1 (chat-view) | **0** |

## [0.8.0] — 2026-05-02 — "Voice in Chat"

Inicia roadmap v0.8. Foco em consolidação de Jarvis no fluxo principal (chat).

### Added — Voice integrado no Chat tab

Antes só tinha voice via HUD floating (Cmd+Shift+H). Agora o composer do chat (Master Sidebar → Chat) tem:

- **Botão 🎙️ Falar** — click → grava → para → whisper transcreve → texto aparece no input (você revisa antes de enviar)
- **Toggle 🔊 Ler respostas** — quando ON, cada resposta do assistant é falada via Piper TTS (pula se >500 chars)
- Animação visual: botão fica vermelho durante recording

### Restante do roadmap v0.8

- Vosk hotword PT-BR offline (defer — complexity alta + 50MB modelo)
- innerHTML refactor completo (DOM API)
- Spotlight visual upgrade (Linear/Raycast style)
- README com screenshots/GIF demo

### Métricas

| | v0.7.7 | v0.8.0 |
|---|---|---|
| main.js | 1.81 MB | **1.81 MB** |
| Voice locations | HUD (1) | **HUD + Chat composer (2)** |

## [0.7.7] — 2026-05-02 — "Final v0.7 — Settings Profile + Templates + LGPD + Webhook"

Fim do roadmap v0.7. v0.8 começa com Vosk hotword (que ficou de fora por complexidade).

### Added — Settings Profile section completa (Sprint 26)

- Settings → Atlas → "🎯 Perfil profissional" — section completa pra editar perfil(is) sem refazer onboarding
- Grid de 15 perfis por categoria (Tech / Negócio / Pessoas / Operações / Conhecimento / Outros)
- Multi-select com border accent + summary live (templates / tools IA / frameworks / métricas)
- Color accent picker dropdown 7 presets (Indigo, Teal, Orange, Rose, Forest, Purple, Sky)
- Apply button atualiza schedules (briefing/weekly/notification severity) baseado no perfil principal
- Toggle "Mostrar todas Tools IA" (override do filter por perfil)

### Added — 14 templates de meeting

`team-standup`, `team-retro`, `team-planning`, `team-kickoff`, `qbr`, `stakeholder-update`, `client-call`, `interview` (STAR rubric), `decision-meeting` (RAID-like), `vendor-meeting`, `incident-bridge`, `1on1-skip` (skip-level), `refinement`, `demo`. Total templates default: 6 → **20**.

### Added — Right-to-be-forgotten (LGPD Article 17)

- Comando `🗑️ Atlas: Right-to-be-forgotten (apagar pessoa do KG)`
- Pergunta nome → confirma destruição → cascade delete:
  - Person from KG
  - Sessions com `personId === person.id`
  - ActionItems com `ownerId === person.id`
  - Commitments com `madeBy/madeTo === person.id`
  - Themes: remove personId; deleta theme se 0 personIds restantes
  - Audit log entry preserva hash chain
- Nota em `06_People/[id]/` NÃO é apagada automaticamente (user controla)

### Added — Webhook receiver (Express-lite)

- Comando `🔌 Atlas: Webhook receiver: toggle (localhost:7842)`
- HTTP server em localhost:7842 (Node http nativo, zero deps)
- POST JSON `{title, body, tag, due}` → cria task em Inbox
- Bearer token gerado a cada start (mostrado em Notice)
- Útil para IFTTT, Make.com, Zapier, scripts shell

### Métricas

| | v0.7.5 | v0.7.7 |
|---|---|---|
| main.js | 1.79 MB | **1.81 MB** |
| Templates default | 6 | **20** |
| Modelos catalogados | 23 | 23 |
| Comandos | ~100 | ~102 |
| Arquivos .ts | 140 | 140 |

### Status final v0.7

| Versão | Foco | Status |
|---|---|---|
| v0.7.0 | Jarvis Edition base (15 tabs, 15 perfis, 15 tools) | ✅ |
| v0.7.1 | P0 Fixes (theme, OOM auto-switch, streaming, sound FX, tutorial) | ✅ |
| v0.7.2 | Visual Identity Premium (header, Lucide icons, status bar) | ✅ |
| v0.7.3 | Animações Contínuas (em v0.7.5) | ✅ |
| v0.7.4 | Voice Jarvis Real (whisper + commands + HUD floating) | ✅ |
| v0.7.5 | +8 modelos + hot-swap runtime | ✅ |
| v0.7.6 | Settings Profile section (em v0.7.7) | ✅ |
| v0.7.7 | 14 templates + RTBF + Webhook | ✅ |
| v0.8.0 | **Vosk hotword PT-BR** + integrations avançadas | ⏳ próxima major |

## [0.7.5] — 2026-05-02 — "Animações Contínuas + 8 Modelos Novos"

Combinação de Sprint 23 (Animações) + Sprint 25 (Modelos novos).

### Added — Animações contínuas

- Tab content fade-in + slide horizontal (200ms cubic-bezier) ao trocar de tab
- Badges com novidades (overdue, flashcards due, systems down) recebem class `.atlas-badge-new` que pulsa contínuo via `atlas-pulse-soft` keyframe (2s loop)
- Logo do header continua breathing, glow durante chat streaming (já em v0.7.1)

### Added — +8 modelos no catálogo (total 23)

- **DeepSeek R1 7b** (~5 GB RAM, reasoning state-of-art)
- **DeepSeek R1 14b** (~9 GB RAM, premium reasoning, recomendado)
- **Mistral 7B** (~5 GB RAM, alternativa qwen tom natural)
- **Mixtral 8x7B MoE** (~26 GB RAM, premium quality 47B params/13B ativos)
- **Codestral 22B** (~13 GB RAM, code specialist 80+ linguagens, perfil TI)
- **Granite 3.0 8B** (~5.5 GB RAM, IBM enterprise, perfil Compliance/Jurídico)
- **Llama 3.3 70B Q4** (~40 GB RAM, top tier 2025)
- **Aya Expanse 8B** (~5.5 GB RAM, Cohere multilingual 23 línguas, PT-BR forte)

### Added — Hot-swap modelo runtime

- `OllamaClient.swapModel(from, to)` descarrega modelo antigo (keep_alive: 0) + warmup do novo
- Sub-tab Catálogo → "Usar como default" agora chama swap automaticamente
- Próximo chat usa novo modelo SEM reload do plugin

### Métricas

| | v0.7.4 | v0.7.5 |
|---|---|---|
| main.js | 1.79 MB | 1.79 MB |
| Modelos no catálogo | 15 | **23** |
| Arquivos .ts | 140 | 140 |

## [0.7.4] — 2026-05-02 — "Voice Jarvis Real"

Sprint 24 — Atlas finalmente vira Jarvis com voz.

### Added — Voice input (whisper.cpp wired)

- `src/automation/voice-input.ts` — MediaRecorder API + getUserMedia + audio analyser pra waveform
- `startVoiceRecording()` retorna handle com stop/cancel/getElapsedMs/getAudioLevel
- `transcribeAudio()` exec whisper.cpp com modelo configurado, retorna texto PT-BR
- Settings → voice.whisperBinaryPath + voice.whisperModelPath usados de verdade

### Added — Voice commands parser

- `src/automation/voice-commands.ts` — detecta prefixo "Atlas," / "Ei Atlas" / "Atlas olha"
- 8 comandos suportados:
  1. **Atlas, capturar [texto]** → cria task em Inbox com tag #voice-reminder
  2. **Atlas, abrir chat** → ativa Master Sidebar Chat tab
  3. **Atlas, daily** → abre/cria daily log
  4. **Atlas, lembrar [texto] [data]** → reminder com chrono-node parsing PT-BR
  5. **Atlas, ler último weekly** → Piper TTS lê o weekly mais recente
  6. **Atlas, status** → Piper fala briefing curto (tasks, atrasadas, flashcards)
  7. **Atlas, próximo um a um** → dispatcher prepare-1on1
  8. **Atlas, pesquisar [texto]** → abre Atlas Spotlight com query
- Feedback Piper TTS automático quando comando reconhecido

### Added — HUD floating Jarvis

- `src/ui/atlas-hud.ts` — overlay draggable Cmd+Shift+H toggle
- Componentes:
  - Logo Atlas SVG 32px (breathing animation contínua, glow pulse durante recording)
  - Status Ollama live: ✓ ready / ✗ down / ⚡ thinking (atualiza 5s)
  - Modelo atual + RAM livre
  - Voice waveform canvas (live durante recording, scroll horizontal)
  - 4 quick action buttons: 🎙️ Falar / 💬 Chat / 🎯 Capture / ⚙️ Settings
- Backdrop blur 20px + accent glow border
- Position persistida em localStorage (`atlas-hud-position`)
- Drag handle no header

### Added — Comandos novos

- `Atlas: 🧠 HUD: toggle` (Cmd+Shift+H)
- `Atlas: 🎙️ Falar com Atlas` (abre HUD direto)

### Métricas

| | v0.7.2 | v0.7.4 |
|---|---|---|
| main.js | 1.78 MB | 1.79 MB |
| Arquivos .ts | 138 | 140 |

### Como usar

1. Configure whisper.cpp em Settings → Atlas → Voice (binary path + model path)
2. Cmd+Shift+H abre HUD
3. Click 🎙️ → fala "Atlas, capturar comprar leite amanhã 9h"
4. Click 🎙️ de novo pra parar → whisper transcreve → comando despacha automaticamente

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
