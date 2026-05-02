# 🚀 Como publicar Atlas v0.7.0

> Checklist passo-a-passo para você publicar e seu amigo instalar via BRAT.

## ✅ Pré-checks (já feitos)

- [x] Branch `release/v0.7.0` criada
- [x] `manifest.json` v0.7.0 com fundingUrl + authorUrl
- [x] `package.json` v0.7.0
- [x] `CHANGELOG.md` com seção `[0.7.0]`
- [x] `README.md` com instruções de install via BRAT
- [x] `PRIVACY.md` com threat model + LGPD ROPA
- [x] `.github/workflows/release.yml` configurado para extrair notes do CHANGELOG
- [x] Build local validado: `main.js` 1.76 MB, TS 0 erros

## 1. Criar repositório no GitHub (se ainda não existir)

```bash
# No browser
# Acesse https://github.com/new
# Nome: atlas-plugin
# Owner: MisterM-Code (ou seu user)
# Visibility: Public ✅ (necessário pro BRAT funcionar)
# NÃO inicializar com README/gitignore/license (já temos)
```

Copie a URL do repo (ex: `git@github.com:MisterM-Code/atlas-plugin.git`).

## 2. Conectar repo local ao GitHub

```bash
cd ~/Documents/atlas-plugin

# Adicionar remote
git remote add origin git@github.com:MisterM-Code/atlas-plugin.git

# Push da branch main
git checkout main
git push -u origin main

# Push da branch release
git checkout release/v0.7.0
git push -u origin release/v0.7.0
```

## 3. Criar Pull Request `release/v0.7.0` → `main` (opcional)

Se quiser revisar antes de release:

```bash
gh pr create --title "v0.7.0 Jarvis Edition" --body "Veja CHANGELOG.md"
gh pr merge --squash
```

Ou pula direto pra step 4 (sem PR).

## 4. Tag + push → release automático

```bash
# A partir da branch main (ou release/v0.7.0):
git tag -a v0.7.0 -m "v0.7.0 Jarvis Edition — 8 sprints, 15 tabs, 15 perfis, 15 tools IA"
git push origin v0.7.0
```

O workflow `.github/workflows/release.yml` dispara automaticamente:
- ✅ Roda `npm ci`
- ✅ Type-check (`tsc -noEmit`)
- ✅ Build production (`esbuild`)
- ✅ Verifica `main.js`, `manifest.json`, `styles.css`
- ✅ Extrai release notes da seção `[0.7.0]` do CHANGELOG.md
- ✅ Cria GitHub Release com 3 artefatos anexados

Acompanhe em: `https://github.com/MisterM-Code/atlas-plugin/actions`

## 5. Verificar release

Após o workflow terminar (~2-3 min):

```bash
gh release view v0.7.0
# Deve mostrar: main.js, manifest.json, styles.css anexados
```

Ou via browser: `https://github.com/MisterM-Code/atlas-plugin/releases/tag/v0.7.0`

## 6. Mandar para seu amigo instalar via BRAT

Envie esta mensagem:

```
Oi! Pronto pra testar o Atlas — segundo cérebro local pro Obsidian.

Pré-requisitos (5 min):
1. Obsidian ≥ 1.5.0 — https://obsidian.md
2. Ollama — https://ollama.com/download (1-click installer)

Instalar Atlas (3 min):
1. Obsidian → Settings → Community plugins → Browse → procura "BRAT" → Install + Enable
2. Cmd+P → "BRAT: Add a beta plugin with frozen version"
3. Cole: https://github.com/MisterM-Code/atlas-plugin
4. Selecione versão v0.7.0
5. Settings → Community plugins → habilita "Atlas" ✅

Atlas vai abrir um onboarding wizard com 11 telas (~5 min). Escolhe seu perfil profissional (TI Coordenador, Coach, Estudante, ...) e ele customiza tudo.

Bugs/feedback: github.com/MisterM-Code/atlas-plugin/issues
```

## 7. Próxima versão (v0.7.1 / v0.8)

Quando quiser publicar uma nova versão:

```bash
# Atualize manifest.json + package.json + CHANGELOG.md
git checkout -b release/v0.7.1
# ... mudanças ...
git commit -am "v0.7.1 fixes"
git push -u origin release/v0.7.1
git tag -a v0.7.1 -m "v0.7.1"
git push origin v0.7.1
```

Workflow dispara → novo Release → BRAT do amigo detecta auto e oferece atualização.

## 8. (Opcional) Submit oficial em obsidian-releases

Quando estiver maduro o suficiente (1-2 sem de uso real do amigo sem bugs P0):

```bash
# Fork https://github.com/obsidianmd/obsidian-releases
# Edite community-plugins.json adicionando alfabeticamente:
{
  "id": "atlas",
  "name": "Atlas",
  "author": "Miguel Veríssimo",
  "description": "Seu segundo cérebro local. Captura zero-fricção, knowledge graph, weekly reports automáticos, analytics ECharts, 15 tools IA, 15 perfis profissionais. 100% local via Ollama.",
  "repo": "MisterM-Code/atlas-plugin"
}

# PR
gh pr create --repo obsidianmd/obsidian-releases \
  --title "Add Atlas plugin" \
  --body "Atlas v0.7.0 — local-first second brain. README: ..."
```

Espera 1-2 semanas review do team Obsidian. Quando aprovar, Atlas aparece em "Browse community plugins" do Obsidian global.

---

## Troubleshooting

**Workflow falha com `npm ci`:**
- Verifica que `package-lock.json` está commitado (não no .gitignore)

**BRAT diz "Plugin not found":**
- Verifica que repo é PÚBLICO no GitHub
- Verifica que tag `v0.7.0` existe e Release foi criado
- Verifica que Release tem `main.js + manifest.json + styles.css` anexados

**Atlas não carrega no Obsidian:**
- Cmd+Option+I → Console → procura erro
- Tenta: Settings → Community plugins → desabilita Atlas → reabilita
- Ou: `Cmd+R` (recarrega Obsidian inteiro)

---

_Última atualização: v0.7.0._
