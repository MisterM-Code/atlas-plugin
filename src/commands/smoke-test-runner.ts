/**
 * Atlas v0.52 Sprint D — Full smoke-test runner.
 *
 * Roda 25-30 testes E2E em sequência e cria nota markdown com pass/fail.
 * Diferente do `self-test` (v0.51.2 que só checa health), este faz CALLS REAIS
 * pros sistemas críticos.
 *
 * Comando: `atlas:smoke-test-run`
 */

import { Notice, normalizePath } from "obsidian";
import type AtlasPlugin from "../../main";

interface TestResult {
	name: string;
	category: string;
	pass: boolean;
	durationMs: number;
	detail?: string;
	errorStack?: string;
}

type TestFn = (plugin: AtlasPlugin) => Promise<{ ok: boolean; detail?: string }>;

interface TestCase {
	name: string;
	category: string;
	fn: TestFn;
}

const TESTS: TestCase[] = [
	// ─── Core systems ───
	{
		name: "Plugin loaded",
		category: "Core",
		fn: async (p) => ({ ok: !!p, detail: `version ${p.manifest.version}` }),
	},
	{
		name: "Settings loaded",
		category: "Core",
		fn: async (p) => ({ ok: !!p.settings, detail: `${Object.keys(p.settings).length} keys` }),
	},
	{
		name: "Vault folder structure",
		category: "Core",
		fn: async (p) => {
			const inbox = p.app.vault.getAbstractFileByPath(p.settings.folders.inbox);
			const atlas = p.app.vault.getAbstractFileByPath(p.settings.folders.atlas);
			return {
				ok: !!inbox && !!atlas,
				detail: `inbox: ${!!inbox} · atlas: ${!!atlas}`,
			};
		},
	},

	// ─── Ollama ───
	{
		name: "Ollama daemon ping",
		category: "Ollama",
		fn: async (p) => {
			try {
				const ok = await p.ollama?.ping?.();
				return { ok: !!ok, detail: ok ? "UP" : "DOWN" };
			} catch (e) {
				return { ok: false, detail: String(e) };
			}
		},
	},
	{
		name: "Ollama list models",
		category: "Ollama",
		fn: async (p) => {
			try {
				const models = await p.ollama?.listModels?.();
				return { ok: Array.isArray(models), detail: `${models?.length ?? 0} models` };
			} catch (e) {
				return { ok: false, detail: String(e) };
			}
		},
	},

	// ─── Knowledge Graph ───
	{
		name: "KG store loaded",
		category: "KG",
		fn: async (p) => ({ ok: !!p.kg?.data, detail: `${p.kg?.data?.people?.length ?? 0} people` }),
	},
	{
		name: "KG upsertPerson + lookup",
		category: "KG",
		fn: async (p) => {
			try {
				const stored = p.kg.upsertPerson({ name: "SmokeTest_AtlasUser_TEMP" });
				const found = p.kg.findPersonByName("SmokeTest_AtlasUser_TEMP");
				// Cleanup
				p.kg.data.people = p.kg.data.people.filter((x) => x.id !== stored.id);
				return { ok: !!found, detail: `id: ${stored.id}` };
			} catch (e) {
				return { ok: false, detail: String(e) };
			}
		},
	},
	{
		name: "KG findSystemByName",
		category: "KG",
		fn: async (p) => {
			try {
				const stored = p.kg.upsertSystem({ name: "SmokeSystem_TEMP" });
				const found = p.kg.findSystemByName("SmokeSystem_TEMP");
				p.kg.data.systems = p.kg.data.systems.filter((x) => x.id !== stored.id);
				return { ok: !!found, detail: stored.id };
			} catch (e) {
				return { ok: false, detail: String(e) };
			}
		},
	},

	// ─── Provider Router ───
	{
		name: "Provider router initialized",
		category: "Providers",
		fn: async (p) => ({
			ok: !!p.providerRouter,
			detail: p.providerRouter ? `${p.providerRouter.listConfiguredProviders().length} cloud providers` : "Ollama-only",
		}),
	},
	{
		name: "Routing resolves chat",
		category: "Providers",
		fn: async (p) => {
			const r = p.providerRouter?.resolveTask("chat");
			return { ok: !!r, detail: r ? `${r.provider}:${r.model}` : "—" };
		},
	},
	{
		name: "Cost tracker getSpend(day)",
		category: "Providers",
		fn: async (p) => {
			try {
				const tracker = (p as unknown as { costTracker?: { getSpend: (o: { window: "day" }) => Promise<{ totalUSD: number; callCount: number }> } }).costTracker;
				if (!tracker) return { ok: true, detail: "Ollama-only (no cost tracker)" };
				const agg = await tracker.getSpend({ window: "day" });
				return { ok: true, detail: `today: $${agg.totalUSD.toFixed(2)} (${agg.callCount} calls)` };
			} catch (e) {
				return { ok: false, detail: String(e) };
			}
		},
	},

	// ─── Tools ───
	{
		name: "Tool registry has create_person",
		category: "Tools",
		fn: async () => {
			const m = await import("../agent/tool-registry");
			const tools = m.getOllamaToolsSpec();
			const found = tools.some((t) => (t as { function?: { name?: string } })?.function?.name === "create_person");
			return { ok: found, detail: `${tools.length} tools` };
		},
	},
	{
		name: "Tool create_person + forget_person roundtrip",
		category: "Tools",
		fn: async (p) => {
			try {
				const m = await import("../agent/tool-registry");
				const r1 = await m.executeTool("create_person", { name: "SmokeTool_TEMP" }, p, { skipConfirm: true });
				if (!r1.ok) return { ok: false, detail: `create failed: ${r1.message}` };
				const r2 = await m.executeTool("forget_person", { name: "SmokeTool_TEMP" }, p, { skipConfirm: true });
				return { ok: r2.ok, detail: r2.message };
			} catch (e) {
				return { ok: false, detail: String(e) };
			}
		},
	},

	// ─── Intent dispatcher ───
	{
		name: "Intent: 'PIX com problema' detect",
		category: "Intent",
		fn: async (p) => {
			try {
				const m = await import("../agent/intent-dispatcher");
				// Add a test System pra dispatcher resolver
				const sys = p.kg.upsertSystem({ name: "PIX_SmokeTest" });
				const r = m.tryDispatch("PIX_SmokeTest com problema", p);
				p.kg.data.systems = p.kg.data.systems.filter((x) => x.id !== sys.id);
				const matched = r?.kind === "direct" && r.intent === "system_issue";
				return { ok: matched, detail: r?.kind ?? "no-match" };
			} catch (e) {
				return { ok: false, detail: String(e) };
			}
		},
	},
	{
		name: "Intent: 'lembrar reunião amanhã 14h' parses date",
		category: "Intent",
		fn: async (p) => {
			try {
				const m = await import("../agent/intent-dispatcher");
				const r = m.tryDispatch("lembrar reunião amanhã 14h", p);
				return {
					ok: r?.kind === "direct" || r?.kind === "needs_slot",
					detail: r?.kind ?? "no-match",
				};
			} catch (e) {
				return { ok: false, detail: String(e) };
			}
		},
	},

	// ─── Memory ───
	{
		name: "Memory addFact + getFacts",
		category: "Memory",
		fn: async (p) => {
			try {
				const fact = p.memory.addFact({ type: "fact", text: "smoke-test-fact-TEMP" });
				const found = p.memory.getFacts().some((f) => f.id === fact.id);
				p.memory.deleteFact(fact.id);
				return { ok: found, detail: `id ${fact.id}` };
			} catch (e) {
				return { ok: false, detail: String(e) };
			}
		},
	},
	{
		name: "Memory pendingSlot set/get/clear (v0.47)",
		category: "Memory",
		fn: async (p) => {
			try {
				p.memory.setPendingSlot?.({
					intent: "test",
					tool: "create_action_item",
					args: {},
					missing: "due_date",
					expiresAt: Date.now() + 60_000,
				});
				const got = p.memory.getPendingSlot?.();
				p.memory.clearPendingSlot?.();
				return { ok: got?.intent === "test", detail: got ? "set+get OK" : "fail" };
			} catch (e) {
				return { ok: false, detail: String(e) };
			}
		},
	},

	// ─── Embedder ───
	{
		name: "Embedder ready",
		category: "Embedder",
		fn: async (p) => ({
			ok: !!p.embedder,
			detail: `model ${p.settings.ollama.embeddingModel}`,
		}),
	},

	// ─── Notifier ───
	{
		name: "Notifier configured",
		category: "Notifier",
		fn: async (p) => {
			const channels: string[] = ["inAppNotice"];
			const n = p.settings.notifications;
			if (n?.desktopEnabled) channels.push("desktop");
			if (n?.telegramEnabled && n.telegramBotToken) channels.push("telegram");
			return { ok: !!p.notifier, detail: channels.join(",") };
		},
	},

	// ─── Detectors ───
	{
		name: "SystemDetector regex match",
		category: "Detectors",
		fn: async (p) => {
			try {
				const sys = p.kg.upsertSystem({ name: "SmokeDet_TEMP", aliases: [] });
				const m = await import("../automation/system-detector");
				const detector = new m.SystemDetector(p.app, p);
				const res = detector.detect("Hoje SmokeDet_TEMP teve um problema.");
				p.kg.data.systems = p.kg.data.systems.filter((x) => x.id !== sys.id);
				return { ok: res.length > 0, detail: `matched ${res.length}` };
			} catch (e) {
				return { ok: false, detail: String(e) };
			}
		},
	},

	// ─── Persistence ───
	{
		name: "KG save + reload",
		category: "Persistence",
		fn: async (p) => {
			try {
				await p.kg.save();
				const before = p.kg.data.people.length;
				await p.kg.load();
				return { ok: p.kg.data.people.length === before, detail: `${before} people` };
			} catch (e) {
				return { ok: false, detail: String(e) };
			}
		},
	},
	{
		name: "Extraction cache present",
		category: "Persistence",
		fn: async (p) => {
			try {
				const c = p.extractionCache;
				if (!c) return { ok: false, detail: "not initialized" };
				const stats = c.stats();
				return { ok: true, detail: `${stats.entries} entries · ${stats.sizeKB} KB` };
			} catch (e) {
				return { ok: false, detail: String(e) };
			}
		},
	},

	// ─── Logger persistence ───
	{
		name: "Atlas log file exists",
		category: "Logger",
		fn: async (p) => {
			const path = `${p.settings.folders.atlas}/atlas.log`;
			const f = p.app.vault.getAbstractFileByPath(path);
			return { ok: !!f, detail: f ? "file exists" : "not flushed yet (5s delay)" };
		},
	},

	// ─── Voice ───
	{
		name: "Voice config (whisper or web speech)",
		category: "Voice",
		fn: async (p) => {
			const wpath = p.settings.voice?.whisperBinaryPath ?? "";
			const webSpeech = typeof (window as unknown as { webkitSpeechRecognition?: unknown })
				.webkitSpeechRecognition !== "undefined";
			return {
				ok: wpath.length > 0 || webSpeech,
				detail: wpath.length > 0 ? "whisper.cpp configured" : webSpeech ? "Web Speech API fallback" : "no voice",
			};
		},
	},
];

