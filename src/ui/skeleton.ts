/**
 * Atlas Skeleton Loaders — placeholders animados durante LLM/network.
 *
 * Uso:
 *   const sk = renderSkeleton(container, { kind: "paragraph", count: 3 });
 *   // ... await LLM ...
 *   sk.remove();
 */

export interface SkeletonOptions {
	kind: "line" | "paragraph" | "card" | "title" | "avatar";
	count?: number;
	width?: string; // CSS width
	height?: string; // CSS height
}

export interface SkeletonHandle {
	el: HTMLElement;
	remove: () => void;
}

export function renderSkeleton(parent: HTMLElement, opts: SkeletonOptions): SkeletonHandle {
	const wrap = parent.createDiv();
	wrap.addClass("atlas-skeleton-wrapper");
	wrap.style.display = "flex";
	wrap.style.flexDirection = "column";
	wrap.style.gap = "8px";

	const count = opts.count ?? 1;

	for (let i = 0; i < count; i++) {
		const el = wrap.createDiv();
		el.addClass("atlas-skeleton");
		el.style.height = opts.height ?? defaultHeight(opts.kind);
		el.style.width = opts.width ?? defaultWidth(opts.kind, i, count);
		if (opts.kind === "card") {
			el.style.height = opts.height ?? "80px";
		}
		if (opts.kind === "avatar") {
			el.style.borderRadius = "50%";
			el.style.width = el.style.height = "40px";
		}
	}

	return {
		el: wrap,
		remove: () => wrap.remove(),
	};
}

function defaultHeight(kind: SkeletonOptions["kind"]): string {
	switch (kind) {
		case "line":
			return "12px";
		case "paragraph":
			return "12px";
		case "title":
			return "20px";
		case "card":
			return "80px";
		case "avatar":
			return "40px";
	}
}

function defaultWidth(kind: SkeletonOptions["kind"], idx: number, total: number): string {
	switch (kind) {
		case "line":
			return "100%";
		case "paragraph": {
			// Linhas com larguras variadas (last is shorter)
			if (idx === total - 1) return "60%";
			return idx % 2 === 0 ? "92%" : "100%";
		}
		case "title":
			return "55%";
		case "card":
			return "100%";
		case "avatar":
			return "40px";
	}
}

/**
 * Spinner inline pequeno (pra botões em loading).
 * Use: btn.appendChild(createSpinner());
 */
export function createSpinner(): HTMLElement {
	const span = document.createElement("span");
	span.addClass("atlas-spinner");
	span.style.marginLeft = "6px";
	span.style.verticalAlign = "middle";
	return span;
}
