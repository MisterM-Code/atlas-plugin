import { Notice, MarkdownView, TFile, MarkdownRenderer, Component } from "obsidian";
import type AtlasPlugin from "../../../main";
import { Agent } from "../../agent/agent";
import { t } from "../../i18n";

/**
 * Renders Atlas Chat dentro do master sidebar.
 * Implementação inline (não reusa AtlasChatView ItemView pra evitar duplicar registerView).
 */
export async function renderChatTab(container: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	container.empty();
	container.addClass("atlas-chat-tab");

	// v0.70.0: Header polido com gradient cyan→indigo (consistente com Iron Man HUD aesthetic)
	const header = container.createDiv({ cls: "atlas-chat-header" });
	const titleWrap = header.createDiv({ cls: "atlas-chat-header-titlewrap" });
	titleWrap.createEl("h3", { cls: "atlas-chat-header-title", text: t("chat.title") });

	const headerActions = header.createDiv({ cls: "atlas-chat-header-actions" });
	const newBtn = headerActions.createEl("button", {
		cls: "atlas-chat-btn-pill",
		text: t("chat.btn.new"),
	});
	const clearBtn = headerActions.createEl("button", {
		cls: "atlas-chat-btn-pill",
		text: t("chat.btn.clear"),
	});

	// Subtitle: differentiate from Jarvis
	const subtitle = container.createDiv({ cls: "atlas-chat-subtitle" });
	subtitle.createSpan({ text: t("chat.subtitle") + " " });
	const jarvisHintBtn = subtitle.createEl("a", { cls: "atlas-chat-jarvis-hint", text: t("chat.jarvis.hint") });
	jarvisHintBtn.addEventListener("click", async (e) => {
		e.preventDefault();
		const apiAny = plugin.app as unknown as {
			commands?: { executeCommandById?: (id: string) => void };
		};
		apiAny.commands?.executeCommandById?.("atlas:jarvis");
	});

	// Messages
	const messagesEl = container.createDiv({ cls: "atlas-chat-messages" });

	// v0.70.0: Empty state com personalidade + suggestion chips clicáveis
	const renderEmptyState = (): void => {
		if (messagesEl.children.length > 0) return; // skip se já tem messages
		const emptyEl = messagesEl.createDiv({ cls: "atlas-chat-empty-state" });
		emptyEl.createDiv({ cls: "atlas-chat-empty-emoji", text: "🧠" });
		emptyEl.createEl("h3", { cls: "atlas-chat-empty-title", text: t("chat.empty.title") });
		emptyEl.createEl("p", { cls: "atlas-chat-empty-subtitle", text: t("chat.empty.subtitle") });
		const sugWrap = emptyEl.createDiv({ cls: "atlas-chat-empty-suggestions" });
		const suggestions = [
			t("chat.empty.suggest1"),
			t("chat.empty.suggest2"),
			t("chat.empty.suggest3"),
		];
		for (const s of suggestions) {
			const chip = sugWrap.createDiv({ cls: "atlas-chat-empty-chip", text: s });
			chip.addEventListener("click", () => {
				inputEl.value = s;
				inputEl.focus();
			});
		}
	};

	// Input
	const inputWrap = container.createDiv({ cls: "atlas-chat-input-area" });
	inputWrap.style.borderTop = "1px solid var(--background-modifier-border)";
	inputWrap.style.padding = "8px 0";

	const inputEl = inputWrap.createEl("textarea", { cls: "atlas-chat-input" });
	inputEl.placeholder = t("chat.placeholder");
	inputEl.style.width = "100%";
	inputEl.style.minHeight = "60px";
	inputEl.style.padding = "6px";
	inputEl.style.fontSize = "13px";

	const inputActions = inputWrap.createDiv();
	inputActions.style.display = "flex";
	inputActions.style.justifyContent = "space-between";
	inputActions.style.alignItems = "center";
	inputActions.style.marginTop = "6px";
	inputActions.style.gap = "8px";

	const statusEl = inputActions.createEl("span") as HTMLSpanElement;
	statusEl.style.fontSize = "10px";
	statusEl.style.opacity = "0.5";
	statusEl.style.flexGrow = "1";

	// v0.8: Voice toggle 🔊 (lê respostas com Piper)
	const ttsToggle = inputActions.createEl("button", { text: "🔇" }) as HTMLButtonElement;
	ttsToggle.style.padding = "4px 8px";
	ttsToggle.style.fontSize = "12px";
	ttsToggle.title = "Ler respostas em voz alta (Piper TTS)";
	let ttsEnabled = false;
	ttsToggle.addEventListener("click", () => {
		ttsEnabled = !ttsEnabled;
		ttsToggle.setText(ttsEnabled ? "🔊" : "🔇");
		ttsToggle.title = ttsEnabled
			? "TTS ON — respostas serão faladas"
			: "TTS OFF — click pra ativar";
	});

	// v0.8: Voice input 🎙️ (whisper.cpp)
	const micBtn = inputActions.createEl("button", { text: "🎙️" }) as HTMLButtonElement;
	micBtn.style.padding = "4px 8px";
	micBtn.style.fontSize = "12px";
	micBtn.title = "Falar (gravar voz → transcrever no input)";
	let recording: { stop: () => Promise<{ tempFile: string } | null>; cancel: () => void } | null = null;
	micBtn.addEventListener("click", async () => {
		if (recording) {
			micBtn.setText("⏳");
			micBtn.disabled = true;
			try {
				const result = await recording.stop();
				recording = null;
				if (!result) {
					micBtn.setText("🎙️");
					micBtn.disabled = false;
					return;
				}
				const { transcribeAudio } = await import("../../automation/voice-input");
				const cfg = plugin.settings.voice;
				const text = await transcribeAudio(result.tempFile, {
					whisperBinaryPath: cfg.whisperBinaryPath,
					whisperModelPath: cfg.whisperModelPath,
					language: cfg.language ?? "pt",
				});
				inputEl.value = (inputEl.value ? inputEl.value + " " : "") + text;
				inputEl.focus();
			} catch (e) {
				new Notice(`Atlas voice: ${String(e)}`, 8000);
			} finally {
				micBtn.setText("🎙️");
				micBtn.disabled = false;
				micBtn.style.background = "";
			}
		} else {
			try {
				const { startVoiceRecording } = await import("../../automation/voice-input");
				recording = await startVoiceRecording();
				micBtn.setText("⏸️");
				micBtn.style.background = "var(--color-red)";
			} catch (e) {
				new Notice(`Atlas: mic não disponível — ${String(e)}`, 8000);
			}
		}
	});

	const sendBtn = inputActions.createEl("button", { text: t("chat.btn.send") }) as HTMLButtonElement;

	const agent = new Agent(
		plugin.app,
		plugin.ollama,
		plugin.memory,
		plugin.kg,
		plugin.embedder,
		plugin.settings.ollama.generationModel
	);
	agent.setPlugin(plugin);

	const renderCitations = (
		wrap: HTMLDivElement,
		citations: { notePath: string; snippet?: string }[]
	): void => {
		const citWrap = wrap.createDiv({ cls: "atlas-chat-citations" });
		const seen = new Set<string>();
		for (const c of citations) {
			if (seen.has(c.notePath)) continue;
			seen.add(c.notePath);
			const chip = citWrap.createEl("span", {
				cls: "atlas-citation-card",
				text: `📄 ${c.notePath.split("/").pop()?.replace(/\.md$/, "")}`,
			});
			// v0.57: hover tooltip com snippet (se disponível)
			if (c.snippet) {
				chip.title = c.snippet.slice(0, 280);
			} else {
				chip.title = c.notePath;
			}
			chip.addEventListener("click", () => {
				chip.addClass("is-clicked");
				setTimeout(() => chip.removeClass("is-clicked"), 280);
				const f = plugin.app.vault.getAbstractFileByPath(c.notePath);
				if (f instanceof TFile) plugin.app.workspace.getLeaf().openFile(f);
			});
		}
	};

	// v0.54.0: Component owner for MarkdownRenderer lifecycle (cleanup hooks)
	const mdComponent = new Component();

	const renderTurn = (
		role: "user" | "assistant",
		content: string,
		citations: { notePath: string; snippet: string }[] = [],
		opts: { markdown?: boolean } = {}
	): HTMLDivElement => {
		// v0.52.7: layout horizontal com avatar + bubble
		const cls = role === "user"
			? "atlas-chat-message atlas-chat-message-user atlas-chat-bubble-row"
			: "atlas-chat-message atlas-chat-message-assistant atlas-chat-bubble-row";
		const wrap = messagesEl.createDiv({ cls });

		// Avatar (Atlas logo SVG OR user gradient circle)
		const avatar = wrap.createDiv({ cls: `atlas-chat-avatar atlas-chat-avatar-${role}` });
		if (role === "assistant") {
			// Atlas brain emoji avatar com glow
			avatar.createSpan({ cls: "atlas-emoji atlas-chat-avatar-emoji", text: "🧠" });
		} else {
			// User: primeira letra do display name
			const initial = (plugin.settings.user?.displayName ?? "M").charAt(0).toUpperCase();
			avatar.createSpan({ cls: "atlas-chat-avatar-initial", text: initial });
		}

		// Bubble container (label + body + citations)
		const bubble = wrap.createDiv({ cls: "atlas-chat-bubble" });

		const lbl = bubble.createDiv({
			cls: "atlas-chat-msg-label",
			text: role === "user" ? (plugin.settings.user?.displayName ?? t("chat.you")) : t("chat.atlas"),
		});
		void lbl;

		const body = bubble.createDiv({ cls: "atlas-msg-body" });
		// v0.54.0: usar MarkdownRenderer pra parsing **bold**, [links](path), listas, code blocks, etc.
		// Streaming: durante streaming usa setText (plain). Após terminar, re-render markdown via opts.markdown:true.
		if (opts.markdown && role === "assistant") {
			void MarkdownRenderer.render(plugin.app, content, body, "", mdComponent);
		} else {
			body.setText(content);
		}

		if (citations.length > 0) renderCitations(bubble, citations);

		messagesEl.scrollTop = messagesEl.scrollHeight;
		return wrap;
	};

	// Restore last session — v0.54.0: assistant messages com markdown render
	const turns = plugin.memory.getRecentTurns(20);
	for (const t of turns) {
		renderTurn(t.role, t.content, [], { markdown: t.role === "assistant" });
	}

	const send = async () => {
		const text = inputEl.value.trim();
		if (!text) return;
		inputEl.value = "";
		sendBtn.disabled = true;

		renderTurn("user", text);

		// v0.52.6: Thinking indicator com typing dots animados (mais visível que spinner sozinho)
		const thinkingWrap = messagesEl.createDiv({ cls: "atlas-chat-thinking" });
		const thinkingHead = thinkingWrap.createDiv({ cls: "atlas-chat-thinking-head" });
		thinkingHead.createSpan({ cls: "atlas-emoji", text: "🧠" });
		thinkingHead.createSpan({ cls: "atlas-chat-thinking-text", text: t("chat.thinking") });
		const dotsWrap = thinkingHead.createSpan({ cls: "atlas-chat-typing" });
		dotsWrap.createSpan();
		dotsWrap.createSpan();
		dotsWrap.createSpan();
		messagesEl.scrollTop = messagesEl.scrollHeight;

		try {
			// v0.7.1 P0 fix: streaming chat REAL (token-by-token via fetch+ReadableStream)
			// Cria assistant message vazia + cursor; tokens vão sendo appended live.
			thinkingWrap.remove();
			const wrap = renderTurn("assistant", "", []);
			const bodyEl = wrap.querySelector(".atlas-msg-body") as HTMLElement | null;
			const cursor = bodyEl?.createSpan({ text: "▎", cls: "atlas-stream-cursor" }) ?? null;

			// Trigger logo glow durante streaming
			document
				.querySelectorAll(".atlas-header-logo")
				.forEach((el) => el.classList.add("atlas-thinking"));

			let textBuf = "";
			const r = await agent.run({
				query: text,
				streamCallback: (token: string) => {
					textBuf += token;
					if (bodyEl) {
						// Substitui texto + recoloca cursor no fim
						bodyEl.empty();
						bodyEl.appendText(textBuf);
						if (cursor) bodyEl.appendChild(cursor);
					}
					messagesEl.scrollTop = messagesEl.scrollHeight;
				},
			});

			// Stream terminou — remove cursor, render citations finais
			cursor?.remove();
			document
				.querySelectorAll(".atlas-header-logo")
				.forEach((el) => el.classList.remove("atlas-thinking"));

			// v0.54.0: re-render markdown completo após stream terminar
			// (durante streaming era plain pra evitar flicker de parser parcial)
			if (bodyEl && textBuf.length > 0) {
				bodyEl.empty();
				try {
					await MarkdownRenderer.render(plugin.app, textBuf, bodyEl, "", mdComponent);
				} catch {
					// fallback texto plain se MD falhar
					bodyEl.setText(textBuf);
				}
			}

			// v0.8: TTS lê resposta (se toggle ativo + Piper configurado + resposta curta)
			if (ttsEnabled && plugin.tts?.configured && r.answer.length > 0 && r.answer.length < 500) {
				void plugin.tts.speakNow(r.answer).catch(() => undefined);
			}

			if (r.citations.length > 0 && wrap) {
				renderCitations(wrap, r.citations);
			}

			if (r.toolsUsed.length > 0) statusEl.setText(`Tools: ${r.toolsUsed.join(", ")}`);

			// v0.9 Sprint 30: meta info de tool calls executados (mutações)
			// v0.54.0: render markdown nos messages (pra mostrar link clicável)
			if (r.toolCalls && r.toolCalls.length > 0 && wrap) {
				const meta = wrap.createDiv({ cls: "atlas-chat-tool-meta" });
				for (const tc of r.toolCalls) {
					const line = meta.createDiv();
					const md = `${tc.ok ? "🛠️ ✓" : "🛠️ ✗"} **${tc.name}**: ${tc.message}`;
					try {
						void MarkdownRenderer.render(plugin.app, md, line, "", mdComponent);
					} catch {
						line.setText(`${tc.ok ? "🛠️ ✓" : "🛠️ ✗"} ${tc.name}: ${tc.message}`);
					}
				}

				// v0.54.0 Sprint I: badge anim na tab apropriada quando tool muta KG
				const mutatingTools = ["create_person", "create_system", "create_product", "create_role", "create_course", "create_action_item", "create_reminder", "schedule_meeting"];
				const tabBadgeMap: Record<string, string> = {
					create_person: "knowledge",
					create_system: "systems",
					create_product: "products",
					create_role: "roles",
					create_course: "study",
					create_action_item: "hub",
					create_reminder: "reminders",
					schedule_meeting: "today",
				};
				for (const tc of r.toolCalls) {
					if (tc.ok && mutatingTools.includes(tc.name)) {
						const targetTab = tabBadgeMap[tc.name];
						if (targetTab) {
							// Pulse anim no tab badge — find activity tab button
							const tabEl = document.querySelector(
								`.atlas-master-activity-tab[data-tab-id="${targetTab}"] .atlas-activity-tab-icon`
							) as HTMLElement | null;
							if (tabEl) {
								tabEl.classList.add("atlas-tab-just-created");
								window.setTimeout(() => tabEl.classList.remove("atlas-tab-just-created"), 1800);
							}
						}
					}
				}
			}
		} catch (e) {
			document
				.querySelectorAll(".atlas-header-logo")
				.forEach((el) => el.classList.remove("atlas-thinking"));
			thinkingWrap.remove();
			const ae = e as { humanMessage?: string };
			renderTurn(
				"assistant",
				`⚠️ ${ae.humanMessage ?? String(e)}\n\nClick em ⚙️ Status (Cmd+Shift+S) pra diagnosticar.`,
				[]
			);
			plugin.presentError(e);
		} finally {
			sendBtn.disabled = false;
		}
	};

	inputEl.addEventListener("keydown", (ev: KeyboardEvent) => {
		if (ev.key === "Enter" && !ev.shiftKey) {
			ev.preventDefault();
			void send();
		}
	});
	sendBtn.addEventListener("click", () => void send());

	// v0.44 E6: External event listener — Today chat bridge dispatches "atlas:chat-send"
	// pra mandar mensagem direto sem precisar abrir tab e digitar.
	const externalSendHandler = (ev: Event): void => {
		const detail = (ev as CustomEvent).detail as { text?: string } | undefined;
		const text = detail?.text?.trim();
		if (!text) return;
		inputEl.value = text;
		void send();
	};
	document.addEventListener("atlas:chat-send", externalSendHandler);
	// Cleanup quando container destroi (re-render trigger)
	const cleanupObserver = new MutationObserver(() => {
		if (!document.body.contains(container)) {
			document.removeEventListener("atlas:chat-send", externalSendHandler);
			cleanupObserver.disconnect();
		}
	});
	cleanupObserver.observe(document.body, { childList: true, subtree: true });

	newBtn.addEventListener("click", () => {
		plugin.memory.clearCurrentSession();
		plugin.memory.startNewSession();
		messagesEl.empty();
		renderEmptyState(); // v0.70.0: re-show empty state após new
		new Notice("Atlas: nova sessão iniciada.");
	});
	clearBtn.addEventListener("click", () => {
		messagesEl.empty();
		statusEl.setText("");
		renderEmptyState(); // v0.70.0: re-show empty state após clear
	});

	// v0.70.0: render empty state no first paint se memory vazia
	const recentTurns = plugin.memory.getRecentTurns?.(1) ?? [];
	if (recentTurns.length === 0) {
		renderEmptyState();
	}

	statusEl.setText(
		`💾 ${plugin.memory.getFacts().length} fatos · ${plugin.memory.listSessions().length} sessões`
	);
}
