import {
	Block,
	AtlasTemplate,
	TemplateRenderContext,
	HeadingBlock,
	TextBlock,
	ListBlock,
	FrontmatterBlock,
	AtlasBriefBlock,
	TasksPlaceholderBlock,
	TagsBlock,
	CalloutBlock,
	CodeBlock,
} from "./block-types";

/**
 * Renderer: AtlasTemplate (JSON) → markdown.
 */

export function renderTemplate(template: AtlasTemplate, ctx: TemplateRenderContext): string {
	const parts: string[] = [];

	for (const block of template.blocks) {
		const rendered = renderBlock(block, ctx);
		if (rendered) {
			parts.push(rendered);
		}
	}

	return parts.join("\n\n").trim() + "\n";
}

export function renderBlock(block: Block, ctx: TemplateRenderContext): string {
	switch (block.kind) {
		case "frontmatter":
			return renderFrontmatter(block, ctx);
		case "heading":
			return renderHeading(block, ctx);
		case "text":
			return interpolate((block as TextBlock).text, ctx);
		case "list":
			return renderList(block, ctx);
		case "atlas-brief":
			return renderAtlasBrief(block);
		case "tasks-placeholder":
			return renderTasksPlaceholder(block, ctx);
		case "tags":
			return renderTags(block);
		case "callout":
			return renderCallout(block, ctx);
		case "code":
			return renderCode(block, ctx);
		case "separator":
			return "---";
	}
}

function renderFrontmatter(b: FrontmatterBlock, ctx: TemplateRenderContext): string {
	const lines = ["---"];
	for (const [k, v] of Object.entries(b.fields)) {
		const interpolated = interpolate(v, ctx);
		// JSON.stringify para strings com caracteres especiais
		if (interpolated.includes(":") || interpolated.includes("\n")) {
			lines.push(`${k}: ${JSON.stringify(interpolated)}`);
		} else {
			lines.push(`${k}: ${interpolated}`);
		}
	}
	lines.push("---");
	return lines.join("\n");
}

function renderHeading(b: HeadingBlock, ctx: TemplateRenderContext): string {
	const hashes = "#".repeat(b.level);
	const icon = b.icon ? `${b.icon} ` : "";
	return `${hashes} ${icon}${interpolate(b.text, ctx)}`;
}

function renderList(b: ListBlock, ctx: TemplateRenderContext): string {
	if (b.items.length === 0) return "";
	return b.items
		.map((item, i) => {
			const text = interpolate(item, ctx);
			switch (b.style) {
				case "numbered":
					return `${i + 1}. ${text}`;
				case "checkbox":
					return `- [ ] ${text}`;
				default:
					return `- ${text}`;
			}
		})
		.join("\n");
}

function renderAtlasBrief(b: AtlasBriefBlock): string {
	const hint = b.hint ?? "_Plugin Atlas injetará automaticamente: últimas sessões, commitments, temas, perguntas sugeridas._";
	return `## 🤖 Atlas Brief\n<!-- atlas-brief-start -->\n> ${hint}\n<!-- atlas-brief-end -->`;
}

function renderTasksPlaceholder(b: TasksPlaceholderBlock, ctx: TemplateRenderContext): string {
	const owner = b.owner ?? ctx.pessoa ?? "_";
	const ownerStr = owner === "_" ? "_" : `[[${owner}]]`;
	const dueDate = b.dueDateOffset !== undefined ? offsetDate(b.dueDateOffset) : null;
	const dueStr = dueDate ? ` (@${dueDate})` : " (@_)";
	const prefix = b.prefix ? ` ${b.prefix}` : "";
	return `- [ ] ${ownerStr} — _${dueStr}${prefix}`;
}

function offsetDate(days: number): string {
	const d = new Date(Date.now() + days * 86_400_000);
	return d.toISOString().split("T")[0];
}

function renderTags(b: TagsBlock): string {
	if (b.tags.length === 0) return "";
	return b.tags.map((t) => `#${t.replace(/^#/, "")}`).join(" ");
}

function renderCallout(b: CalloutBlock, ctx: TemplateRenderContext): string {
	const titleStr = b.title ? ` ${b.title}` : "";
	const lines = interpolate(b.text, ctx).split("\n");
	const body = lines.map((l) => `> ${l}`).join("\n");
	return `> [!${b.type}]${titleStr}\n${body}`;
}

function renderCode(b: CodeBlock, ctx: TemplateRenderContext): string {
	return "```" + (b.lang ?? "") + "\n" + interpolate(b.code, ctx) + "\n```";
}

/**
 * Replace {{var}} placeholders.
 */
function interpolate(text: string, ctx: TemplateRenderContext): string {
	return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
		const v = ctx[key];
		return v !== undefined ? v : `{{${key}}}`;
	});
}
