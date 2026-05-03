import type AtlasPlugin from "../../main";
import { Tutorial } from "./tutorial-system";
import { t } from "../i18n";

/**
 * Tour definitions — instanciados sob demanda (precisam de plugin pra command/action callbacks).
 */

export function getAllTutorials(plugin: AtlasPlugin): Tutorial[] {
	return [
		firstStepsTour(plugin),
		oneOnOneTour(plugin),
		weeklyReportTour(plugin),
		flashcardsTour(plugin),
		knowledgeGraphTour(plugin),
	];
}

function firstStepsTour(plugin: AtlasPlugin): Tutorial {
	return {
		id: "first-steps",
		name: t("tour.first-steps.name"),
		description: t("tour.first-steps.desc"),
		estimatedMinutes: 2,
		steps: [
			{
				title: "👋 Bem-vindo ao Atlas",
				body: "Atlas é seu **segundo cérebro local** dentro do Obsidian.\n\nVamos aprender os 5 fundamentos em 2 minutos. Pode pular qualquer hora.",
				position: "center",
			},
			{
				title: "🧠 Atlas Master Sidebar",
				body: "Aqui é o **lar do Atlas**. 9 tabs com tudo que ele faz.\n\nClick nos ícones à direita para navegar. **`Cmd+Shift+O`** abre essa sidebar a qualquer momento.",
				target: ".atlas-master-sidebar",
				position: "left",
			},
			{
				title: "⚡ Quick Capture",
				body: "Aperte **`Cmd+Shift+A`** em **qualquer app** (não precisa estar no Obsidian).\n\nDigita: *\"cobrar Maria sexta 10h\"*. Atlas parsea a data e cria task com lembrete automático.",
				position: "center",
			},
			{
				title: "🔎 Cmd+K — Spotlight",
				body: "**`Cmd+K`** abre o launcher universal — busque qualquer coisa: ações, pessoas, projetos, notas. Tudo num só lugar.\n\nNão precisa decorar comandos.",
				position: "center",
			},
			{
				title: "💬 Atlas Chat",
				body: "**`Cmd+Shift+J`** abre o chat. Pergunte naturalmente:\n\n*\"Quais bloqueios o time reportou em maio?\"* — Atlas responde com **citações clicáveis** das suas próprias notas.\n\n100% local, 100% privado.",
				position: "center",
			},
			{
				title: "🎉 Pronto pra começar",
				body: "**Próximos passos sugeridos:**\n\n1. Crie seu primeiro daily log (`Cmd+P` → Atlas: Daily log)\n2. Capture algo com **`Cmd+Shift+A`**\n3. Indexe vault (Settings → Atlas → Indexar) depois de 5+ notas\n\nDúvidas? Settings → Atlas → Tours pra revisar.",
				position: "center",
				cta: {
					label: "Concluir 🎉",
					action: async () => {
						// nothing extra
					},
				},
			},
		],
		onComplete: (p) => {
			p.gainXp("first_steps_completed", 50);
		},
	};
}

function oneOnOneTour(plugin: AtlasPlugin): Tutorial {
	return {
		id: "one-on-one",
		name: t("tour.one-on-one.name"),
		description: t("tour.one-on-one.desc"),
		estimatedMinutes: 3,
		steps: [
			{
				title: "🤝 1:1s — onde Atlas brilha",
				body: "Um 1:1 mal estruturado = informação perdida. Atlas resolve isso.\n\n**Framework GROW** (Goal · Reality · Options · Will) é o template padrão.",
				position: "center",
			},
			{
				title: "Criar um 1:1 estruturado",
				body: "Use o comando: **`Atlas: 1on1 GROW`** (digite `/1on1` em uma nota também funciona).\n\nVocê escolhe a pessoa, e Atlas cria a nota com toda a estrutura pronta.",
				position: "center",
			},
			{
				title: "🤖 Atlas Brief automático",
				body: "Antes da reunião, use **`Atlas: Preparar próximo 1:1`**.\n\nAtlas lê suas últimas 3 sessões, lista commitments pendentes, temas recorrentes, e sugere **4 perguntas socráticas** baseadas em GROW.",
				position: "center",
			},
			{
				title: "Hover sobre [[Pessoa]]",
				body: "Em qualquer nota, **passe o mouse** sobre `[[Maria]]`. Atlas mostra mini-card com últimas sessões, commitments, temas — sem abrir nota.",
				position: "center",
			},
			{
				title: "✅ Action items viram tasks",
				body: "Ao salvar a nota de 1:1, Atlas detecta `- [ ]` com datas e cria reminders automáticos.\n\nVeja todos no **Action Items Hub** (tab ✅ na sidebar).",
				position: "center",
			},
		],
		onComplete: (p) => p.gainXp("one_on_one_tour", 30),
	};
}

