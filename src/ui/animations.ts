/**
 * Atlas Animations — Web Animations API helpers (zero dep).
 *
 * Pra "Jarvis-feel": fade, slide, scale, pulse, shake, typing, confetti.
 * Tudo usando WAAPI nativo do Electron (chrome) — performance GPU-accelerated.
 */

export interface AnimateOptions {
	duration?: number;
	easing?: string;
	delay?: number;
}

const DEFAULT_EASING = "cubic-bezier(0.4, 0, 0.2, 1)"; // material standard

/** Fade in from opacity 0. */
export function fadeIn(el: HTMLElement, opts: AnimateOptions = {}): Animation {
	return el.animate(
		[
			{ opacity: 0 },
			{ opacity: 1 },
		],
		{
			duration: opts.duration ?? 250,
			easing: opts.easing ?? DEFAULT_EASING,
			delay: opts.delay ?? 0,
			fill: "forwards",
		}
	);
}

/** Fade out to opacity 0. */
export function fadeOut(el: HTMLElement, opts: AnimateOptions = {}): Animation {
	return el.animate(
		[{ opacity: 1 }, { opacity: 0 }],
		{
			duration: opts.duration ?? 200,
			easing: opts.easing ?? DEFAULT_EASING,
			fill: "forwards",
		}
	);
}

/** Slide in from direction. */
export function slideIn(
	el: HTMLElement,
	dir: "up" | "down" | "left" | "right" = "up",
	opts: AnimateOptions = {}
): Animation {
	const offset = "12px";
	const from = (() => {
		switch (dir) {
			case "up":
				return `translateY(${offset})`;
			case "down":
				return `translateY(-${offset})`;
			case "left":
				return `translateX(${offset})`;
			case "right":
				return `translateX(-${offset})`;
		}
	})();

	return el.animate(
		[
			{ opacity: 0, transform: from },
			{ opacity: 1, transform: "translate(0, 0)" },
		],
		{
			duration: opts.duration ?? 280,
			easing: opts.easing ?? DEFAULT_EASING,
			delay: opts.delay ?? 0,
			fill: "forwards",
		}
	);
}

/** Scale in (zoom from 0.95). */
export function scaleIn(el: HTMLElement, opts: AnimateOptions = {}): Animation {
	return el.animate(
		[
			{ opacity: 0, transform: "scale(0.95)" },
			{ opacity: 1, transform: "scale(1)" },
		],
		{
			duration: opts.duration ?? 220,
			easing: opts.easing ?? DEFAULT_EASING,
			fill: "forwards",
		}
	);
}

/** Stagger animate elements (each delayed by N ms). */
export function staggerCards(els: HTMLElement[], staggerMs = 60, opts: AnimateOptions = {}): void {
	els.forEach((el, i) => {
		slideIn(el, "up", { ...opts, delay: i * staggerMs });
	});
}

/** Pulse (chama atenção). */
export function pulse(el: HTMLElement): Animation {
	return el.animate(
		[
			{ transform: "scale(1)" },
			{ transform: "scale(1.05)" },
			{ transform: "scale(1)" },
		],
		{
			duration: 600,
			easing: "ease-in-out",
		}
	);
}

/** Shake (erro / atenção negativa). */
export function shake(el: HTMLElement): Animation {
	return el.animate(
		[
			{ transform: "translateX(0)" },
			{ transform: "translateX(-8px)" },
			{ transform: "translateX(8px)" },
			{ transform: "translateX(-6px)" },
			{ transform: "translateX(6px)" },
			{ transform: "translateX(0)" },
		],
		{
			duration: 400,
			easing: "ease-in-out",
		}
	);
}

/**
 * Typing effect — digita char by char (ou string completa) com cursor piscante.
 * Retorna uma promise que resolve quando termina.
 */
export async function typeWriter(
	el: HTMLElement,
	text: string,
	opts: { charDelay?: number; cursor?: boolean } = {}
): Promise<void> {
	const charDelay = opts.charDelay ?? 18;
	const showCursor = opts.cursor ?? true;

	el.empty();
	const textNode = el.createSpan();
	let cursor: HTMLSpanElement | null = null;
	if (showCursor) {
		cursor = el.createSpan({ text: "▎" });
		cursor.style.opacity = "0.6";
		cursor.style.animation = "atlas-cursor-blink 1s steps(2) infinite";
	}

	let i = 0;
	return new Promise((resolve) => {
		const tick = () => {
			if (i >= text.length) {
				if (cursor) {
					cursor.style.animation = "none";
					setTimeout(() => cursor?.remove(), 800);
				}
				resolve();
				return;
			}
			textNode.textContent = text.substring(0, ++i);
			setTimeout(tick, charDelay);
		};
		tick();
	});
}

/** Confetti burst (canvas-confetti). */
export async function confettiBurst(opts: { x?: number; y?: number; particles?: number } = {}): Promise<void> {
	try {
		const confetti = (await import("canvas-confetti")).default;
		confetti({
			particleCount: opts.particles ?? 80,
			spread: 75,
			origin: {
				x: opts.x ?? 0.5,
				y: opts.y ?? 0.6,
			},
			colors: ["#3b82f6", "#10b981", "#f97316", "#ec4899", "#8b5cf6", "#fbbf24"],
		});
	} catch {
		// silent fail (canvas-confetti não disponível)
	}
}

/**
 * Slide horizontal entre 2 elementos (usado em tab transitions).
 * Old element slides out, new element slides in.
 */
export function tabSlideTransition(oldEl: HTMLElement, newEl: HTMLElement): void {
	oldEl.animate(
		[
			{ opacity: 1, transform: "translateX(0)" },
			{ opacity: 0, transform: "translateX(-12px)" },
		],
		{ duration: 120, easing: DEFAULT_EASING, fill: "forwards" }
	);
	newEl.animate(
		[
			{ opacity: 0, transform: "translateX(12px)" },
			{ opacity: 1, transform: "translateX(0)" },
		],
		{
			duration: 200,
			delay: 80,
			easing: DEFAULT_EASING,
			fill: "forwards",
		}
	);
}

/**
 * v0.9.3: keyframes + selectors moved to styles.css per Obsidian guideline
 * (no runtime <style> injection). Function kept as no-op for retro-compat.
 */
export function injectGlobalAnimationStyles(): void {
	// styles.css handles all keyframes + .atlas-skeleton/.atlas-spinner/etc.
}
