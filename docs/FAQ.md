# ❓ Atlas — FAQ

## 🛠️ Setup

### Onboarding não abriu sozinho. E agora?
`Cmd+P` → "Atlas: Onboarding wizard (rodar de novo)".

### Posso usar Atlas sem Ollama?
Não totalmente. Captura, daily log, templates e reminders funcionam. Mas chat, KG extraction, resumir pessoa, weekly auto, flashcard gen — todos exigem Ollama. Ollama é gratuito e local.

### Hardware mínimo real?
- **16 GB RAM**: ideal — roda Qwen 2.5 14B (recomendado)
- **8 GB RAM**: aceitável — em Settings, troca para `llama3.2:3b` (rápido, qualidade ok)
- **CPU**: qualquer Mac M1+ ou x86 com SSD

### Quanto disco?
- Plugin: ~5 MB
- Modelos LLM: 9 GB (qwen2.5:14b + bge-m3) ou 2 GB (llama3.2:3b + bge-m3)
- Embeddings cache: cresce ~10 KB por nota indexada

---

## 🔒 Privacidade

### Atlas envia dados pra cloud?
Não. Todo LLM roda local via Ollama. Único tráfego de saída é:
- **Email** (quando você dispara weekly report) → seu provedor SMTP
- **Telegram push** (se você configurou) → servidor do bot

Você controla ambos em Settings → Atlas.

### Como verifico que nada vaza?
Activity Monitor (Mac) → Network tab. Você só vê tráfego para `localhost:11434` (Ollama). Email/Telegram só quando você dispara.

### Coach mode é seguro?
Notas de coachees ficam em pasta separada (`09_Coaching` por padrão). Em **Work Mode**, queries excluem essa pasta. Em **Coach Mode**, queries só veem essa pasta. **Isolation by design** + audit log de toda mudança de modo.

### Como apagar dados de uma pessoa (LGPD)?
Comando "Atlas: Apagar dados de [pessoa]" (em desenvolvimento). Por enquanto: delete a pasta `06_People/[Nome]/` e rode "Atlas: Indexar vault" novamente.

---

## ⏰ Notificações

### Atlas avisando demais. Como reduzir?
1. **Quiet hours** (Settings) — `18:00-07:00` por padrão
2. **Severity filter** — eleve para "high" pra ver só críticos
3. **Focus mode** — `Cmd+Shift+F` desativa por 90 min
4. **Batch mode** — junta avisos pequenos em digest às 14h

### Telegram bot — como crio?
1. Telegram → busca `@BotFather` → `/newbot` → escolhe nome → guarda TOKEN
2. Manda qualquer msg pro bot que você criou
3. Acesse `https://api.telegram.org/bot<TOKEN>/getUpdates` → veja `chat_id`
4. Cole token e chat_id em Settings → Atlas → Telegram → Test

### Notificação desktop não aparece (Mac)
Sistema → Notifications → Obsidian → habilitar "Allow notifications". Atlas usa AppleScript via Obsidian.

---

## 📊 Knowledge Graph & Search

### Indexação demora muito
Vault grande (>2k notas) leva 5-15 min na 1ª vez. Depois é incremental. Em background — você pode usar Obsidian normalmente.

### KG extraction tá errando os nomes
Aliases: edite `00_System/Settings/people.yaml` (em breve UI) listando aliases conhecidos. Re-indexe. Em geral, `bge-m3` agrupa formas próximas (ex: "João S."/"João").

### Search retorna resultados irrelevantes
Aumente os tokens de query — em vez de `"João"`, use `"João bloqueio carga maio"`. O hybrid search (BM25 + dense + RRF) usa todos.

---

## 📝 Reports & Email

### Weekly report tá vazio
Atlas precisa de notas na semana (em `02_Daily/`, `03_Meetings/`, `08_Incidents/`). Sem dados, gera só estrutura.

### LLM offline na hora do weekly
Atlas gera o relatório com seções vazias e estatísticas KG. Você preenche manualmente.

### Gmail rejeitando email
- Use **App Password** (não senha normal). Gere em myaccount.google.com → Security → 2-step → App Passwords
- Habilite "Less secure apps" não funciona mais — use App Password
- Outlook: pode requerer OAuth (em desenvolvimento)

### Como mudar template do weekly?
Atlas constrói o weekly programaticamente em `src/tools/weekly-report.ts`. Para customizar profundamente, fork do plugin. Para ajustar texto, edite a nota gerada antes de enviar — seu output é o source of truth.

---

## 🃏 Spaced Repetition

### Atlas tem o próprio SR ou usa Anki?
Ambos. Atlas tem FSRS-4.5 nativo (revise dentro do Obsidian). Quer sync mobile? Exporte TSV → importa no Anki.

### Como exportar pro Anki mobile?
1. Comando "Atlas: Estudo: exportar flashcards para Anki (TSV)"
2. Arquivo gerado em `12_Studies/exports/anki-YYYY-MM-DD.tsv`
3. Anki Desktop → File → Import → escolha o TSV → OK
4. AnkiWeb sync → mobile

### Cards gerados pelo LLM são bons?
Bons por padrão (Wozniak principles + few-shot PT-BR). Mas sempre revise. **Edite/delete** os ruins antes de revisar — não vale a pena memorizar lixo.

---

## 🎓 Estudo

### Feynman check (Socratic) parece superficial
Aumente o nível em Settings (em desenvolvimento). Por enquanto: dê uma explicação MAIS detalhada — perguntas se ajustam ao que você escreveu.

### Posso usar com Zotero?
Sim, pelo plugin "Zotero Integration" (community). Atlas detecta paper notes via frontmatter `type: paper` e gera flashcards.

---

## 🐛 Debugging

### Algo deu erro
1. Console: `Cmd+Opt+I` → Console tab → busque "atlas"
2. Audit log: `.atlas/audit.jsonl`
3. Se o erro é Ollama: comando "Atlas: Testar Ollama"

### Plugin não carrega
- Veja Console por erros
- Verifique manifest.json + main.js + styles.css em `<vault>/.obsidian/plugins/atlas/`
- Atlas requer Obsidian 1.5+

### Atlas comeu meu vault
Não comeu. Atlas só cria/modifica:
- Notas que você comanda explicitamente (daily, weekly, summarize-person)
- `.atlas/` (estado interno) — gitignore-able
- Templates em `00_System/Templates/` (durante setup, opt-in)

Suas notas existentes não são tocadas.

---

## 🚀 Performance

### Ollama travando o computador
- Use `llama3.2:3b` em Settings — 4× mais rápido que `qwen2.5:14b`
- Feche outros apps pesados durante chat/weekly
- Mac M1+ tem aceleração GPU automática; outros sistemas usam CPU

### Indexação aquece o computador
Roda em batches. Pode pausar mexendo no Obsidian durante.

### Vault muito grande (>10k notas)
- Habilite "Coach Mode" se aplicável (reduz scope)
- Indexe seletivamente: comente folders em `src/types.ts` `folders.{}`
- Embeddings cache acelera 2ª indexação (só notas modificadas)

---

## 💬 Suporte

GitHub: _link a definir_
Issues: GitHub Issues
Discussão: Obsidian Forum

Patches & PRs bem-vindos.