function weeklyReportTour(plugin: AtlasPlugin): Tutorial {
	return {
		id: "weekly-report",
		name: t("tour.weekly-report.name"),
		description: t("tour.weekly-report.desc"),
		estimatedMinutes: 2,
		steps: [
			{
				title: "📊 Weekly Report Atlas-style",
				body: "Toda sexta 16h, Atlas pode **gerar e enviar** seu weekly report sozinho.\n\nMas vamos ver como funciona manualmente primeiro.",
				position: "center",
			},
			{
				title: "Daily logs alimentam o weekly",
				body: "Use `Atlas: Daily log` todo dia. Atlas detecta automaticamente:\n• Reuniões realizadas\n• Decisions tomadas\n• Action items criados\n• Sentiment do time",
				position: "center",
			},
			{
				title: "Gerar weekly agora",
				body: "Comando: **`Atlas: Gerar weekly report agora`**\n\nAtlas roda Map-Reduce nas suas 5 daily logs da semana, gera highlights, métricas, charts (Mermaid) e cria nota draft em `05_Reports/weekly/`.",
				position: "center",
			},
			{
				title: "📧 Aprovar e enviar",
				body: "Atlas adiciona um botão **\"📧 Aprovar e enviar\"** no topo da nota.\n\nClick → modal com preview HTML → confirma destinatários → email sai via SMTP local.\n\n**Tempo:** 5 min vs ~2h manual.",
				position: "center",
			},
			{
				title: "🎙️ Bonus: Podcast NPR-style",
				body: "Comando `Atlas: Podcast gerar áudio NPR-style do weekly ativo`.\n\nAtlas reescreve em tom narrativo + Piper TTS gera **áudio de 90 segundos** pra você ouvir no carro.",
				position: "center",
			},
		],
		onComplete: (p) => p.gainXp("weekly_tour", 30),
	};
}

function flashcardsTour(plugin: AtlasPlugin): Tutorial {
	return {
		id: "flashcards",
		name: t("tour.flashcards.name"),
		description: t("tour.flashcards.desc"),
		estimatedMinutes: 2,
		steps: [
			{
				title: "🃏 Atlas Study Engine",
				body: "Atlas tem **FSRS-4.5** (algoritmo state-of-the-art, supera SM-2 do Anki) rodando 100% local.",
				position: "center",
			},
			{
				title: "Gerar flashcards de uma nota",
				body: "Abra qualquer nota (paper, aula, capítulo). Comando **`Atlas: Estudo: gerar flashcards desta nota`**.\n\nAtlas usa LLM com princípios de Wozniak (atomicidade, recall ativo) para criar 5-10 cards de qualidade.",
				position: "center",
			},
			{
				title: "Revisar com keyboard",
				body: "**`Atlas: Estudo: sessão de spaced repetition`** abre revisão com atalhos:\n\n• **Espaço** = mostra resposta\n• **1** = errei · **2** = difícil · **3** = bom · **4** = fácil",
				position: "center",
			},
			{
				title: "📥 Export pro Anki Mobile",
				body: "**`Atlas: Estudo: exportar flashcards para Anki (TSV)`** → arquivo em `12_Studies/exports/`.\n\nImporte no Anki Desktop → AnkiWeb sync → revisa no celular no metrô.",
				position: "center",
			},
			{
				title: "🎓 Feynman check",
				body: "Comando `Atlas: Feynman check`. Você explica um conceito como se fosse iniciante — Atlas faz **5 perguntas socráticas** que expõem lacunas.\n\nNão dá respostas. Te força a pensar.",
				position: "center",
			},
		],
		onComplete: (p) => p.gainXp("flashcards_tour", 30),
	};
}

function knowledgeGraphTour(plugin: AtlasPlugin): Tutorial {
	return {
		id: "knowledge-graph",
		name: t("tour.knowledge-graph.name"),
		description: t("tour.knowledge-graph.desc"),
		estimatedMinutes: 3,
		steps: [
			{
				title: "🌐 Knowledge Graph",
				body: "Atlas constrói **grafo automático** das suas notas: Pessoas, Projetos, Temas, Sessões, Commitments, Action items.\n\nNão precisa estruturar nada manualmente.",
				position: "center",
			},
			{
				title: "Indexar vault",
				body: "Comando **`Atlas: Indexar vault`** roda LLM extraindo entidades estruturadas (Pydantic-like) de todas as suas notas.\n\nDemora 5-15 min na 1ª vez. Incremental depois.",
				position: "center",
			},
			{
				title: "🌐 Tab Knowledge",
				body: "Na Master Sidebar, click no ícone **🌐**. Você vê grid de cards:\n\n• Pessoas com avatar + sessões + temas\n• Projetos com RAG status\n• Temas com sentiment color\n\nSearch + filter rápidos.",
				position: "center",
			},
			{
				title: "Auto-aliasing",
				body: "Atlas detecta **\"JS\" = \"João Silva\" = \"Jão\"** como mesma pessoa.\n\nUse **`Atlas: Auto-aliasing`** pra confirmar fusões. Atlas nunca funde sozinho — sempre pergunta.",
				position: "center",
			},
			{
				title: "🔮 Context Collapse AI",
				body: "Pessoa com 30+ menções → comando **`Atlas: Context Collapse`** destila o **insight central unificador**.\n\nAlgo que o cérebro humano não consegue: ver padrões em 50 notas ao mesmo tempo.",
				position: "center",
			},
		],
		onComplete: (p) => p.gainXp("kg_tour", 30),
	};
}
