/**
 * Atlas v0.9 Sprint 29.3 — Empty states com personalidade.
 *
 * Substitui "0 items" / "Nada aqui" plain text por copy custom + ilustração SVG inline + CTA opcional.
 *
 * Uso:
 *   renderEmptyState(container, "hub-empty", { onAction: () => ... });
 */

export interface EmptyStateAction {
	label: string;
	onClick: () => void;
}

export interface EmptyStateOpts {
	action?: EmptyStateAction;
	secondaryAction?: EmptyStateAction;
}

interface EmptyStateConfig {
	icon: string;          // emoji ou SVG inline
	title: string;
	subtitle: string;
}

const REGISTRY: Record<string, EmptyStateConfig> = {
	"hub-empty": {
		icon: "🎉",
		title: "Inbox zero!",
		subtitle: "Você é a inveja do time. Nada pendente — capture algo novo ou aproveite a calma.",
	},
	"hub-overdue-empty": {
		icon: "✨",
		title: "Sem atrasos.",
		subtitle: "Todos os prazos sob controle. Atlas tá orgulhoso.",
	},
	"reminders-empty": {
		icon: "🔕",
		title: "Nenhum reminder ativo",
		subtitle: "Adicione (@2026-05-15 14:00) em qualquer task pra Atlas avisar você.",
	},
	"reminders-quiet": {
		icon: "🪐",
		title: "Vault em paz",
		subtitle: "Nada urgente nas próximas 7 dias. Aproveite o silêncio cósmico.",
	},
	"chat-fresh": {
		icon: "💬",
		title: "Conversa nova com Atlas",
		subtitle: "Pergunte algo sobre seu vault. Eu trago citações clicáveis.",
	},
	"knowledge-empty": {
		icon: "🌐",
		title: "Knowledge Graph ainda vazio",
		subtitle: "Indexe o vault pra Atlas mapear pessoas, projetos e temas.",
	},
	"people-empty": {
		icon: "👥",
		title: "Nenhuma pessoa cadastrada",
		subtitle: "Cadastre seu time pra Atlas preparar 1:1s e detectar padrões.",
	},
	"systems-empty": {
		icon: "🖥️",
		title: "Nenhum sistema cadastrado",
		subtitle: "PIX, Stripe, Salesforce… cadastre os sistemas que você cuida pra Atlas autodetectar menções.",
	},
	"products-empty": {
		icon: "📦",
		title: "Portfolio vazio",
		subtitle: "Cadastre seus produtos. Atlas conecta com sistemas e pessoas owner.",
	},
	"roles-empty": {
		icon: "🎓",
		title: "Sem cargos definidos",
		subtitle: "Cadastre os cargos do time pra padronizar reports e talent maps.",
	},
	"reports-empty": {
		icon: "📊",
		title: "Nenhum report gerado ainda",
		subtitle: "Sexta 16h Atlas roda weekly automático. Ou gere agora via Composer.",
	},
	"templates-empty": {
		icon: "📐",
		title: "Sem templates customizados",
		subtitle: "Atlas trouxe 6 templates default. Edite ou crie novos pra ajustar ao seu fluxo.",
	},
	"composer-empty": {
		icon: "🎯",
		title: "Reports Composer pronto",
		subtitle: "Combine período + pessoas + sistemas + temas. Atlas compila em <60s.",
	},
	"saved-views-empty": {
		icon: "📌",
		title: "Sem saved views",
		subtitle: "Salve filtros frequentes. Próxima vez 1 click executa.",
	},
	"flashcards-empty": {
		icon: "🃏",
		title: "Nenhum flashcard pra revisar",
		subtitle: "Hoje você descansa. Ou crie cards novos a partir de notas.",
	},
	"flashcards-streak": {
		icon: "🔥",
		title: "Streak intacto",
		subtitle: "Reviews em dia. Atlas tá impressionado.",
	},
	"courses-empty": {
		icon: "📚",
		title: "Nenhum curso em andamento",
		subtitle: "Adicione um curso pra trackear módulos, certificados e takeaways.",
	},
	"papers-empty": {
		icon: "📄",
		title: "Sem papers indexados",
		subtitle: "Solte um PDF do Zotero aqui pra Atlas criar literature note + flashcards.",
	},
	"capsules-empty": {
		icon: "🕰️",
		title: "Nenhuma cápsula do tempo",
		subtitle: "Escreva uma carta pro seu eu de 1 ano. Atlas guarda e abre na data.",
	},
	"capsules-pending": {
		icon: "⏳",
		title: "Cápsulas dormindo",
		subtitle: "Chegou a vez delas? Atlas avisa quando.",
	},
	"serendipity-empty": {
		icon: "✨",
		title: "Aguardando insights",
		subtitle: "Atlas roda 3x/dia mostrando notas antigas relevantes hoje.",
	},
	"automations-empty": {
		icon: "🤖",
		title: "Automações ociosas",
		subtitle: "Tagger, Aliaser, Rules — todos prontos. Salve uma nota pra ver mágica.",
	},
	"suggestions-empty": {
		icon: "🔗",
		title: "Sem sugestões agora",
		subtitle: "Continue escrevendo. Quando Atlas detectar links possíveis, aparecem aqui.",
	},
	"vault-empty": {
		icon: "📓",
		title: "Vault ainda fresco",
		subtitle: "Crie sua primeira daily log e Atlas começa a aprender com você.",
	},
	"analytics-empty": {
		icon: "📈",
		title: "Sem dados pra analisar",
		subtitle: "Indexe o vault. Atlas precisa de pelo menos 7 dias de notas pra mostrar trends.",
	},
	"hub-suggestions-empty": {
		icon: "🌅",
		title: "Sem sugestões de link",
		subtitle: "Sua nota tá auto-suficiente — ou Atlas ainda não viu padrões.",
	},
	"search-empty": {
		icon: "🔍",
		title: "Nada encontrado",
		subtitle: "Tente outras palavras. Atlas usa BM25 + embeddings em PT-BR.",
	},
	"settings-empty": {
		icon: "⚙️",
		title: "Settings padrão",
		subtitle: "Atlas tá funcionando com defaults. Personalize quando precisar.",
	},
	"profile-empty": {
		icon: "🎭",
		title: "Sem perfil ativo",
		subtitle: "Escolha um perfil pra Atlas ajustar tools, templates e métricas.",
	},
	"jarvis-quiet": {
		icon: "🎙️",
		title: "Aguardando comando",
		subtitle: "Segure ESPAÇO ou click no orb pra falar.",
	},
	"generic": {
		icon: "🌌",
		title: "Nada por aqui ainda",
		subtitle: "Atlas tá pronto quando você estiver.",
	},
};

