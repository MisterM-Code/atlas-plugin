import { Notice, MarkdownView, TFile } from "obsidian";
import type AtlasPlugin from "../../../main";
import { Agent } from "../../agent/agent";

/**
 * Renders Atlas Chat dentro do master sidebar.
 * Implementação inline (não reusa AtlasChatView ItemView pra evitar duplicar registerView).
 */
export async function renderChatTab(container: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	container.empty();
	(container as HTMLElement).style.display = "flex";
	(container as HTMLElement).style.flexDirection = "column";
	(container as HTMLElement).style.height = "100%";

	// Header — v0.9 Sprint 30: tagline diferenciada de Jarvis
	const header = container.createDiv();
	header.style.display = "flex";
	header.style.justifyContent = "space-between";
	header.style.alignItems = "center";
	header.style.marginBottom = "4px";
	const titleWrap = header.createDiv();
	const titleEl = titleWrap.createEl("h3", { text: "💬 Atlas Chat" });
	titleEl.style.margin = "0";
	titleEl.style.fontSize = "16px";

	const headerActions = header.createDiv();
	headerActions.style.display = "flex";
	headerActions.style.gap = "4px";
	const newBtn = headerActions.createEl("button", { text: "Nova" });
	newBtn.style.fontSize = "11px";
	const clearBtn = headerActions.createEl("button", { text: "Limpar" });
	clearBtn.style.fontSize = "11px";

	// Subtitle: differentiate from Jarvis
	const subtitle = container.createDiv();
	subtitle.style.fontSize = "11px";
	subtitle.style.opacity = "0.55";
	subtitle.style.marginBottom = "8px";
	subtitle.style.lineHeight = "1.5";
	subtitle.createSpan({ text: "Pergunte sobre seu vault — respondo com citações [Nota: x.md] e memória de 20 turnos. " });
	const jarvisHintBtn = subtitle.createEl("a", { text: "Prefere falar? Use Jarvis (Cmd+Shift+J) →" });
	jarvisHintBtn.style.color = "var(--atlas-accent, var(--interactive-accent))";
	jarvisHintBtn.style.cursor = "pointer";
	jarvisHintBtn.addEventListener("click", async (e) => {
		e.preventDefault();
		const apiAny = plugin.app as unknown as {
			commands?: { executeCommandById?: (id: string) => void };
		};
		apiAny.commands?.executeCommandById?.("atlas:jarvis");
	});

	// Messages
	const messagesEl = container.createDiv() as HTMLDivElement;
	messagesEl.style.flexGrow = "1";
	messagesEl.style.overflowY = "auto";
	messagesEl.style.padding = "8px 0";
	messagesEl.style.minHeight = "200px";

	// Input
	const inputWrap = container.createDiv();
	inputWrap.style.borderTop = "1px solid var(--background-modifier-border)";
	inputWrap.style.padding = "8px 0";

	const inputEl = inputWrap.createEl("textarea") as HTMLTextAreaElement;
	inputEl.placeholder = "Pergunte algo... (Enter pra enviar)";
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

	const sendBtn = inputActions.createEl("button", { text: "Enviar" }) as HTMLButtonElement;

	const agent = new Agent(
		plugin.app,
		plugin.ollama,
		plugin.memory,
		plugin.kg,
		plugin.embedder,
		plugin.settings.ollama.generationModel
	);
	agent.setPlugin(plugin);

	const renderTurn = (
		role: "user" | "assistant",
		content: string,
		citations: { notePath: string; snippet: string }[] = []
	): HTMLDivElement => {
		const wrap = messagesEl.createDiv() as HTMLDivElement;
		wrap.style.marginBottom = "10px";
		wrap.style.padding = "10px";
		wrap.style.borderRadius = "6px";
		wrap.style.whiteSpace = "pre-wrap";
		wrap.style.fontSize = "13px";

		if (role === "user") {
			wrap.style.background = "var(--background-secondary-alt)";
			wrap.style.marginLeft = "16px";
			const lbl = wrap.createEl("div", { text: "Você" });
			lbl.style.fontSize = "10px";
			lbl.style.opacity = "0.6";
			lbl.style.marginBottom = "4px";
		} else {
			wrap.style.background = "var(--background-secondary)";
			wrap.style.marginRight = "16px";
			const lbl = wrap.createEl("div", { text: "🧠 Atlas" });
			lbl.style.fontSize = "10px";
			lbl.style.opacity = "0.6";
			lbl.style.marginBottom = "4px";
		}

		const body = wrap.createEl("div");
		body.addClass("atlas-msg-body");
		body.setText(content);

		if (citations.length > 0) {
			const citWrap = wrap.createDiv();
			citWrap.style.marginTop = "6px";
			citWrap.style.fontSize = "10px";
			const seen = new Set<string>();
			for (const c of citations) {
				if (seen.has(c.notePath)) continue;
				seen.add(c.notePath);
				const chip = citWrap.createEl("span", {
					text: `📄 ${c.notePath.split("/").pop()?.replace(/\.md$/, "")}`,
				});
				chip.style.display = "inline-block";
				chip.style.padding = "2px 6px";
				chip.style.margin = "2px 4px 2px 0";
				chip.style.background = "var(--background-modifier-hover)";
				chip.style.borderRadius = "3px";
				chip.style.cursor = "pointer";
				chip.addEventListener("click", () => {
					const f = plugin.app.vault.getAbstractFileByPath(c.notePath);
					if (f instanceof TFile) plugin.app.workspace.getLeaf().openFile(f);
				});
			}
		}

		messagesEl.scrollTop = messagesEl.scrollHeight;
		return wrap;
	};

	// Restore last session
	const turns = plugin.memory.getRecentTurns(20);
	for (const t of turns) {
		renderTurn(t.role, t.content);
	}

	const send = async () => {
		const text = inputEl.value.trim();
		if (!text) return;
		inputEl.value = "";
		sendBtn.disabled = true;

		renderTurn("user", text);

		// Skeleton loader + spinner enquanto LLM pensa
		const { renderSkeleton } = await import("../../ui/skeleton");
		const thinkingWrap = messagesEl.createDiv();
		thinkingWrap.style.padding = "10px 12px";
		thinkingWrap.style.background = "var(--background-secondary)";
		thinkingWrap.style.borderRadius = "8px";
		thinkingWrap.style.marginBottom = "8px";
		const thinkingHead = thinkingWrap.createDiv();
		thinkingHead.style.display = "flex";
		thinkingHead.style.alignItems = "center";
		thinkingHead.style.gap = "8px";
		thinkingHead.style.marginBottom = "8px";
		thinkingHead.style.fontSize = "11px";
		thinkingHead.style.opacity = "0.6";
		const spinner = thinkingHead.createSpan();
		spinner.addClass("atlas-spinner");
		thinkingHead.createSpan({ text: "Atlas pensando..." });
		renderSkeleton(thinkingWrap, { kind: "paragraph", count: 3 });
		messagesEl.scrollTop = messagesEl.scrollHeight;

		try {
			// v0.7.1 P0 fix: streaming chat REAL (token-by-token via fetch+ReadableStream)
			// Cria assistant message vazia + cursor; tokens vão sendo appended live.
			thinkingWrap.remove();
			const wrap = renderTurn("assistant", "", []);
			const bodyEl = wrap.querySelector(".atlas-msg-body") as HTMLElement | null;
			const cursor = bodyEl?.createSpan({ text: "▎" }) ?? null;
			if (cursor) {
				cursor.style.opacity = "0.6";
				cursor.style.animation = "atlas-cursor-blink 1s steps(2) infinite";
			}

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

			// v0.8: TTS lê resposta (se toggle ativo + Piper configurado + resposta curta)
			if (ttsEnabled && plugin.tts?.configured && r.answer.length > 0 && r.answer.length < 500) {
				void plugin.tts.speakNow(r.answer).catch(() => undefined);
			}

			if (r.citations.length > 0 && wrap) {
				const citWrap = wrap.createDiv();
				citWrap.style.marginTop = "6px";
				citWrap.style.fontSize = "10px";
				const seen = new Set<string>();
				for (const c of r.citations) {
					if (seen.has(c.notePath)) continue;
					seen.add(c.notePath);
					const chip = citWrap.createEl("span", {
						text: `📄 ${c.notePath.split("/").pop()?.replace(/\.md$/, "")}`,
					});
					chip.style.display = "inline-block";
					chip.style.padding = "2px 6px";
					chip.style.margin = "2px 4px 2px 0";
					chip.style.background = "var(--background-modifier-hover)";
					chip.style.borderRadius = "3px";
					chip.style.cursor = "pointer";
					chip.addEventListener("click", () => {
						const f = plugin.app.vault.getAbstractFileByPath(c.notePath);
						if (f instanceof TFile) plugin.app.workspace.getLeaf().openFile(f);
					});
				}
			}

			if (r.toolsUsed.length > 0) statusEl.setText(`Tools: ${r.toolsUsed.join(", ")}`);

			// v0.9 Sprint 30: meta info de tool calls executados (mutações)
			if (r.toolCalls && r.toolCalls.length > 0 && wrap) {
				const meta = wrap.createDiv();
				meta.style.marginTop = "6px";
				meta.style.padding = "6px 8px";
				meta.style.background = "var(--background-modifier-success)";
				meta.style.borderLeft = "2px solid var(--color-green)";
				meta.style.borderRadius = "4px";
				meta.style.fontSize = "10px";
				for (const tc of r.toolCalls) {
					const line = meta.createDiv();
					line.setText(`${tc.ok ? "🛠️ ✓" : "🛠️ ✗"} ${tc.name}: ${tc.message}`);
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

	newBtn.addEventListener("click", () => {
		plugin.memory.clearCurrentSession();
		plugin.memory.startNewSession();
		messagesEl.empty();
		new Notice("Atlas: nova sessão iniciada.");
	});
	clearBtn.addEventListener("click", () => {
		messagesEl.empty();
		statusEl.setText("");
	});

	statusEl.setText(
		`💾 ${plugin.memory.getFacts().length} fatos · ${plugin.memory.listSessions().length} sessões`
	);
}
