/**
 * Atlas Vision — analisa imagens via llama3.2-vision (Ollama).
 *
 * Pipeline:
 *  1. User escolhe imagem (file picker ou paste do clipboard)
 *  2. Lê arquivo → converte pra base64
 *  3. POST /api/generate com `images: [base64]`
 *  4. Retorna markdown descritivo
 *
 * Use cases:
 *  - Whiteboard photo → markdown texto
 *  - Screenshot → tabela/markdown extraída
 *  - Slide deck → bullet points
 *  - Receipt → tabela de gastos
 *  - Handwritten notes → markdown
 *
 * Model: llama3.2-vision:11b (~8 GB RAM temporário). Opt-in via Settings.
 */

import { App, Modal, Notice, Setting, TFile, normalizePath } from "obsidian";
import { readFileSync, existsSync } from "fs";
import type AtlasPlugin from "../../main";
import { applyResponsiveModal } from "../ui/modal-helpers";
import { logger } from "../utils/logger";

const VISION_MODEL = "llama3.2-vision:11b";

export interface VisionAnalysisOptions {
	prompt?: string; // override custom prompt
	taskKind?: "describe" | "ocr" | "table" | "diagram" | "summarize";
}

const PROMPT_BY_TASK: Record<NonNullable<VisionAnalysisOptions["taskKind"]>, string> = {
	describe:
		"Describe this image in detail in Portuguese (PT-BR). Include any text visible, key visual elements, layout, and what the image is communicating.",
	ocr: "Extract ALL text visible in this image, preserving structure (paragraphs, lists, headers). Output as markdown in Portuguese (PT-BR).",
	table: "Extract any tables visible in this image as markdown tables. If no tables, list structured data as markdown table. PT-BR.",
	diagram: "Convert this diagram into a Mermaid markdown diagram (use flowchart, sequenceDiagram, or graph TD as appropriate). Add brief explanation in PT-BR after the mermaid block.",
	summarize: "Summarize the key information in this image in 3-5 bullet points (markdown). PT-BR. Then list any action items if applicable.",
};

export class VisionTool {
	constructor(private app: App, private plugin: AtlasPlugin) {}

	/**
	 * Analisa imagem e retorna markdown.
	 */
	async run(filePath: string, opts: VisionAnalysisOptions = {}): Promise<string> {
		if (!existsSync(filePath)) {
			throw new Error(`Atlas Vision: arquivo não encontrado: ${filePath}`);
		}
		const buf = readFileSync(filePath);
		const base64 = buf.toString("base64");

		const prompt = opts.prompt ?? PROMPT_BY_TASK[opts.taskKind ?? "describe"];

		// v0.18: route through LLMService when configured (GPT-4o / Claude Sonnet vision >>> llama3.2-vision)
		const llm = this.plugin.llm;
		if (llm?.willUseCloud("vision")) {
			try {
				const mimeType = this.detectMimeType(filePath);
				const result = await llm.vision(prompt, base64, {
					feature: `vision.${opts.taskKind ?? "describe"}`,
					mimeType,
				});
				logger.info("vision: cloud analyzed", { file: filePath, length: result.length });
				return result;
			} catch (e) {
				logger.warn("vision: cloud failed, falling back to ollama", { error: String(e) });
				// fall through to ollama path
			}
		}

		// Ollama llama3.2-vision fallback (8 GB RAM, opt-in)
		const baseUrl = this.plugin.settings.ollama.baseUrl;
		try {
			const { requestUrl } = await import("obsidian");
			const response = await requestUrl({
				url: `${baseUrl}/api/generate`,
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: VISION_MODEL,
					prompt,
					images: [base64],
					stream: false,
					options: { temperature: 0.3, num_predict: 2000 },
				}),
				throw: false,
			});

			if (response.status !== 200) {
				if (response.status === 404) {
					throw new Error(
						`Atlas Vision: modelo ${VISION_MODEL} não encontrado. Faça pull em Status → Catálogo → ${VISION_MODEL}, OU configure cloud vision em Settings → ☁️ Cloud AI Providers (GPT-4o / Claude Sonnet).`
					);
				}
				throw new Error(`HTTP ${response.status}`);
			}

			const json = response.json as { response?: string; error?: string };
			if (json.error) throw new Error(`Ollama: ${json.error}`);