export function renderEmptyState(
	parent: HTMLElement,
	key: keyof typeof REGISTRY | string,
	opts: EmptyStateOpts = {}
): HTMLDivElement {
	const cfg = REGISTRY[key] ?? REGISTRY["generic"];
	const wrap = parent.createDiv() as HTMLDivElement;
	wrap.addClass("atlas-empty-state");
	wrap.style.padding = "40px 20px";
	wrap.style.textAlign = "center";
	wrap.style.maxWidth = "420px";
	wrap.style.margin = "0 auto";

	const iconEl = wrap.createDiv();
	iconEl.style.fontSize = "44px";
	iconEl.style.lineHeight = "1";
	iconEl.style.marginBottom = "12px";
	iconEl.style.opacity = "0.85";
	iconEl.setText(cfg.icon);

	const titleEl = wrap.createDiv();
	titleEl.style.fontSize = "16px";
	titleEl.style.fontWeight = "600";
	titleEl.style.marginBottom = "6px";
	titleEl.setText(cfg.title);

	const subtitleEl = wrap.createDiv();
	subtitleEl.style.fontSize = "13px";
	subtitleEl.style.opacity = "0.6";
	subtitleEl.style.lineHeight = "1.5";
	subtitleEl.setText(cfg.subtitle);

	if (opts.action || opts.secondaryAction) {
		const row = wrap.createDiv();
		row.style.display = "flex";
		row.style.gap = "8px";
		row.style.justifyContent = "center";
		row.style.marginTop = "16px";
		row.style.flexWrap = "wrap";

		if (opts.action) {
			const btn = row.createEl("button", { text: opts.action.label, cls: "mod-cta" });
			btn.addEventListener("click", () => opts.action!.onClick());
		}
		if (opts.secondaryAction) {
			const btn = row.createEl("button", { text: opts.secondaryAction.label });
			btn.addEventListener("click", () => opts.secondaryAction!.onClick());
		}
	}

	return wrap;
}

/** Lista todas as keys disponíveis (útil pra dev/test). */
export function listEmptyStateKeys(): string[] {
	return Object.keys(REGISTRY);
}
