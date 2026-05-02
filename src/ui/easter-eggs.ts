/**
 * Atlas v0.11 — Easter eggs (Konami code + comandos secretos).
 *
 * Por que existir: pequenos detalhes que recompensam usuários atentos.
 * Konami code (↑↑↓↓←→←→BA) ativa o "modo nostálgico" Atlas.
 */

import { Notice } from "obsidian";
import type AtlasPlugin from "../../main";

const KONAMI: string[] = [
	"ArrowUp",
	"ArrowUp",
	"ArrowDown",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"ArrowLeft",
	"ArrowRight",
	"KeyB",
	"KeyA",
];

export class EasterEggsListener {
	private buffer: string[] = [];
	private handler: ((e: KeyboardEvent) => void) | null = null;

	constructor(private readonly plugin: AtlasPlugin) {}

	mount(): void {
		this.handler = (e: KeyboardEvent) => {
			// Ignora se em input/textarea
			const t = e.target as HTMLElement;
			if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA") return;

			this.buffer.push(e.code);
			if (this.buffer.length > KONAMI.length) {
				this.buffer.shift();
			}
			if (this.buffer.length === KONAMI.length && this.buffer.every((k, i) => k === KONAMI[i])) {
				this.buffer = [];
				void this.activateKonami();
			}
		};
		document.addEventListener("keydown", this.handler);
	}

	unmount(): void {
		if (this.handler) {
			document.removeEventListener("keydown", this.handler);
			this.handler = null;
		}
	}

	private async activateKonami(): Promise<void> {
		new Notice("🌌 Atlas: você descobriu o modo Konami! +30 XP", 8000);

		// Confetti burst
		try {
			const m = await import("./animations");
			m.confettiBurst();
		} catch {
			// ignore
		}

		// XP bonus
		try {
			this.plugin.gainXp("konami-discovery", 30);
		} catch {
			// ignore
		}

		// Atlas message
		const messages = [
			"30 lives unlocked. Use them with wisdom.",
			"⬆⬆⬇⬇⬅➡⬅➡BA — você é da escola antiga.",
			"Achievement Unlocked: Easter Egg Hunter",
			"Atlas reconhece veteranos.",
			"Esse atalho não está documentado por design.",
		];
		const msg = messages[Math.floor(Math.random() * messages.length)];
		setTimeout(() => new Notice(msg, 6000), 1500);

		// Toggle dramatic glow on body for 4 seconds
		document.body.addClass("atlas-konami-active");
		setTimeout(() => document.body.removeClass("atlas-konami-active"), 4000);
	}
}

/**
 * Comandos secretos que aparecem no Spotlight quando user digita keywords mágicas.
 * Não documentados intencionalmente — Easter eggs.
 */
export const SECRET_COMMANDS: { trigger: string[]; label: string; action: (plugin: AtlasPlugin) => void }[] = [
	{
		trigger: ["coffee", "cafe", "café"],
		label: "☕ Atlas: Coffee break",
		action: (plugin) => {
			new Notice("☕ Atlas: pausa de 5 minutos recomendada. Hidrate-se.", 8000);
			plugin.gainXp("coffee-break", 5);
		},
	},
	{
		trigger: ["thanks", "obrigado", "valeu"],
		label: "🙏 Atlas: agradecer",
		action: () => {
			const replies = [
				"De nada! 🤗",
				"Tô aqui pra isso.",
				"Sou só um plugin, mas fico feliz.",
				"Continue assim — você está mandando bem.",
				"O Atlas nunca esquece (literalmente).",
			];
			new Notice(replies[Math.floor(Math.random() * replies.length)], 5000);
		},
	},
	{
		trigger: ["42", "meaning of life", "sentido da vida"],
		label: "🌌 Atlas: 42",
		action: () => {
			new Notice("🌌 The answer to life, the universe, and everything is 42.", 8000);
		},
	},
	{
		trigger: ["hello world", "olá mundo"],
		label: "🌍 Atlas: Hello World",
		action: () => {
			new Notice("🌍 Hello, World! — todo grande projeto começa aqui.", 6000);
		},
	},
	{
		trigger: ["jarvis"],
		label: "🤖 Jarvis: presente",
		action: (plugin) => {
			void (async () => {
				try {
					const apiAny = plugin.app as unknown as {
						commands?: { executeCommandById?: (id: string) => void };
					};
					apiAny.commands?.executeCommandById?.("atlas:jarvis");
				} catch {
					new Notice("🤖 Jarvis: presente, sir.", 4000);
				}
			})();
		},
	},
	{
		trigger: ["matrix", "neo"],
		label: "🕶️ Atlas: red pill",
		action: () => {
			document.body.addClass("atlas-matrix-mode");
			new Notice("🕶️ Wake up, Neo. The Matrix has you.", 6000);
			setTimeout(() => document.body.removeClass("atlas-matrix-mode"), 6000);
		},
	},
	{
		trigger: ["xp"],
		label: "⭐ Atlas: bonus XP",
		action: (plugin) => {
			plugin.gainXp("xp-cheat", 10);
			new Notice("⭐ +10 XP (cheater detected, but allowed).", 5000);
		},
	},
];

/** Lookup secret command by trigger. */
export function findSecretCommand(query: string): typeof SECRET_COMMANDS[number] | null {
	const q = query.toLowerCase().trim();
	for (const cmd of SECRET_COMMANDS) {
		if (cmd.trigger.includes(q)) return cmd;
	}
	return null;
}
