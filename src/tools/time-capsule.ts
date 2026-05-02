import { App, Modal, Notice, Setting, TFile, normalizePath, MarkdownView } from "obsidian";
import type AtlasPlugin from "../../main";
import { applyResponsiveModal } from "../ui/modal-helpers";

const CAPSULE_FOLDER = "12_Studies/time-capsules"; // hijack studies; could be configurable

interface CapsuleMeta {
	createdAt: string;
	unlockDate: string;
	createdBy: string;
	delivered: boolean;
}

/**
 * Time Capsule: agenda nota pra abrir no futuro.
 * Frontmatter `unlock_date: YYYY-MM-DD` faz Atlas alertar nessa data e mostrar a nota.
 *
 * Uso típico:
 *   - "Carta do meu eu de hoje pro eu de daqui 1 ano"
 *   - "Hipóteses pra checar em Q4"
 *   - "Estado atual da minha relação com X"
 */
export class TimeCapsuleModal extends Modal {
	private title = "";
	private content = "";
	private unlockDate = "";

	constructor(app: App, private plugin: AtlasPlugin) {
		super(app);

		// Default unlock: 1 year from today
		const next = new Date();
		next.setFullYear(next.getFullYear() + 1);
		this.unlockDate = next.toISOString().split("T")[0];
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		applyResponsiveModal(contentEl, { preferredWidth: 640 });
		contentEl.createEl("h3", { text: "🕰️ Atlas — Time Capsule" });
		contentEl.createEl("p", {
			text: "Escreva uma nota que será revelada na data escolhida. Atlas avisa você quando a data chegar.",
		});

		new Setting(contentEl).setName("Título").addText((t) => {
			t.setPlaceholder("Ex: Carta para meu eu de 2027").onChange((v) => {
				this.title = v;
			});
			t.inputEl.style.width = "100%";
		});

		new Setting(contentEl).setName("Data de abertura").addText((t) => {
			t.setValue(this.unlockDate).setPlaceholder("YYYY-MM-DD");
			t.onChange((v) => (this.unlockDate = v));
		});

		const ta = contentEl.createEl("textarea");
		ta.placeholder = "Escreva sua mensagem futura...\n\nDicas:\n- O que você espera que tenha mudado?\n- Que conselho daria a si mesmo?\n- Que erros não quer repetir?\n- Qual sua hipótese pra esse período?";
		ta.style.width = "100%";
		ta.style.minHeight = "200px";
		ta.style.padding = "10px";
		ta.style.fontSize = "13px";
		ta.style.fontFamily = "var(--font-text)";
		ta.addEventListener("input", () => (this.content = ta.value));

		new Setting(contentEl)
			.addButton((b) => b.setButtonText("Cancelar").onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText("🔒 Selar cápsula")
					.setCta()
					.onClick(() => this.seal())
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async seal(): Promise<void> {
		if (!this.title.trim() || !this.content.trim()) {
			new Notice("Atlas: preencha título e conteúdo.");
			return;
		}
		if (!/^\d{4}-\d{2}-\d{2}$/.test(this.unlockDate)) {
			new Notice("Atlas: data inválida. Use formato YYYY-MM-DD.");
			return;
		}
		const unlockMs = new Date(`${this.unlockDate}T00:00:00`).getTime();
		if (unlockMs <= Date.now()) {
			new Notice("Atlas: data deve ser no futuro.");
			return;
		}

		const slug = this.title
			.toLowerCase()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");
		const date = new Date().toISOString().split("T")[0];
		const fileName = `${date}--${slug}.md`;
		const path = normalizePath(`${CAPSULE_FOLDER}/${fileName}`);

		if (!this.app.vault.getAbstractFileByPath(CAPSULE_FOLDER)) {
			await this.app.vault.createFolder(CAPSULE_FOLDER);
		}

		const fmt = this.renderMarkdown();

		try {
			await this.app.vault.create(path, fmt);
			await this.plugin.auditLog({
				action: "time-capsule.sealed",
				path,
				unlockDate: this.unlockDate,
			});
			new Notice(`🕰️ Atlas: cápsula selada. Abre em ${this.unlockDate}.`, 8000);
			this.close();
		} catch (e) {
			new Notice(`Atlas: erro — ${String(e)}`, 8000);
		}
	}

	private renderMarkdown(): string {
		return `---
type: time-capsule
title: "${this.title.replace(/"/g, '\\"')}"
created_at: ${new Date().toISOString()}
unlock_date: ${this.unlockDate}
delivered: false
created_by: ${this.plugin.settings.user.displayName || "atlas-user"}
---

# 🕰️ ${this.title}

> 🔒 **Esta cápsula está selada.** Atlas vai abrir em **${this.unlockDate}**.
>
> Não modifique até essa data — a magia de revisitar depende disso.

---

${this.content}

---

_Cápsula criada via Atlas em ${new Date().toLocaleDateString("pt-BR")}._
`;
	}
}

/**
 * Watch capsules: chamar diariamente. Notifica quando alguma cápsula vence.
 */
export class CapsuleWatcher {
	constructor(private plugin: AtlasPlugin) {}

	async checkDeliveries(): Promise<void> {
		const today = new Date().toISOString().split("T")[0];
		const folder = this.plugin.app.vault.getAbstractFileByPath(CAPSULE_FOLDER);
		if (!folder) return;

		const files = this.plugin.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(CAPSULE_FOLDER));
		for (const f of files) {
			const cache = this.plugin.app.metadataCache.getFileCache(f);
			const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
			const unlock = fm.unlock_date as string | undefined;
			const delivered = fm.delivered;
			if (!unlock) continue;
			if (delivered === true) continue;
			if (unlock > today) continue;

			// Deliver!
			await this.deliverCapsule(f, fm.title as string | undefined);
		}
	}

	private async deliverCapsule(file: TFile, title: string | undefined): Promise<void> {
		await this.plugin.notifier.notify({
			title: "🎁 Atlas — Cápsula do tempo!",
			message: `"${title ?? file.basename}" — abriu hoje! Click para abrir.`,
			severity: "high",
			channels: ["inAppNotice", "desktop", "telegram"],
			subtitle: file.path,
		});

		// Mark delivered
		try {
			await this.plugin.app.fileManager.processFrontMatter(file, (fm) => {
				fm.delivered = true;
				fm.delivered_at = new Date().toISOString();
			});
		} catch (e) {
			// continue
		}

		await this.plugin.auditLog({
			action: "time-capsule.delivered",
			path: file.path,
		});
	}
}
