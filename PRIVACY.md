# Atlas — Privacidade & Threat Model

> **TL;DR:** Atlas é 100% local. Nenhum dado sai do seu computador exceto pelos canais que você configurar explicitamente (SMTP, Telegram bot, iCal URL).

## O que Atlas armazena

| Dado | Onde | Encriptado? |
|---|---|---|
| Knowledge Graph (pessoas, projetos, temas, sessões, action items, commitments, sistemas, produtos, cargos, cursos) | `.atlas/kg.json` no seu vault | Não (texto JSON legível) |
| Embeddings (vetores semânticos das notas) | `.atlas/embeddings.json` | Não |
| Memória conversacional (chat history) | `.atlas/memory.json` | Não |
| Audit log (todas ações sensíveis: emails enviados, capsules seladas, etc) | `.atlas/audit.jsonl` | SHA-256 hash chain (tampering detection) |
| Cache iCal (eventos do calendar fetched) | `.atlas/ical-cache.json` | Não |
| Reminder watcher state | `.atlas/reminder-state.json` | Não |
| Proactive detector state | `.atlas/proactive-state.json` | Não |
| Serendipity engine state | `.atlas/serendipity-state.json` | Não |
| Time capsule notes | `12_Studies/time-capsules/*.md` | Não |
| Flashcards (FSRS) | `.atlas/flashcards.json` | Não |
| Templates customizados | `.atlas/templates.json` | Não |
| Saved views (Reports Composer) | localStorage do Obsidian | Não |
| XP / Achievements | localStorage do Obsidian | Não |
| Tab state (qual sub-tab ativa) | localStorage do Obsidian | Não |
| **Coach mode vault separado** | Configurável (default `~/Vaults/Coaching/`) | **Sim, via age/rage opt-in** |
| **SMTP password** | settings.json | Sim, encryptLight (XOR + key derivada do vault path) |
| **Telegram bot token** | settings.json | Sim, encryptLight |
| Configuração geral (folders, perfis, schedules, hotkeys) | settings.json (`.obsidian/plugins/atlas/data.json`) | Não |

## O que Atlas envia para fora do seu computador

**Default: NADA.**

Atlas só faz network call quando VOCÊ configura:

| Canal | Quando | O que envia | Como desligar |
|---|---|---|---|
| **HTTP localhost:11434 (Ollama)** | Toda vez que LLM é chamado (chat, kg extraction, summaries, etc) | Conteúdo da nota / query / contexto | Local apenas — fora do escopo de privacidade |
| **SMTP (email)** | Briefing matinal + weekly report (se configurado) | HTML do briefing/weekly + PDF anexo | Settings → Atlas → Email → desativar |
| **Telegram bot HTTPS** | Notifications (se configurado) | Título + mensagem da notificação | Settings → Atlas → Telegram → desativar |
| **iCal URL HTTPS** | iCal sync (se URL configurada) | GET request para a URL .ics que você forneceu | Settings → Atlas → Profile → calendarUrl → vazio |
| **Ollama model pull (HTTPS to ollama.com)** | Quando você clica "Pull modelo" | Apenas o nome do modelo | Não baixe novos modelos |
| **Bookmarklet protocol handler** | Quando VOCÊ clica no bookmark do browser | URL do site + título + seleção (opcional) — recebido pelo Atlas, não enviado | Não use o bookmarklet |

**Atlas NÃO faz:**
- Telemetria
- Analytics (Google, Mixpanel, etc)
- Crash reporting externo
- Auto-update via canais não-Obsidian
- Phone home para qualquer servidor da Atlas team
- Coleta de uso anônima

## Coach mode — privacy-first design

Notas de coachees ficam em vault SEPARADO (default `~/Vaults/Coaching/`). Quando ativado:
- KG, embeddings, audit log são CALADOS para coach paths via `isCoachPath()` filter
- AutoTagger, AutoAliaser, ProactiveDetector NÃO processam coach paths
- Serendipity Engine pula coach paths
- Year in Review, Manager README, Decision Diary excluem coach data
- Voice always-listening (Sprint 16 v0.7.1) DESATIVA durante coach mode

## Threat model

### Quem é o atacante considerado
- **Pessoa que tem acesso físico ao seu computador**: pode ler `.atlas/kg.json` se desbloquear seu user. Mitigação: encryptLight em SMTP/Telegram tokens; coach vault encryption opt-in (age).
- **Pessoa que ataca via Ollama maliciosa**: se você instalar um modelo customizado de fonte não-confiável, o output pode tentar exfiltrar via prompt injection. Atlas confia no LLM output (renderiza markdown que pode incluir HTML em alguns lugares). **Recomendação:** use só modelos oficiais Ollama Hub.
- **Pessoa que controla seu DNS/proxy**: pode interceptar SMTP/Telegram/iCal calls. Use TLS sempre.

### Limitações conhecidas
- `encryptLight` é XOR com key derivada do vault path — protege contra leitor casual mas **NÃO contra atacante determinado**. Se você tem secrets críticos (corporate SMTP), considere não armazenar no Atlas.
- `innerHTML` é usado em 7 lugares (chat-view, reasoning-modal, weekly-report, splash, tutorial, auto-link-systems, onboarding). Inputs vêm de: LLM local (controlado), Mermaid parser (controlado), system names (controlado), markup interno hardcoded. **XSS surface ≈ zero** se LLM e plugin não forem comprometidos.
- localStorage é compartilhado com Obsidian e outros plugins. Achievements/XP/saved views são acessíveis a outros plugins. Não armazenamos secrets em localStorage.

## Right to be Forgotten (LGPD / GDPR Article 17)

```
Cmd+P → Atlas: Right to be forgotten
```
*(comando planejado v0.7.1 — atualmente: deletar manualmente as entradas em `.atlas/kg.json` + arquivos correspondentes em `06_People/`)*

## Export ROPA (LGPD Article 30)

Para exportar TUDO que Atlas armazena sobre você:
1. Backup `.atlas/` folder
2. Backup `.obsidian/plugins/atlas/data.json`
3. Comando `Atlas: KG: estatísticas` mostra resumo

## Auditoria

Todas ações sensíveis (emails enviados, capsules seladas, weekly reports, briefings emailed) ficam em `.atlas/audit.jsonl` com hash chain SHA-256. Tampering quebra a chain.

---

_Última atualização: v0.7.0 (lançamento Jarvis Edition)._
_Bugs/dúvidas de privacidade: abrir issue em github.com/MisterM-Code/atlas-plugin_
