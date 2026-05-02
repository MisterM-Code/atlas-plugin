# 📥 Instalação do Atlas

> Tempo total: ~15 min (~10 min são download de modelo). Zero terminal.

## Pré-requisitos

- **Sistema:** macOS 12+, Windows 10+, ou Linux
- **RAM:** 16 GB recomendado (8 GB roda com Llama 3.2 3B em vez de Qwen 14B)
- **Disco livre:** 12 GB
- **Obsidian:** versão 1.5+ ([obsidian.md](https://obsidian.md))

## Passo 1 — Instalar Ollama

1. Vá em [ollama.com](https://ollama.com)
2. Click "Download" → baixa o instalador para seu sistema
3. Abra o instalador, click "Continuar" até o fim
4. Pronto. Ollama agora roda em background invisível.

> _Verificação: abra Terminal/PowerShell e digite `ollama list`. Deve responder sem erro (lista vazia OK)._

## Passo 2 — Instalar o plugin Atlas

### Modo A — via Community Plugins (recomendado quando publicado)

1. Obsidian → Settings → Community plugins → Browse
2. Busque "Atlas"
3. Install → Enable

### Modo B — via BRAT (durante desenvolvimento)

1. Instale plugin "BRAT" (Beta Reviewers Auto-update Tool) do community
2. BRAT → Add beta plugin → cole URL do repo: `https://github.com/<owner>/atlas-plugin`
3. Enable o Atlas em Community Plugins

### Modo C — manual

1. Baixe o release mais recente (`main.js`, `manifest.json`, `styles.css`)
2. Crie pasta `<seu-vault>/.obsidian/plugins/atlas/`
3. Cole os 3 arquivos lá
4. Reload Obsidian → habilite "Atlas" em Community Plugins

## Passo 3 — Onboarding (1ª vez que abrir)

O wizard guia 5 telas:

1. **Bem-vindo** → Next
2. **Vault** → confirma o vault atual
3. **Modelos LLM** → escolhe perfil (light/balanced/power) → baixa em background (5-15 min)
4. **Email** (opcional) → Gmail App Password ou Outlook OAuth
5. **Push mobile** (opcional) → escaneia QR do Telegram bot

## Passo 4 — Plugins recomendados

Atlas funciona melhor com estes 7 plugins community (Tier 1):

| Plugin | Para quê |
|---|---|
| **Dataview** | Queries dinâmicas em notas |
| **Templater** | Templates ricos com JS |
| **QuickAdd** | Macros de captura |
| **Tasks** | Checklists com due date |
| **Periodic Notes** | Daily/Weekly/Monthly auto |
| **Calendar** | Navegação visual |
| **Reminder!** | Notificações desktop nativas |

Você pode instalar manualmente OU clicar em "Settings → Atlas → Instalar plugins recomendados" (em breve).

## Passo 5 — Estrutura do vault

Settings → Atlas → "Estrutura de pastas do vault" → Criar agora.

Cria:
```
01_Inbox/, 02_Daily/, 03_Meetings/, 04_Projects/, 05_Reports/,
06_People/, 07_RAID/, 08_Incidents/, 09_Knowledge/, 10_Compliance/,
11_Metrics/, 12_Studies/, 13_Themes/, 99_Archive/, .atlas/
```

## Verificação

- `Cmd+Shift+A` em qualquer app abre Quick Capture? ✅
- Command Palette → "Atlas: Daily log" cria nota em `02_Daily/2026/05/`? ✅
- Settings → Atlas → "Testar Ollama" responde "OK · X modelos"? ✅

## Problemas comuns

**"Ollama offline" no toast:**
- macOS: `open -a Ollama`
- Windows: abrir Ollama uma vez no menu Iniciar
- Linux: `ollama serve &`

**Plugin não aparece em Community Plugins:**
- Habilitar Community Plugins em Settings (desabilitado por padrão)

**Daily log abre mas Dataview vazio:**
- Habilitar Dataview Settings → Enable JavaScript Queries

## Suporte

Issues: GitHub repo · _link a definir_
