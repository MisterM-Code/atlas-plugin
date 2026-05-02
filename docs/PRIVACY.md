# 🔒 Privacidade — Atlas

## Princípio

**Nada sai da sua máquina sem você comandar explicitamente.**

## O que fica local

- Suas notas (markdown — você já controla)
- Modelos LLM (Ollama)
- Embeddings (LanceDB / arquivos locais em `.atlas/`)
- Knowledge graph (`.atlas/kg.json`)
- Memória do agente (`.atlas/memory.json`)
- Audit log (`.atlas/audit.jsonl`)

## O que pode sair (opt-in explícito)

| Saída | Quando | Para onde |
|---|---|---|
| **Email** | Você ou Atlas (agendado) dispara weekly report / briefing | Seu provedor SMTP (Gmail/Outlook) |
| **Telegram push** | Notificação de pendência | Servidor do bot Telegram |
| **PDF anexo em email** | Junto com weekly report | Mesmo provedor SMTP |

**Você pode desativar tudo em Settings → Atlas.**

## LGPD — notas de coachees

1:1s e sessões de coaching são **dados pessoais sensíveis** (Lei 13.709/2018, Art. 5°, II).

### Princípios aplicados

- **Finalidade específica:** apenas para o vínculo de coaching/gestão
- **Necessidade:** só dados estritamente necessários
- **Adequação:** notas refletem fatos observáveis, não juízos sobre pessoa
- **Transparência:** o coachee pode pedir cópia
- **Segurança:** vault separado encriptado (age/rage)
- **Retenção:** 2-3 anos pós-término do vínculo, depois anonimização

### Direitos do titular

A pessoa cujos dados estão em notas tem direito a:
- Acessar (Atlas exporta perfil completo: `Atlas: Exportar dados de [pessoa]`)
- Corrigir
- Solicitar exclusão (`Atlas: Apagar dados de [pessoa]`)
- Saber com quem foi compartilhado

## ICF Code of Ethics (coaching)

- Confidencialidade absoluta da sessão
- Notas privadas do coach são separadas das notas do coachee
- Compartilhamento só com consentimento explícito

## SOX, BACEN, auditoria

Para coordenadores em ambiente bancário regulado:

- Audit log imutável (append-only) em `.atlas/audit.jsonl`
- Hash chain opcional (SHA-256) para detectar tampering
- Retenção 7 anos para notas relacionadas a decisões/incidents
- Evidência de quando email foi enviado, com hash do conteúdo

## Validação independente

Você pode confirmar tráfego de rede com ferramentas do próprio sistema (Activity Monitor → Network no macOS, Resource Monitor no Windows). Em uso normal você só verá tráfego para `localhost:11434` (Ollama). Email/Telegram só aparecem quando você dispara explicitamente.

## Mais info

Veja PRIVACY-DETAILED.md (em breve) para ROPA completo.
