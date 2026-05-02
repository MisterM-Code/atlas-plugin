import { ItemView, WorkspaceLeaf, Notice, TFile } from "obsidian";
import type AtlasPlugin from "../../main";
import { Agent } from "../agent/agent";

export const ATLAS_CHAT_VIEW = "atlas-chat-view";

export class AtlasChatView extends ItemView {
	private messagesEl!: HTMLDivElement;
	private inputEl!: HTMLTextAreaElement;
	private sendBtn!: HTMLButtonElement;
	private statusEl!: HTMLSpanElement;
	private agent!: Agent;
	private isProcessing = false;

	constructor(leaf: WorkspaceLeaf, private plugin: AtlasPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return ATLAS_CHAT_VIEW;
	}

	getDisplayText(): string {
		return "Atlas Chat";
	}

	getIcon(): string {
		return "atlas-brain";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass("atlas-chat-container");

		// Header
		const header = container.createDiv("atlas-chat-header");
		header.style.padding = "8px 12px";
		header.style.borderBottom = "1px solid var(--background-modifier-border)";
		header.style.display = "flex";
		header.style.justifyContent = "space-between";
		header.style.alignItems = "center";

		const title = header.createEl("span", { text: "🧠 Atlas Chat" });
		title.style.fontWeight = "bold";

		const headerActions = header.createDiv();
		headerActions.style.display = "flex";
		headerActions.style.gap = "4px";

		const newSessionBtn = headerActions.createEl("button", { text: "Nova" });
		newSessionBtn.style.fontSize = "11px";
		newSessionBtn.style.padding = "2px 8px";
		newSessionBtn.addEventListener("click", () => this.startNewSession());

		const clearBtn = headerActions.createEl("button", { text: "Limpar" });
		clearBtn.style.fontSize = "11px";
		clearBtn.style.padding = "2px 8px";
		clearBtn.addEventListener("click", () => this.clearMessages());

		// Messages area
		this.messagesEl = container.createDiv("atlas-chat-messages") as HTMLDivElement;
		this.messagesEl.style.flexGrow = "1";
		this.messagesEl.style.overflowY = "auto";
		this.messagesEl.style.padding = "12px";

		// Input area
		const inputWrap = container.createDiv("atlas-chat-input-wrap");
		inputWrap.style.borderTop = "1px solid var(--background-modifier-border)";
		inputWrap.style.padding = "8px";

		this.inputEl = inputWrap.createEl("textarea", {
			attr: { placeholder: "Pergunte algo... (Enter para enviar · Shift+Enter para nova linha)" },
		}) as HTMLTextAreaElement;
		this.inputEl.style.width = "100%";
		this.inputEl.style.minHeight = "60px";
		this.inputEl.style.resize = "vertical";
		this.inputEl.style.fontFamily = "var(--font-text)";
		this.inputEl.style.fontSize = "14px";
		this.inputEl.style.padding = "6px";

		this.inputEl.addEventListener("keydown", (ev: KeyboardEvent) => {
			if (ev.key === "Enter" && !ev.shiftKey) {
				ev.preventDefault();
				void this.sendMessage();
			}
		});

		const inputActions = inputWrap.createDiv();
		inputActions.style.display = "flex";
		inputActions.style.justifyContent = "space-between";
		inputActions.style.alignItems = "center";
		inputActions.style.marginTop = "6px";

		this.statusEl = inputActions.createEl("span") as HTMLSpanElement;
		this.statusEl.style.fontSize = "11px";
		this.statusEl.style.opacity = "0.6";

		this.sendBtn = inputActions.createEl("button", { text: "Enviar" }) as HTMLButtonElement;
		this.sendBtn.style.padding = "4px 16px";
		this.sendBtn.addEventListener("click", () => void this.sendMessage());

		// Layout
		(container as HTMLElement).style.display = "flex";
		(container as HTMLElement).style.flexDirection = "column";
		(container as HTMLElement).style.height = "100%";

		// Initialize agent
		this.agent = new Agent(
			this.app,
			this.plugin.ollama,
			this.plugin.memory,
			this.plugin.kg,
			this.plugin.embedder,
			this.plugin.settings.ollama.generationModel
		);

		// Restore last session turns
		this.restoreSession();

		this.updateStatus();
	}

	async onClose(): Promise<void> {
		// Nothing to clean up
	}