			logger.info("vision: ollama analyzed", { file: filePath, length: json.response?.length ?? 0 });
			return json.response ?? "";
		} catch (e) {
			logger.error("vision: falha", { error: String(e) });
			throw e;
		}
	}

	private detectMimeType(filePath: string): string {
		const ext = filePath.toLowerCase().split(".").pop() ?? "";
		const map: Record<string, string> = {
			png: "image/png",
			jpg: "image/jpeg",
			jpeg: "image/jpeg",
			webp: "image/webp",
			gif: "image/gif",
		};
		return map[ext] ?? "image/png";
	}

	/**
	 * Salva análise como nota markdown em 09_Knowledge/vision/.
	 */
	async runAndSave(filePath: string, opts: VisionAnalysisOptions = {}): Promise<TFile | null> {
		const result = await this.run(filePath, opts);
		const date = new Date().toISOString().split("T")[0];
		const slug = filePath
			.split("/")
			.pop()
			?.replace(/\.[^.]+$/, "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "") ?? "image";
		const folder = `${this.plugin.settings.folders.knowledge}/vision`;
		const path = normalizePath(`${folder}/${date}-${slug}.md`);

		if (!this.app.vault.getAbstractFileByPath(folder)) {
			await this.app.vault.createFolder(folder).catch(() => undefined);
		}

		const md = `---
type: vision-analysis
source_image: ${JSON.stringify(filePath)}
analyzed_at: ${new Date().toISOString()}
task: ${opts.taskKind ?? "describe"}
generated_by: atlas
---

# 👁️ Vision Analysis

**Source:** \`${filePath.split("/").pop()}\`
**Task:** ${opts.taskKind ?? "describe"}

---

${result}

---

_Gerado por Atlas Vision (${VISION_MODEL})._
`;

		try {
			const f = await this.app.vault.create(path, md);
			return f;
		} catch (e) {
			logger.warn("vision: salvar falhou", { error: String(e) });
			return null;
		}
	}
}

/**
 * Modal que pergunta tipo de análise + arquivo + roda VisionTool.
 */
export class VisionModal extends Modal {
	private filePath = "";
	private taskKind: NonNullable<VisionAnalysisOptions["taskKind"]> = "describe";

	constructor(app: App, private plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		applyResponsiveModal(contentEl, { preferredWidth: 560 });

		contentEl.createEl("h3", { text: "👁️ Atlas Vision" });
		contentEl.createEl("p", {
			text: `Analisa imagens via ${VISION_MODEL}. Use para whiteboards, screenshots, diagramas, recibos, anotações à mão.`,
		}).style.fontSize = "12px";

		new Setting(contentEl)
			.setName("Caminho do arquivo")
			.setDesc("Path absoluto da imagem (.png, .jpg, .jpeg, .webp).")
			.addText((t) => {
				t.setPlaceholder("/Users/seu_user/Desktop/whiteboard.png")
					.onChange((v) => (this.filePath = v.trim()));
				t.inputEl.style.width = "100%";
			});

		new Setting(contentEl)
			.setName("Tipo de análise")
			.addDropdown((d) => {
				d.addOption("describe", "📝 Descrever (geral)");
				d.addOption("ocr", "🔤 OCR (extrair texto)");
				d.addOption("table", "📊 Extrair tabela");
				d.addOption("diagram", "🔀 Converter para Mermaid diagram");
				d.addOption("summarize", "💡 Resumir em bullets");
				d.setValue("describe");
				d.onChange((v) => (this.taskKind = v as typeof this.taskKind));
			});

		const note = contentEl.createDiv();
		note.style.padding = "10px";
		note.style.background = "var(--background-secondary)";
		note.style.borderRadius = "6px";
		note.style.fontSize = "11px";
		note.style.opacity = "0.8";
		note.style.marginBottom = "12px";
		note.setText(
			`⚠️ ${VISION_MODEL} consome ~8 GB RAM temporário. Em máquinas 8 GB, feche outros apps antes de rodar.`
		);

		new Setting(contentEl)
			.addButton((b) => b.setButtonText("Cancelar").onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText("👁️ Analisar")
					.setCta()
					.onClick(async () => {
						if (!this.filePath) {
							new Notice("Atlas: informe o caminho da imagem.");
							return;
						}
						this.close();
						const tool = new VisionTool(this.app, this.plugin);
						const notice = new Notice(`👁️ Atlas: analisando ${this.filePath.split("/").pop()}...`, 0);
						try {
							const f = await tool.runAndSave(this.filePath, { taskKind: this.taskKind });
							notice.hide();
							if (f) {
								new Notice(`✓ Atlas: análise salva em ${f.path}`);
								await this.app.workspace.getLeaf().openFile(f);
							}
						} catch (e) {
							notice.hide();
							this.plugin.presentError(e);
						}
					})
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
