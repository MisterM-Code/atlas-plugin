/**
 * Atlas v0.51.2 — Self-Test diagnostic.
 *
 * Roda todos os sistemas críticos e reporta status. Útil para troubleshooting.
 * Output: nota markdown em Inbox com checklist.
 */

import { Notice, normalizePath } from "obsidian";
import type AtlasPlugin from "../../main";

interface CheckResult {
	name: string;
	ok: boolean;
	detail: string;
}

export async function runSelfTest(plugin: AtlasPlugin): Promise<void> {
	const notice = new Notice("Atlas: rodando self-test...", 0);
	const results: CheckResult[] = [];

	// 1. Ollama daemon
	try {
		const ok = await plugin.ollama?.ping?.();
		results.push({
			name: "Ollama daemon",
			ok: !!ok,
			detail: ok ? `up (modelo: ${plugin.settings.ollama.generationModel})` : "DOWN — verifique se Ollama está rodando",
		});
	} catch (e) {
		results.push({ name: "Ollama daemon", ok: false, detail: `erro: ${String(e)}` });
	}

	// 2. KG store
	try {
		const data = plugin.kg?.data;
		const totals = {
			people: data?.people?.length ?? 0,
			systems: data?.systems?.length ?? 0,
			products: data?.products?.length ?? 0,
			sessions: data?.sessions?.length ?? 0,
			actionItems: data?.actionItems?.length ?? 0,
			themes: data?.themes?.length ?? 0,
		};
		const total = Object.values(totals).reduce((a, b) => a + b, 0);
		results.push({
			name: "Knowledge Graph",
			ok: !!data,
			detail: data
				? `${total} entities (${totals.people} pessoas, ${totals.systems} sistemas, ${totals.sessions} sessões, ${totals.actionItems} actions)`
				: "KG não inicializado",
		});
	} catch (e) {
		results.push({ name: "Knowledge Graph", ok: false, detail: `erro: ${String(e)}` });
	}

	// 3. Provider Router (cloud routing)
	try {
		const router = plugin.providerRouter;
		if (router) {
			const configured = router.listConfiguredProviders();
			const route = router.resolveTask("chat");
			results.push({
				name: "Provider Router",
				ok: true,
				detail: `${configured.length} providers configurados (${configured.join(", ") || "só ollama"}). Chat → ${route?.provider ?? "ollama"}:${route?.model ?? "default"}`,
			});
		} else {
			results.push({ name: "Provider Router", ok: true, detail: "modo Ollama-only (sem cloud)" });
		}
	} catch (e) {
		results.push({ name: "Provider Router", ok: false, detail: `erro: ${String(e)}` });
	}

	// 4. Cost tracker
	try {
		const tracker = (plugin as unknown as {
			costTracker?: { getSpend: (opts: { window: "day" | "month" }) => Promise<{ totalUSD: number }> };
		}).costTracker;
		if (tracker) {
			const day = await tracker.getSpend({ window: "day" });
			const month = await tracker.getSpend({ window: "month" });
			results.push({
				name: "Cost Tracker",
				ok: true,
				detail: `hoje: $${day.totalUSD.toFixed(2)} · mês: $${month.totalUSD.toFixed(2)}`,
			});
		} else {
			results.push({ name: "Cost Tracker", ok: true, detail: "não inicializado (Ollama-only?)" });
		}
	} catch (e) {
		results.push({ name: "Cost Tracker", ok: false, detail: `erro: ${String(e)}` });
	}

	// 5. Embedder
	try {
		const ok = !!plugin.embedder;
		results.push({
			name: "Embedder",
			ok,
			detail: ok ? `modelo: ${plugin.settings.ollama.embeddingModel}` : "não inicializado",
		});
	} catch (e) {
		results.push({ name: "Embedder", ok: false, detail: `erro: ${String(e)}` });
	}

	// 6. Memory
	try {
		const factsCount = plugin.memory?.getFacts().length ?? 0;
		const sessionId = plugin.memory?.getCurrentSession()?.id;
		results.push({
			name: "Memory (Mem0-lite)",
			ok: !!plugin.memory,
			detail: `${factsCount} fatos · session ${sessionId?.substring(0, 12) ?? "(none)"}`,
		});
	} catch (e) {
		results.push({ name: "Memory", ok: false, detail: `erro: ${String(e)}` });
	}

	// 7. Extraction cache
	try {
		const cache = plugin.extractionCache;
		if (cache) {
			const stats = cache.stats();
			results.push({
				name: "Extraction Cache",
				ok: true,
				detail: `${stats.entries} entries · ${stats.sizeKB} KB`,
			});
		} else {
			results.push({ name: "Extraction Cache", ok: false, detail: "não inicializado" });
		}
	} catch (e) {
		results.push({ name: "Extraction Cache", ok: false, detail: `erro: ${String(e)}` });
	}

	// 8. Notifier
	try {
		const channels: string[] = ["inAppNotice"];
		const notif = plugin.settings.notifications;
		if (notif?.desktopEnabled) channels.push("desktop");
		if (notif?.telegramEnabled && notif.telegramBotToken) channels.push("telegram");
		if (notif?.ttsEnabled && notif.ttsBinaryPath) channels.push("tts");
		results.push({
			name: "Notifier",
			ok: !!plugin.notifier,
			detail: `canais ativos: ${channels.join(", ")}`,
		});
	} catch (e) {
		results.push({ name: "Notifier", ok: false, detail: `erro: ${String(e)}` });
	}

	// 9. Scheduler
	try {
		results.push({
			name: "Scheduler",
			ok: !!plugin.scheduler,
			detail: plugin.scheduler ? "ativo" : "não inicializado",
		});
	} catch (e) {
		results.push({ name: "Scheduler", ok: false, detail: `erro: ${String(e)}` });
	}

	// 10. iCal cache
	try {
		const url = plugin.settings.profile?.calendarUrl;
		if (url) {
			const m = await import("../integrations/ical");
			const ical = new m.IcalClient(plugin.app, plugin.settings.folders.atlas);
			const cache = await ical.loadCache();
			results.push({
				name: "iCal Cache",
				ok: !!cache,
				detail: cache
					? `${cache.events.length} events · last fetch ${cache.fetchedAt.split("T")[0]}`
					: "sem cache (rode 'iCal: sincronizar')",
			});
		} else {
			results.push({ name: "iCal Cache", ok: true, detail: "não configurado (URL .ics ausente)" });
		}
	} catch (e) {
		results.push({ name: "iCal Cache", ok: false, detail: `erro: ${String(e)}` });
	}

	// 11. Voice (whisper config)
	try {
		const wpath = plugin.settings.voice?.whisperBinaryPath ?? "";
		const wmodel = plugin.settings.voice?.whisperModelPath ?? "";
		const ok = wpath.length > 0 && wmodel.length > 0;
		results.push({
			name: "Voice (whisper.cpp)",
			ok,
			detail: ok
				? `binary + model configurados`
				: "não configurado (Settings → Voice). Web Speech API fallback ativo (precisa internet).",
		});
	} catch (e) {
		results.push({ name: "Voice", ok: false, detail: `erro: ${String(e)}` });
	}

	// 12. Backup KG
	try {
		const backupPath = normalizePath(`${plugin.settings.folders.atlas}/backups`);
		const folder = plugin.app.vault.getAbstractFileByPath(backupPath);
		const files = plugin.app.vault
			.getFiles()
			.filter((f) => f.path.startsWith(backupPath));
		results.push({
			name: "KG Backups",
			ok: files.length > 0,
			detail: files.length > 0
				? `${files.length} backups disponíveis em ${backupPath}`
				: `${folder ? "folder existe" : "folder ausente"} — primeiro backup será criado em próximo onunload`,
		});
	} catch (e) {
		results.push({ name: "KG Backups", ok: false, detail: `erro: ${String(e)}` });
	}

	notice.hide();

	// Build markdown report
	const okCount = results.filter((r) => r.ok).length;
	const totalCount = results.length;
	const date = new Date().toISOString();
	const lines: string[] = [
		`---`,
		`type: atlas-selftest`,
		`date: ${date}`,
		`---`,
		``,
		`# 🩺 Atlas Self-Test — ${date.substring(0, 19).replace("T", " ")}`,
		``,
		`**Resultado:** ${okCount}/${totalCount} sistemas OK`,
		``,
		`| Sistema | Status | Detalhes |`,
		`|---|---|---|`,
	];
	for (const r of results) {
		const emoji = r.ok ? "✅" : "❌";
		lines.push(`| ${r.name} | ${emoji} | ${r.detail} |`);
	}
	lines.push(``);
	lines.push(`## Versão`);
	lines.push(`- Atlas v${plugin.manifest.version}`);
	lines.push(`- Obsidian min: ${plugin.manifest.minAppVersion}`);
	lines.push(``);
	lines.push(`## Próximas ações sugeridas`);
	const failures = results.filter((r) => !r.ok);
	if (failures.length === 0) {
		lines.push(`- Tudo OK! 🎉`);
	} else {
		for (const f of failures) {
			lines.push(`- **${f.name}**: ${f.detail}`);
		}
	}

	const md = lines.join("\n");
	const dateStr = date.split("T")[0];
	const path = normalizePath(`${plugin.settings.folders.inbox}/${dateStr}-atlas-selftest.md`);
	if (!plugin.app.vault.getAbstractFileByPath(plugin.settings.folders.inbox)) {
		await plugin.app.vault.createFolder(plugin.settings.folders.inbox);
	}
	const existing = plugin.app.vault.getAbstractFileByPath(path);
	let f;
	if (existing && "stat" in existing) {
		await plugin.app.vault.modify(existing as never, md);
		f = existing;
	} else {
		f = await plugin.app.vault.create(path, md);
	}
	if (f && "stat" in f) {
		await plugin.app.workspace.getLeaf().openFile(f as never);
	}

	new Notice(`Atlas Self-Test: ${okCount}/${totalCount} OK · relatório em ${path}`, 6000);
}
