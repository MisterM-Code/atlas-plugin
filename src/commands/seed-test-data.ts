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

	// v0.53: integration log — registra cada step + relationships criados.
	// Aparece no final da seed em formato JSON pra user/dev verificar.
	const integrationLog: { step: string; created?: number; cross_links?: number; detail: string }[] = [];

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

		// v0.53: 6. THEMES — recorrentes em múltiplas sessões (cross-references)
		// Auto-extract themes do SESSION_TEMPLATES + criar Theme entries no KG
		const THEMES_RECURRING = [
			{ name: "carga-trabalho", sentiment: "blocker" as const, count: 4 },
			{ name: "lideranca", sentiment: "growth" as const, count: 3 },
			{ name: "carreira", sentiment: "neutral" as const, count: 2 },
			{ name: "comunicacao", sentiment: "blocker" as const, count: 3 },
			{ name: "performance", sentiment: "growth" as const, count: 2 },
		];
		let themeLinkCount = 0;
		for (const t of THEMES_RECURRING) {
			// Distribuir o tema em N sessões diferentes (cross-link)
			for (let s = 0; s < t.count && s < SESSION_TEMPLATES.length; s++) {
				const session = subjects[s % subjects.length];
				const sessionId = `seed-session-${s}-${session.name.replace(/\s+/g, "-").toLowerCase()}`;
				plugin.kg.upsertTheme({
					name: t.name,
					sentiment: t.sentiment,
					scope: "pessoa",
					personId: personIdMap[session.name],
					sessionId,
				});
				themeLinkCount++;
			}
		}
		integrationLog.push({
			step: "themes",
			created: THEMES_RECURRING.length,
			cross_links: themeLinkCount,
			detail: `${THEMES_RECURRING.length} themes recorrentes, ${themeLinkCount} cross-references com sessions`,
		});

		// v0.53: 7. COMMITMENTS — bidirecionais (Eu↔Person)
		const COMMITMENTS_TEMPLATES = [
			{ from: "eu", to: PEOPLE[0].name, text: "Resolver bloqueio do PIX em 7 dias", weight: "high" as const, daysOut: 7 },
			{ from: "eu", to: PEOPLE[1].name, text: "Promover Maria pra Tech Lead próximo cycle", weight: "high" as const, daysOut: 90 },
			{ from: PEOPLE[0].name, to: "eu", text: "Conversar com PO sobre repriorização até sexta", weight: "medium" as const, daysOut: 5 },
			{ from: PEOPLE[2].name, to: "eu", text: "Submeter PR-432 review até quarta", weight: "medium" as const, daysOut: 3 },
			{ from: "eu", to: PEOPLE[5].name, text: "Skip-level mensal — agendar próximo", weight: "low" as const, daysOut: 14 },
		];
		let commitmentCount = 0;
		for (const c of COMMITMENTS_TEMPLATES) {
			const fromId = c.from === "eu" ? "eu" : personIdMap[c.from] ?? "eu";
			const toId = c.to === "eu" ? "eu" : personIdMap[c.to] ?? "eu";
			plugin.kg.upsertCommitment({
				id: `seed-commit-${commitmentCount}`,
				text: c.text,
				madeBy: fromId,
				madeTo: toId,
				dueDate: daysFromNow(c.daysOut).split("T")[0],
				status: "open",
				weight: c.weight,
				sessionId: `seed-session-${commitmentCount % SESSION_TEMPLATES.length}-${subjects[commitmentCount % subjects.length].name.replace(/\s+/g, "-").toLowerCase()}`,
				sourceNotePath: `${SESSIONS_FOLDER}/seed-commit-${commitmentCount}.md`,
			});
			commitmentCount++;
		}
		integrationLog.push({
			step: "commitments",
			created: commitmentCount,
			detail: `${commitmentCount} commitments bidirecionais (Eu↔Person) com session links + due dates`,
		});

		// 8. Action items COM RELATIONSHIPS (person + system + session)
		const aiStates = [
			{ count: 8, due: () => daysFromNow(7) },
			{ count: 6, due: () => daysAgo(3) + "T18:00:00.000Z" },
			{ count: 6, due: () => daysFromNow(0) + "T18:00:00.000Z" },
		];
		let aiCount = 0;
		const aiCrossLinks: { person: string; system: string; session: string }[] = [];
		for (const group of aiStates) {
			for (let i = 0; i < group.count; i++) {
				const owner = PEOPLE[aiCount % PEOPLE.length];
				const system = SYSTEMS[aiCount % SYSTEMS.length];
				const sessionIdx = aiCount % SESSION_TEMPLATES.length;
				const sessionRef = subjects[sessionIdx];
				const sessionId = `seed-session-${sessionIdx}-${sessionRef.name.replace(/\s+/g, "-").toLowerCase()}`;
				const id = `seed-ai-${aiCount}`;
				const description = `Revisar [[Sistema: ${system.name}]] — owner [[${owner.name}]]`;
				plugin.kg.upsertActionItem({
					id,
					description,
					ownerId: personIdMap[owner.name],
					dueDate: group.due(),
					status: "open",
					sessionId, // ← cross-link
					sourceNotePath: `${TASKS_FOLDER}/seed-ai-${aiCount}.md`,
				});
				aiCrossLinks.push({ person: owner.name, system: system.name, session: sessionId });
				aiCount++;
			}
		}
		integrationLog.push({
			step: "action_items",
			created: aiCount,
			cross_links: aiCrossLinks.length,
			detail: `${aiCount} action items, todos com (ownerId + sessionId), wikilink pra Sistema no description`,
		});

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

		// v0.53: log finais pra steps que não logaram explicitly
		integrationLog.unshift(
			{ step: "people", created: PEOPLE.length, detail: `${PEOPLE.length} pessoas (cargos: TL/Sr/Eng/PM/EM/Director/Designer/DevOps/VP)` },
			{ step: "systems", created: SYSTEMS.length, detail: `${SYSTEMS.length} sistemas (PIX/Stripe/Asaas/ERP/Salesforce)` },
			{ step: "products", created: PRODUCTS.length, detail: `${PRODUCTS.length} produtos` },
			{ step: "roles", created: ROLES.length, detail: `${ROLES.length} cargos padronizados` },
			{ step: "sessions", created: sessionCount, detail: `${sessionCount} sessões 1:1 (GROW/CLEAR alternados, espaçadas 7d)` },
			{ step: "reminders", created: reminderTexts.length, detail: `${reminderTexts.length} reminders futuros (1d/3d/7d)` }
		);

		await plugin.kg.save();

		// v0.53: KG integrity report — verifica relationships após save
		const kgData = plugin.kg.data;
		const integrity = {
			people: kgData.people.length,
			systems: kgData.systems.length,
			products: kgData.products.length,
			roles: kgData.roles.length,
			sessions: kgData.sessions.length,
			actionItems: kgData.actionItems.length,
			commitments: kgData.commitments.length,
			themes: kgData.themes.length,
			// Cross-link checks
			actionItemsWithOwner: kgData.actionItems.filter((a) => !!a.ownerId).length,
			actionItemsWithSession: kgData.actionItems.filter((a) => !!a.sessionId).length,
			commitmentsWithSession: kgData.commitments.filter((c) => !!c.sessionId).length,
			themesWithPerson: kgData.themes.filter((t) => t.personIds.length > 0).length,
			themesWithSession: kgData.themes.filter((t) => t.sessionIds.length > 0).length,
			sessionsWithPerson: kgData.sessions.filter((s) => !!s.personId).length,
		};

		// Write integration report to vault
		const reportLines: string[] = [
			`---`,
			`type: atlas-seed-report`,
			`date: ${new Date().toISOString()}`,
			`---`,
			``,
			`# 🌱 Atlas Seed Integration Report`,
			``,
			`**Created** in \`${SEED_FOLDER}/\` em ${new Date().toLocaleString("pt-BR")}`,
			``,
			`## 📊 Steps`,
			``,
			`| Step | Created | Cross-links | Detail |`,
			`|---|---|---|---|`,
		];
		for (const log of integrationLog) {
			reportLines.push(
				`| ${log.step} | ${log.created ?? "—"} | ${log.cross_links ?? "—"} | ${log.detail.replace(/\|/g, "\\|")} |`
			);
		}
		reportLines.push(``, `## 🔗 KG Integrity (post-save verification)`, ``);
		reportLines.push(`| Entity | Count | Cross-links resolved |`);
		reportLines.push(`|---|---|---|`);
		reportLines.push(`| People | ${integrity.people} | — |`);
		reportLines.push(`| Systems | ${integrity.systems} | — |`);
		reportLines.push(`| Products | ${integrity.products} | — |`);
		reportLines.push(`| Roles | ${integrity.roles} | — |`);
		reportLines.push(`| Sessions | ${integrity.sessions} | ${integrity.sessionsWithPerson}/${integrity.sessions} com personId |`);
		reportLines.push(`| Action items | ${integrity.actionItems} | ${integrity.actionItemsWithOwner} c/owner · ${integrity.actionItemsWithSession} c/session |`);
		reportLines.push(`| Commitments | ${integrity.commitments} | ${integrity.commitmentsWithSession} c/session |`);
		reportLines.push(`| Themes | ${integrity.themes} | ${integrity.themesWithPerson} c/person · ${integrity.themesWithSession} c/session |`);
		reportLines.push(``, `## 📋 Raw integrationLog (JSON)`, ``, "```json", JSON.stringify(integrationLog, null, 2), "```");
		reportLines.push(``, `## 🔍 Verificação manual`, ``);
		reportLines.push(`- Tab Knowledge → Pessoas: deve mostrar ${integrity.people} cards`);
		reportLines.push(`- Tab Knowledge → Sistemas: ${integrity.systems} cards`);
		reportLines.push(`- Tab Hub → Action items: ${integrity.actionItems} items (mix open/today/overdue)`);
		reportLines.push(`- Today tab → Próximos compromissos: deve listar 1:1s mockadas`);
		reportLines.push(`- Cmd+P → "atlas: report person sessions" + "Miguel" → relatório c/ ${integrity.sessions}+ sessões`);

		const reportPath = normalizePath(`${SEED_FOLDER}/_integration-report.md`);
		try {
			await plugin.app.vault.adapter.write(reportPath, reportLines.join("\n"));
		} catch {
			// best-effort
		}

		// Logger output (vai pra .atlas/atlas.log + LogView)
		const { logger } = await import("../utils/logger");
		logger.info("seed: completed", { integrity, integrationLog });

		notice.hide();
		new Notice(
			`🌱 Massa criada em ${SEED_FOLDER}/:\n` +
				`• ${PEOPLE.length} pessoas · ${SYSTEMS.length} sistemas · ${PRODUCTS.length} produtos · ${ROLES.length} cargos\n` +
				`• ${sessionCount} sessões · ${commitmentCount} commitments · ${themeLinkCount} theme-links\n` +
				`• ${aiCount} action items · ${reminderTexts.length} reminders\n` +
				`📋 Relatório: ${SEED_FOLDER}/_integration-report.md`,
			15000
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
