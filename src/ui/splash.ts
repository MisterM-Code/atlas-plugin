/**
 * Atlas Splash Screen — animação de boas-vindas first-run (5s).
 *
 * SVG inline + CSS keyframes (zero asset externo).
 * Aparece UMA vez (controlado por settings.firstRunSplashSeen).
 */

import type AtlasPlugin from "../../main";

export class SplashScreen {
	private overlay: HTMLDivElement | null = null;

	constructor(private plugin: AtlasPlugin) {}

	show(): Promise<void> {
		return new Promise((resolve) => {
			const overlay = document.createElement("div");
			overlay.addClass("atlas-splash-overlay");
			overlay.style.position = "fixed";
			overlay.style.inset = "0";
			overlay.style.zIndex = "10000";
			overlay.style.background = "linear-gradient(135deg, #0a0e27 0%, #1e1b4b 50%, #312e81 100%)";
			overlay.style.display = "flex";
			overlay.style.flexDirection = "column";
			overlay.style.alignItems = "center";
			overlay.style.justifyContent = "center";
			overlay.style.opacity = "0";
			overlay.style.transition = "opacity 600ms ease-out";

			// Logo SVG (Atlas: círculo com cruz)
			const logo = document.createElement("div");
			logo.style.width = "120px";
			logo.style.height = "120px";
			logo.style.position = "relative";
			logo.innerHTML = `
				<svg viewBox="0 0 100 100" fill="none" stroke="#a5b4fc" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:100%;height:100%;filter:drop-shadow(0 0 20px rgba(165,180,252,0.6))">
					<circle cx="50" cy="50" r="38" style="opacity:0;animation: atlas-splash-circle 800ms 200ms ease-out forwards"/>
					<path d="M50 12 L50 88" style="stroke-dasharray:80;stroke-dashoffset:80;animation: atlas-splash-line 600ms 600ms ease-out forwards"/>
					<path d="M12 50 L88 50" style="stroke-dasharray:80;stroke-dashoffset:80;animation: atlas-splash-line 600ms 800ms ease-out forwards"/>
					<path d="M22 22 L78 78" style="stroke-dasharray:80;stroke-dashoffset:80;animation: atlas-splash-line 600ms 1000ms ease-out forwards"/>
					<path d="M78 22 L22 78" style="stroke-dasharray:80;stroke-dashoffset:80;animation: atlas-splash-line 600ms 1200ms ease-out forwards"/>
				</svg>
			`;
			overlay.appendChild(logo);

			// Nome
			const name = document.createElement("div");
			name.textContent = "Atlas";
			name.style.color = "#e0e7ff";
			name.style.fontSize = "48px";
			name.style.fontWeight = "300";
			name.style.letterSpacing = "8px";
			name.style.marginTop = "32px";
			name.style.opacity = "0";
			name.style.animation = "atlas-splash-fade 600ms 1500ms ease-out forwards";
			overlay.appendChild(name);

			// Tagline
			const tagline = document.createElement("div");
			tagline.textContent = "Seu segundo cérebro está acordando…";
			tagline.style.color = "#a5b4fc";
			tagline.style.fontSize = "13px";
			tagline.style.fontStyle = "italic";
			tagline.style.marginTop = "16px";
			tagline.style.opacity = "0";
			tagline.style.animation = "atlas-splash-fade 600ms 2200ms ease-out forwards";
			overlay.appendChild(tagline);

			// Loading dots
			const dots = document.createElement("div");
			dots.style.marginTop = "40px";
			dots.style.display = "flex";
			dots.style.gap = "8px";
			for (let i = 0; i < 3; i++) {
				const dot = document.createElement("div");
				dot.style.width = "8px";
				dot.style.height = "8px";
				dot.style.borderRadius = "50%";
				dot.style.background = "#6366f1";
				dot.style.opacity = "0.4";
				dot.style.animation = `atlas-splash-dot 1.2s ${i * 0.2}s infinite ease-in-out`;
				dots.appendChild(dot);
			}
			overlay.appendChild(dots);

			// Inject animations CSS
			this.injectCss();

			document.body.appendChild(overlay);
			this.overlay = overlay;

			// Fade in
			requestAnimationFrame(() => {
				overlay.style.opacity = "1";
			});

			// Auto-dismiss em 4.5s
			setTimeout(() => {
				overlay.style.opacity = "0";
				setTimeout(() => {
					overlay.remove();
					this.overlay = null;
					resolve();
				}, 600);
			}, 4500);

			// Click pra pular
			overlay.addEventListener("click", () => {
				overlay.style.opacity = "0";
				setTimeout(() => {
					overlay.remove();
					this.overlay = null;
					resolve();
				}, 300);
			});
		});
	}

	private injectCss(): void {
		if (document.getElementById("atlas-splash-css")) return;
		const style = document.createElement("style");
		style.id = "atlas-splash-css";
		style.textContent = `
			@keyframes atlas-splash-circle {
				0% { opacity: 0; transform: scale(0.8); transform-origin: 50% 50%; }
				100% { opacity: 1; transform: scale(1); }
			}
			@keyframes atlas-splash-line {
				to { stroke-dashoffset: 0; }
			}
			@keyframes atlas-splash-fade {
				to { opacity: 1; }
			}
			@keyframes atlas-splash-dot {
				0%, 60%, 100% { opacity: 0.4; transform: scale(1); }
				30% { opacity: 1; transform: scale(1.4); }
			}
		`;
		document.head.appendChild(style);
	}

	dismiss(): void {
		if (this.overlay) {
			this.overlay.remove();
			this.overlay = null;
		}
	}
}
