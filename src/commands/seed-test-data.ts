/**
 * Atlas v0.52 Sprint D — Mass Test Data Seeder.
 *
 * Gera dados realistas em pasta `99_TestSeed/` para user testar Atlas:
 * - 10 pessoas (com cargos, times, emails)
 * - 5 sistemas (PIX, Stripe, Asaas, ERP, Salesforce)
 * - 3 produtos
 * - 3 cargos padronizados
 * - 8 sessões 1:1 mockadas (datas variadas)
 * - 20 action items (open/done/overdue)
 * - 3 reminders futuros
 *
 * User pode deletar `99_TestSeed/` inteira pra limpar — não polui vault real.
 *
 * Comando: `atlas:seed-test-data`
 */

import { Notice, normalizePath } from "obsidian";
import type AtlasPlugin from "../../main";
import { confirmAsync } from "../ui/confirm-modal";

const SEED_FOLDER = "99_TestSeed";
const SESSIONS_FOLDER = `${SEED_FOLDER}/sessions`;
const TASKS_FOLDER = `${SEED_FOLDER}/tasks`;

interface SeedPerson {
	name: string;
	role: string;
	team: string;
	email: string;
	type: "direct-report" | "peer" | "manager" | "coachee" | "skip-level";
}

const PEOPLE: SeedPerson[] = [
	{ name: "Miguel Veríssimo", role: "Tech Lead", team: "Pagamentos", email: "miguel@atlas.test", type: "direct-report" },
	{ name: "Maria Silva", role: "Senior Engineer", team: "Pagamentos", email: "maria@atlas.test", type: "direct-report" },
	{ name: "João Santos", role: "Engineer", team: "Pagamentos", email: "joao@atlas.test", type: "direct-report" },
	{ name: "Ana Costa", role: "Product Manager", team: "Produto", email: "ana@atlas.test", type: "peer" },
	{ name: "Pedro Almeida", role: "Engineering Manager", team: "Plataforma", email: "pedro@atlas.test", type: "peer" },
	{ name: "Carla Mendes", role: "Director", team: "Engenharia", email: "carla@atlas.test", type: "manager" },
	{ name: "Bruno Lima", role: "Engineer", team: "Infra", email: "bruno@atlas.test", type: "direct-report" },
	{ name: "Letícia Souza", role: "Designer", team: "Produto", email: "leticia@atlas.test", type: "peer" },
	{ name: "Rafael Oliveira", role: "DevOps", team: "Plataforma", email: "rafael@atlas.test", type: "peer" },
	{ name: "Juliana Pereira", role: "VP Eng", team: "Liderança", email: "juliana@atlas.test", type: "skip-level" },
];

const SYSTEMS = [
	{ name: "PIX", vendor: "BCB", description: "Sistema brasileiro de pagamentos instantâneos" },
	{ name: "Stripe", vendor: "Stripe Inc", description: "Gateway de pagamentos internacional" },
	{ name: "Asaas", vendor: "Asaas", description: "Plataforma BR de cobranças e boletos" },
	{ name: "ERP-interno", vendor: "Custom", description: "ERP proprietário do banco" },
	{ name: "Salesforce", vendor: "Salesforce.com", description: "CRM corporativo" },
];

const PRODUCTS = [
	{ name: "Pagamentos B2B", category: "B2B" },
	{ name: "Receita Recorrente", category: "Subscription" },
	{ name: "Onboarding KYC", category: "Compliance" },
];

const ROLES = [
	{ title: "Tech Lead", level: "L5" },
	{ title: "Senior Engineer", level: "L4" },
	{ title: "Director", level: "L7" },
];

const SESSION_TEMPLATES = [
	{ topics: ["Carga de trabalho", "Próximos sprints"], decisions: ["Pausar projeto X até Q3"] },
	{ topics: ["Career growth", "Liderança técnica"], decisions: ["Maria assume Tech Lead em 90d"] },
	{ topics: ["Conflito com PO", "Roadmap unclear"], decisions: ["Atlas vai marcar 1:1 com PO"] },
	{ topics: ["Feedback skip-level", "OKRs Q2"], decisions: [] },
	{ topics: ["Postmortem incident PIX", "Action items"], decisions: ["RCA em 7d"] },
	{ topics: ["Coaching session — comunicação", "GROW: Goal definido"], decisions: [] },
	{ topics: ["Performance review prep", "Strengths + growth areas"], decisions: ["Promoção L4→L5 next cycle"] },
	{ topics: ["Hiring panel feedback", "Decisão final"], decisions: ["Strong hire Senior Engineer"] },
];

