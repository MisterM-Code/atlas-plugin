/**
 * Atlas Tree View — componente reutilizável para árvore expansível.
 *
 * Suporta:
 * - Lazy children (children podem ser função async)
 * - State persisted (quais nós estão abertos) via localStorage
 * - Custom click handlers
 * - Badges, icons, colors
 */

const STATE_KEY_PREFIX = "atlas-tree-state";

export interface TreeNode {
	id: string;
	icon: string;
	label: string;
	subtitle?: string;
	color?: string;
	badge?: string;
	children?: TreeNode[] | (() => TreeNode[] | Promise<TreeNode[]>);
	onClick?: () => void | Promise<void>;
	onContextMenu?: () => void | Promise<void>;
}

export interface TreeViewOptions {
	stateId: string;
	defaultExpanded?: boolean;
	maxDepth?: number;
}

export class TreeView {
	private expanded: Set<string>;

	constructor(private opts: TreeViewOptions) {
		this.expanded = this.loadExpanded();
	}

	private loadExpanded(): Set<string> {
		try {
			const raw = window.localStorage.getItem(`${STATE_KEY_PREFIX}-${this.opts.stateId}`);
			if (raw) return new Set(JSON.parse(raw));
		} catch {
			// noop
		}
		return new Set();
	}

	private saveExpanded(): void {
		try {
			window.localStorage.setItem(
				`${STATE_KEY_PREFIX}-${this.opts.stateId}`,
				JSON.stringify(Array.from(this.expanded))
			);
		} catch {
			// noop
		}
	}

	async render(container: HTMLElement, roots: TreeNode[]): Promise<void> {
		container.empty();
		const wrap = container.createDiv();
		wrap.addClass("atlas-tree-view");
		for (const node of roots) {
			await this.renderNode(wrap, node, 0);
		}
	}

	private async renderNode(parent: HTMLElement, node: TreeNode, depth: number): Promise<void> {
		if (this.opts.maxDepth !== undefined && depth > this.opts.maxDepth) return;

		const row = parent.createDiv();
		row.addClass("atlas-tree-node");
		row.style.display = "flex";
		row.style.alignItems = "center";
		row.style.gap = "6px";
		row.style.padding = "3px 6px";
		row.style.paddingLeft = `${6 + depth * 16}px`;
		row.style.cursor = node.onClick ? "pointer" : "default";
		row.style.borderRadius = "3px";
		row.addEventListener("mouseenter", () => {
			row.style.background = "var(--background-modifier-hover)";
		});
		row.addEventListener("mouseleave", () => {
			row.style.background = "";
		});

		// Toggle / spacer
		const hasChildren =
			Array.isArray(node.children)
				? node.children.length > 0
				: typeof node.children === "function";
		if (hasChildren) {
			const toggle = row.createEl("span", {
				text: this.expanded.has(node.id) ? "▼" : "▶",
			});
			toggle.style.fontSize = "9px";
			toggle.style.width = "12px";
			toggle.style.opacity = "0.6";
			toggle.style.cursor = "pointer";
			toggle.addEventListener("click", async (ev) => {
				ev.stopPropagation();
				if (this.expanded.has(node.id)) {
					this.expanded.delete(node.id);
				} else {
					this.expanded.add(node.id);
				}
				this.saveExpanded();
				// Re-render parent (whole tree)
				const treeRoot = parent.closest(".atlas-tree-view") as HTMLElement | null;
				if (treeRoot) await this.rerender(treeRoot);
			});
		} else {
			const spacer = row.createEl("span");
			spacer.style.width = "12px";
		}

		// Icon
		const iconEl = row.createEl("span", { text: node.icon });
		iconEl.style.fontSize = "13px";

		// Label + subtitle
		const labelWrap = row.createDiv();
		labelWrap.style.flexGrow = "1";
		labelWrap.style.minWidth = "0";

		const labelEl = labelWrap.createEl("span", { text: node.label });
		labelEl.style.fontSize = "12px";
		labelEl.style.fontWeight = depth === 0 ? "bold" : "normal";
		if (node.color) labelEl.style.color = node.color;
		labelEl.style.overflow = "hidden";
		labelEl.style.textOverflow = "ellipsis";
		labelEl.style.whiteSpace = "nowrap";
		labelEl.style.display = "block";

		if (node.subtitle) {
			const sub = labelWrap.createEl("span", { text: node.subtitle });
			sub.style.fontSize = "10px";
			sub.style.opacity = "0.6";
			sub.style.display = "block";
			sub.style.overflow = "hidden";
			sub.style.textOverflow = "ellipsis";
			sub.style.whiteSpace = "nowrap";
		}

		if (node.badge) {
			const badge = row.createEl("span", { text: node.badge });
			badge.style.fontSize = "10px";
			badge.style.padding = "1px 6px";
			badge.style.background = "var(--background-modifier-hover)";
			badge.style.borderRadius = "8px";
			badge.style.opacity = "0.7";
		}

		if (node.onClick) {
			row.addEventListener("click", () => void node.onClick?.());
		}
		if (node.onContextMenu) {
			row.addEventListener("contextmenu", (ev) => {
				ev.preventDefault();
				void node.onContextMenu?.();
			});
		}

		// Render children if expanded
		if (hasChildren && this.expanded.has(node.id)) {
			const childContainer = parent.createDiv();
			let children: TreeNode[];
			if (Array.isArray(node.children)) {
				children = node.children;
			} else if (typeof node.children === "function") {
				children = await node.children();
			} else {
				children = [];
			}
			for (const child of children) {
				await this.renderNode(childContainer, child, depth + 1);
			}
		}
	}

	private async rerender(treeRoot: HTMLElement): Promise<void> {
		// Re-render approach: trigger custom event captured by host
		treeRoot.dispatchEvent(new CustomEvent("atlas-tree-rerender"));
	}

	expandAll(): void {
		// Caller deve passar IDs conhecidos
	}

	collapseAll(): void {
		this.expanded.clear();
		this.saveExpanded();
	}
}
