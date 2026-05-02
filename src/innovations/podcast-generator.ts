import { App, normalizePath, TFile, Notice } from "obsidian";
import * as path from "path";
import type AtlasPlugin from "../../main";

const NPR_PROMPT = `Você é Atlas em modo "Personal Podcast". Vou te dar um weekly report técnico do usuário e você vai transformá-lo num **roteiro de podcast estilo NPR / The Daily** (em PT-BR).

Estilo:
1. **Tom conversacional**, não corporativo. Como se fosse um amigo de confiança narrando a semana dele.
2. **Hook inicial**: 1 frase que captura a essência da semana.
3. **3-4 segmentos**: highlights (com narrativa), 1 desafio, 1 padrão observado, projeção pra próxima semana.
4. **Frases curtas**, fáceis de pronunciar via TTS.
5. **Sem markdown** — só texto narrativo. Use vírgulas e pontos finais. Evite siglas que TTS não pronuncia.
6. **Fecha em alta**: 1 reflexão acionável.
7. Duração-alvo: 90-120 segundos lidos (= ~250-350 palavras).

NÃO invente fatos. Use apenas o que está no relatório. Tom: caloroso, factual, levemente otimista.`;

export class PodcastGeneratorTool {
	constructor(private app: App, private plugin: AtlasPlugin) {}

	async generateFromWeekly(weeklyNotePath: string): Promise<{ scriptPath: string; audioPath?: string } | null> {
		const file = this.app.vault.getAbstractFileByPath(weeklyNotePath);
		if (!(file instanceof TFile)) {
			new Notice("Atlas: weekly report não encontrado.");
			return null;
		}

		const ok = await this.plugin.ollama.ping();
		if (!ok) {
			new Notice("Atlas: Ollama offline.");
			return null;
		}

		const raw = await this.app.vault.read(file);
		const notice = new Notice("Atlas: gerando roteiro do podcast...", 0);

		try {
			// Strip frontmatter + atlas-only blocks for cleaner input
			const cleaned = raw
				.replace(/^---\n[\s\S]*?\n---\n/, "")
				.replace(/<!-- atlas-[\w-]+(?:-(?:start|end))? -->/g, "")
				.replace(/```dataview[\s\S]*?```/g, "")
				.replace(/```chart[\s\S]*?```/g, "")
				.replace(/```mermaid[\s\S]*?```/g, "")
				.substring(0, 6000);

			// v0.18: route through LLMService (summarization task — auto-cheaper model when cloud)
			const llm = this.plugin.llm;
			const promptText = `${NPR_PROMPT}\n\nWeekly report:\n"""\n${cleaned}\n"""\n\nRoteiro do podcast (texto puro PT-BR):`;
			const script = llm
				? await llm.generate(promptText, {
						feature: "innovation.podcast",
						taskKind: "summarization",
						temperature: 0.6,
						maxTokens: 1200,
				  })
				: await this.plugin.ollama.generate(promptText, {
						model: this.plugin.settings.ollama.generationModel,
						temperature: 0.6,
						max_tokens: 800,
				  });

			notice.hide();
			const cleanedScript = script.trim();

			// Save script as note
			const date = new Date().toISOString().split("T")[0];
			const baseName = file.basename;
			const scriptPath = normalizePath(
				`${this.plugin.settings.folders.reports}/podcasts/${baseName}-${date}.md`
			);
			const dir = scriptPath.split("/").slice(0, -1).join("/");
			if (!this.app.vault.getAbstractFileByPath(dir)) {
				await this.app.vault.createFolder(dir);
			}

			const md = `---
type: podcast-script
based_on: "${weeklyNotePath}"
generated_at: ${new Date().toISOString()}
duration_estimate_seconds: ${Math.round(cleanedScript.split(/\s+/).length / 2.5)}
---

# 🎙️ Atlas Podcast — ${baseName}

> Roteiro NPR-style baseado no seu weekly report. Use o comando "Atlas: Gerar áudio do podcast" para sintetizar via Piper TTS.

---

${cleanedScript}

---

_Gerado pelo Atlas. Revise antes de gerar áudio se quiser ajustar pronúncia/tom._`;

			const existing = this.app.vault.getAbstractFileByPath(scriptPath);
			if (existing instanceof TFile) {
				await this.app.vault.modify(existing, md);
			} else {
				await this.app.vault.create(scriptPath, md);
			}

			// Try TTS if configured
			let audioPath: string | undefined;
			if (this.plugin.tts.configured) {
				try {
					new Notice("Atlas: sintetizando áudio com Piper...", 4000);
					const safeName = `atlas-podcast-${date}.wav`;
					const audioBase = path.join(
						(this.app.vault.adapter as unknown as { getBasePath?: () => string }).getBasePath?.() ?? "",
						this.plugin.settings.folders.reports,
						"podcasts",
						"audio"
					);
					const out = path.join(audioBase, safeName);
					audioPath = await this.plugin.tts.synthesize(cleanedScript, out);
					new Notice(`Atlas: áudio salvo em ${audioPath}`, 8000);
				} catch (e) {
					new Notice(`Atlas: TTS falhou — ${String(e)}. Roteiro foi salvo.`, 6000);
				}
			} else {
				new Notice(
					"Atlas: roteiro pronto. Configure Piper TTS em Settings para gerar áudio.",
					8000
				);
			}

			return { scriptPath, audioPath };
		} catch (e) {
			notice.hide();
			new Notice(`Atlas: erro — ${String(e)}`, 8000);
			return null;
		}
	}
}