	private async sendMessage(): Promise<void> {
		const text = this.inputEl.value.trim();
		if (!text || this.isProcessing) return;

		this.isProcessing = true;
		this.sendBtn.disabled = true;
		this.inputEl.value = "";

		this.appendMessage("user", text);
		const thinkingEl = this.appendThinking();

		try {
			const response = await this.agent.run({ query: text });
			thinkingEl.remove();
			this.appendMessage("assistant", response.answer, response.citations);

			if (response.toolsUsed.length > 0) {
				this.statusEl.setText(`Tools: ${response.toolsUsed.join(", ")}`);
			}
		} catch (e) {
			thinkingEl.remove();
			const ae = e as { humanMessage?: string };
			const friendly = ae.humanMessage ?? `Erro: ${String(e)}`;
			this.appendMessage("assistant", `⚠️ ${friendly}\n\nClique em **Atlas Status** (Cmd+Shift+S) pra diagnosticar.`, []);
			this.plugin.presentError(e);
		} finally {
			this.isProcessing = false;
			this.sendBtn.disabled = false;
			this.scrollToBottom();
		}
	}

	private appendMessage(
		role: "user" | "assistant",
		content: string,
		citations: { notePath: string; snippet: string }[] = []
	): HTMLDivElement {
		const wrap = this.messagesEl.createDiv() as HTMLDivElement;
		wrap.style.marginBottom = "12px";
		wrap.style.padding = "10px";
		wrap.style.borderRadius = "8px";
		wrap.style.whiteSpace = "pre-wrap";
		wrap.style.wordWrap = "break-word";

		if (role === "user") {
			wrap.style.background = "var(--background-secondary-alt)";
			wrap.style.marginLeft = "20px";
			const lbl = wrap.createEl("div", { text: "Você" });
			lbl.style.fontSize = "11px";
			lbl.style.opacity = "0.6";
			lbl.style.marginBottom = "4px";
			const body = wrap.createEl("div");
			body.setText(content);
		} else {
			wrap.style.background = "var(--background-secondary)";
			wrap.style.marginRight = "20px";
			const lbl = wrap.createEl("div", { text: "🧠 Atlas" });
			lbl.style.fontSize = "11px";
			lbl.style.opacity = "0.6";
			lbl.style.marginBottom = "4px";
			const body = wrap.createEl("div");
			body.innerHTML = this.renderAssistantContent(content);

			if (citations.length > 0) {
				const citWrap = wrap.createDiv();
				citWrap.style.marginTop = "8px";
				citWrap.style.fontSize = "11px";
				const citLabel = citWrap.createEl("div", { text: "📎 Fontes:" });
				citLabel.style.opacity = "0.6";
				citLabel.style.marginBottom = "4px";

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
					chip.style.borderRadius = "4px";
					chip.style.cursor = "pointer";
					chip.title = c.notePath;
					chip.addEventListener("click", () => {
						const f = this.app.vault.getAbstractFileByPath(c.notePath);
						if (f instanceof TFile) {
							this.app.workspace.getLeaf().openFile(f);
						}
					});
				}
			}
		}

		this.scrollToBottom();
		return wrap;
	}

	private appendThinking(): HTMLDivElement {
		const el = this.messagesEl.createDiv() as HTMLDivElement;
		el.style.padding = "10px";
		el.style.fontStyle = "italic";
		el.style.opacity = "0.6";
		el.setText("🧠 Pensando...");
		this.scrollToBottom();
		return el;
	}

	private renderAssistantContent(text: string): string {
		// Minimal markdown-like rendering
		let html = this.escapeHtml(text);
		html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
		html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
		html = html.replace(/\[Nota:\s*([^\]]+)\]/g, '<span style="color:var(--interactive-accent);">📄 $1</span>');
		html = html.replace(/\n\n+/g, "<br/><br/>");
		html = html.replace(/\n/g, "<br/>");
		return html;
	}

	private escapeHtml(s: string): string {
		const map: Record<string, string> = {
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			'"': "&quot;",
			"'": "&#39;",
		};
		return s.replace(/[&<>"']/g, (c) => map[c]);
	}

	private clearMessages(): void {
		this.messagesEl.empty();
		this.statusEl.setText("");
	}

	private startNewSession(): void {
		this.plugin.memory.clearCurrentSession();
		this.plugin.memory.startNewSession();
		this.clearMessages();
		new Notice("Atlas: nova sessão iniciada.");
	}

	private restoreSession(): void {
		const turns = this.plugin.memory.getRecentTurns(20);
		for (const t of turns) {
			this.appendMessage(t.role, t.content);
		}
	}

	private updateStatus(): void {
		const facts = this.plugin.memory.getFacts().length;
		const sessions = this.plugin.memory.listSessions().length;
		this.statusEl.setText(`Memória: ${facts} fatos · ${sessions} sessões`);
	}

	private scrollToBottom(): void {
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}
}