export async function runSmokeTest(plugin: AtlasPlugin): Promise<void> {
	const notice = new Notice("Atlas: rodando smoke-test...", 0);
	const results: TestResult[] = [];

	for (const test of TESTS) {
		const start = performance.now();
		try {
			const r = await test.fn(plugin);
			results.push({
				name: test.name,
				category: test.category,
				pass: r.ok,
				durationMs: Math.round(performance.now() - start),
				detail: r.detail,
			});
		} catch (e) {
			results.push({
				name: test.name,
				category: test.category,
				pass: false,
				durationMs: Math.round(performance.now() - start),
				detail: String(e).substring(0, 200),
				errorStack: (e as Error)?.stack?.substring(0, 600),
			});
		}
	}

	notice.hide();

	// Build report markdown
	const passed = results.filter((r) => r.pass).length;
	const total = results.length;
	const dateIso = new Date().toISOString();
	const date = dateIso.split("T")[0];

	const lines: string[] = [
		`---`,
		`type: atlas-smoke-test`,
		`date: ${dateIso}`,
		`passed: ${passed}/${total}`,
		`---`,
		``,
		`# 🧪 Atlas Smoke Test — ${dateIso.substring(0, 19).replace("T", " ")}`,
		``,
		`**Resultado:** ${passed}/${total} passed${passed === total ? " ✅" : passed >= total * 0.8 ? " 🟡" : " 🔴"}`,
		`**Versão:** v${plugin.manifest.version}`,
		``,
	];

	// Group by category
	const byCategory = new Map<string, TestResult[]>();
	for (const r of results) {
		const arr = byCategory.get(r.category) ?? [];
		arr.push(r);
		byCategory.set(r.category, arr);
	}

	for (const [cat, items] of byCategory) {
		const okCount = items.filter((i) => i.pass).length;
		lines.push(`## ${cat} — ${okCount}/${items.length}`);
		lines.push(``);
		lines.push(`| Test | Status | Time | Detail |`);
		lines.push(`|---|---|---|---|`);
		for (const r of items) {
			const emoji = r.pass ? "✅" : "❌";
			const detail = (r.detail ?? "").replace(/\|/g, "\\|").substring(0, 80);
			lines.push(`| ${r.name} | ${emoji} | ${r.durationMs}ms | ${detail} |`);
		}
		lines.push(``);
	}

	// Failures detail (collapsible)
	const failures = results.filter((r) => !r.pass);
	if (failures.length > 0) {
		lines.push(`## ❌ Falhas detalhadas`);
		lines.push(``);
		for (const f of failures) {
			lines.push(`### ${f.name} (${f.category})`);
			lines.push(`- **Detail:** ${f.detail ?? "—"}`);
			if (f.errorStack) {
				lines.push("");
				lines.push("```");
				lines.push(f.errorStack);
				lines.push("```");
			}
			lines.push(``);
		}
	}

	const md = lines.join("\n");
	const reportPath = normalizePath(`${plugin.settings.folders.inbox}/${date}-atlas-smoke-test.md`);
	if (!plugin.app.vault.getAbstractFileByPath(plugin.settings.folders.inbox)) {
		await plugin.app.vault.createFolder(plugin.settings.folders.inbox);
	}
	const existing = plugin.app.vault.getAbstractFileByPath(reportPath);
	let f;
	if (existing && "stat" in existing) {
		await plugin.app.vault.modify(existing as never, md);
		f = existing;
	} else {
		f = await plugin.app.vault.create(reportPath, md);
	}
	if (f && "stat" in f) {
		await plugin.app.workspace.getLeaf().openFile(f as never);
	}

	new Notice(
		`🧪 Smoke test: ${passed}/${total} passed${passed === total ? " ✅" : "  — veja relatório"}`,
		8000
	);
}
