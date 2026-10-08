import { html, nothing, type TemplateResult } from "lit";
import { markupKind } from "../pattern-editor/patternNodes.js";

export type RenderItem =
	| { type: "text"; value: string }
	| { type: "token"; template: TemplateResult }
	| {
			type: "markup-start" | "markup-end" | "markup-standalone";
			name: string;
	  };

type Leaf =
	| { type: "text"; value: string }
	| { type: "token"; template: TemplateResult }
	| { type: "tag"; text: string; title: string };
type Branch = { type: "branch"; name: string; children: Array<Branch | Leaf> };

/**
 * Renders text, tokens and markup with real formatting: known markup
 * (b/strong/bold, i/em/italic, a/link/u) wraps its content, unknown markup is
 * shown as small tag markers (or omitted when `unknownMarkers` is false).
 * Unbalanced markup never throws: unclosed tags run to the end, stray end
 * tags render as markers.
 */
export function renderParts(
	items: readonly RenderItem[],
	options: { unknownMarkers?: boolean } = {}
): TemplateResult {
	const unknownMarkers = options.unknownMarkers ?? true;
	const root: Branch = { type: "branch", name: "", children: [] };
	const stack: Branch[] = [root];
	for (const item of items) {
		const top = stack[stack.length - 1]!;
		if (item.type === "markup-start") {
			const branch: Branch = { type: "branch", name: item.name, children: [] };
			top.children.push(branch);
			stack.push(branch);
		} else if (item.type === "markup-end") {
			let index = -1;
			for (let i = stack.length - 1; i > 0; i--) {
				if (stack[i]!.name === item.name) {
					index = i;
					break;
				}
			}
			if (index > 0) stack.length = index;
			else if (unknownMarkers)
				top.children.push({
					type: "tag",
					text: `</${item.name}>`,
					title: `End of <${item.name}>`,
				});
		} else if (item.type === "markup-standalone") {
			if (unknownMarkers || markupKind(item.name) !== "unknown")
				top.children.push({
					type: "tag",
					text: `<${item.name}/>`,
					title: `<${item.name}/>`,
				});
		} else {
			top.children.push(item as Leaf);
		}
	}
	return renderChildren(root.children, unknownMarkers);
}

function renderChildren(
	children: Array<Branch | Leaf>,
	unknownMarkers: boolean
): TemplateResult {
	return html`${children.map((child) => renderNode(child, unknownMarkers))}`;
}

function renderNode(
	node: Branch | Leaf,
	unknownMarkers: boolean
): TemplateResult | string {
	switch (node.type) {
		case "text":
			return node.value;
		case "token":
			return node.template;
		case "tag":
			return html`<span class="markup-tag" part="markup" title=${node.title}
				>${node.text}</span
			>`;
		case "branch": {
			const content = renderChildren(node.children, unknownMarkers);
			switch (markupKind(node.name)) {
				case "bold":
					return html`<strong class="markup-bold" part="markup markup-bold"
						>${content}</strong
					>`;
				case "italic":
					return html`<em class="markup-italic" part="markup markup-italic"
						>${content}</em
					>`;
				case "underline":
					return html`<span
						class="markup-underline"
						part="markup markup-underline"
						>${content}</span
					>`;
				default:
					return html`${unknownMarkers
						? html`<span
								class="markup-tag"
								part="markup"
								title=${`Start of <${node.name}>`}
								>&lt;${node.name}&gt;</span
							>`
						: nothing}${content}${unknownMarkers
						? html`<span
								class="markup-tag"
								part="markup"
								title=${`End of <${node.name}>`}
								>&lt;/${node.name}&gt;</span
							>`
						: nothing}`;
			}
		}
	}
}