function daysAgo(n: number): string {
	const d = new Date();
	d.setDate(d.getDate() - n);
	return d.toISOString().split("T")[0];
}

function daysFromNow(n: number): string {
	const d = new Date();
	d.setDate(d.getDate() + n);
	return d.toISOString();
}

export async function runSeedTestData(plugin: AtlasPlugin): Promise<void> {
	const ok = await confirmAsync(
		plugin.app,
		`Vai criar em \`${SEED_FOLDER}/\`:\n• 10 pessoas (com cargo, time, email)\n• 5 sistemas, 3 produtos, 3 cargos\n• 8 sessões 1:1 mockadas\n• 20 action items + 3 reminders\n\nNão afeta o resto do vault. Você pode deletar a pasta inteira pra limpar.`,
		{ title: "🌱 Gerar massa de teste", yesLabel: "🌱 Gerar agora", noLabel: "Cancelar" }
	);
	if (!ok) return;

	const notice = new Notice("Atlas: gerando massa de teste...", 0);

	try {
		// Ensure folders
		for (const f of [SEED_FOLDER, SESSIONS_FOLDER, TASKS_FOLDER]) {
			if (!plugin.app.vault.getAbstractFileByPath(f)) {
				await plugin.app.vault.createFolder(f);
			}
		}

		// 1. People (em KG + 1 nota índice por pessoa)
		const personIdMap: Record<string, string> = {};
		for (const p of PEOPLE) {
			const stored = plugin.kg.upsertPerson({
				name: p.name,
				role: p.role,
				team: p.team,
				email: p.email,
				type: p.type,
				aliases: [],
			});
			personIdMap[p.name] = stored.id;

			const path = normalizePath(`${SEED_FOLDER}/people-${stored.id}.md`);
			if (!plugin.app.vault.getAbstractFileByPath(path)) {
				const md = `---
type: person
name: "${p.name}"
role: "${p.role}"
team: "${p.team}"
email: "${p.email}"
person_type: "${p.type}"
seed: true
---

# ${p.name}

**Cargo:** ${p.role}
**Time:** ${p.team}
**Email:** ${p.email}

## Sessões recentes (auto via Dataview)
\`\`\`dataview
TABLE date, framework, file.link AS Nota
FROM "${SESSIONS_FOLDER}"
WHERE person = "${p.name}"
SORT date DESC
LIMIT 5
\`\`\`
`;
				await plugin.app.vault.create(path, md);
			}
		}

		// 2. Systems
		for (const s of SYSTEMS) {
			plugin.kg.upsertSystem({
				name: s.name,
				vendor: s.vendor,
				description: s.description,
			});
		}

		// 3. Products
		for (const pr of PRODUCTS) {
			plugin.kg.upsertProduct({
				name: pr.name,
				category: pr.category,
			});
		}

		// 4. Roles
		for (const r of ROLES) {
			plugin.kg.upsertRole({
				title: r.title,
				level: r.level,
			});
		}

		// 5. Sessions (1:1s mockadas)
		const subjects = PEOPLE.slice(0, 5); // primeiros 5 têm sessões
		let sessionCount = 0;
		for (let i = 0; i < SESSION_TEMPLATES.length; i++) {
			const tmpl = SESSION_TEMPLATES[i];
			const person = subjects[i % subjects.length];
			const date = daysAgo(7 * (i + 1)); // espaçadas 7 dias
			const id = `seed-session-${i}-${person.name.replace(/\s+/g, "-").toLowerCase()}`;
			const sourceNotePath = normalizePath(`${SESSIONS_FOLDER}/${date}-${person.name.replace(/\s+/g, "-").toLowerCase()}.md`);

			plugin.kg.upsertSession({
				id,
				date,
				type: "1on1",
				personId: personIdMap[person.name],
				participantIds: [personIdMap[person.name]],
				framework: i % 2 === 0 ? "GROW" : "CLEAR",
				durationMin: 30,
				topics: tmpl.topics,
				decisions: tmpl.decisions,
				sourceNotePath,
				confidential: false,
			});

			if (!plugin.app.vault.getAbstractFileByPath(sourceNotePath)) {
				const md = `---
type: 1on1
person: "${person.name}"
date: "${date}"
framework: "${i % 2 === 0 ? "GROW" : "CLEAR"}"
duration_min: 30
seed: true
---

# 1:1 com ${person.name} — ${date}

## 🎯 Goal
${tmpl.topics[0] ?? "—"}

## 🔍 Reality
${tmpl.topics.slice(1).map((t) => `- ${t}`).join("\n")}

## ✅ Decisões
${tmpl.decisions.length > 0 ? tmpl.decisions.map((d) => `- ${d}`).join("\n") : "- (nenhuma)"}

## 🤝 Action items
- [ ] [[${person.name}]] — Follow-up no próximo 1:1 (@${daysFromNow(14).split("T")[0]}) #followup
`;
				await plugin.app.vault.create(sourceNotePath, md);
			}
			sessionCount++;
		}

		// 6. Action items (mix open/done/overdue)
		const aiStates = [
			{ count: 8, due: () => daysFromNow(7) },     // open futuras
			{ count: 6, due: () => daysAgo(3) + "T18:00:00.000Z" }, // overdue
			{ count: 6, due: () => daysFromNow(0) + "T18:00:00.000Z" }, // hoje
		];
		let aiCount = 0;
		for (const group of aiStates) {
			for (let i = 0; i < group.count; i++) {
				const owner = PEOPLE[aiCount % PEOPLE.length];
				const id = `seed-ai-${aiCount}`;
				const description = `Task de teste #${aiCount + 1}: revisar ${SYSTEMS[aiCount % SYSTEMS.length].name}`;
				plugin.kg.upsertActionItem({
					id,
					description,
					ownerId: personIdMap[owner.name],
					dueDate: group.due(),
					status: "open",
					sourceNotePath: `${TASKS_FOLDER}/seed-ai-${aiCount}.md`,
				});
				aiCount++;
			}
		}

		// 7. Reminders (3 futuros)
		const reminderTexts = [
			{ text: "Revisar weekly report", days: 1 },
			{ text: "Skip-level com Carla", days: 3 },
			{ text: "Submeter compliance evidence", days: 7 },
		];
		const remindersPath = normalizePath(`${TASKS_FOLDER}/reminders-seed.md`);
		if (!plugin.app.vault.getAbstractFileByPath(remindersPath)) {
			const reminderLines = reminderTexts
				.map((r) => `- [ ] ${r.text} (@${daysFromNow(r.days).substring(0, 16).replace("T", " ")}) #reminder`)
				.join("\n");
			const md = `---
type: reminders-seed
seed: true
---

# Reminders de teste

${reminderLines}
`;
			await plugin.app.vault.create(remindersPath, md);
		}

		await plugin.kg.save();

		notice.hide();
		new Notice(
			`🌱 Massa criada em ${SEED_FOLDER}/:\n• ${PEOPLE.length} pessoas\n• ${SYSTEMS.length} sistemas, ${PRODUCTS.length} produtos, ${ROLES.length} cargos\n• ${sessionCount} sessões\n• ${aiCount} action items + ${reminderTexts.length} reminders`,
			10000
		);
	} catch (e) {
		notice.hide();
		new Notice(`Erro ao gerar massa: ${String(e)}`, 8000);
	}
}

/** Comando inverso — limpa pasta de seed (KG entries permanecem; user pode forget_person manual). */
export async function runClearSeedData(plugin: AtlasPlugin): Promise<void> {
	const ok = await confirmAsync(
		plugin.app,
		`Apagar pasta \`${SEED_FOLDER}/\` inteira?\n\nKG entries dos seed-* permanecem (use Active Learning pra rejeitar individualmente, ou tool forget_person).`,
		{ title: "🗑️ Limpar massa de teste", yesLabel: "🗑️ Apagar", noLabel: "Cancelar", danger: true }
	);
	if (!ok) return;

	try {
		const folder = plugin.app.vault.getAbstractFileByPath(SEED_FOLDER);
		if (folder) {
			await plugin.app.fileManager.trashFile(folder);
			new Notice(`✓ Pasta ${SEED_FOLDER} movida pra trash.`);
		} else {
			new Notice("Pasta de seed não existe.");
		}
	} catch (e) {
		new Notice(`Erro: ${String(e)}`, 6000);
	}
}
