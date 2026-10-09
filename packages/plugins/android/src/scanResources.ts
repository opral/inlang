import type { Comment, Entry } from "./mergeEntries.js";

/**
 * A `<string>` or `<plurals>` element, or an `<item>` of a plural. The
 * `valueRange` of a `<string>` or `<item>` is its content, so that an edit
 * keeps the start tag with its attributes (e.g. `tools:ignore`).
 */
export type ScannedEntry = Entry & {
  /** `false` for `translatable="false"`, which the plugin doesn't import */
  translatable: boolean;
  children?: ScannedEntry[];
};

export type ScannedResources = {
  /** `<string>` and `<plurals>` elements, with the `<item>`s of plurals */
  entries: ScannedEntry[];
  comments: Comment[];
  /** start of the `</resources>` tag */
  closeTagStart: number;
  /** the indentation of the elements and comments in `<resources>` */
  indent: string | undefined;
};

/**
 * Finds the positions of the `<string>` and `<plurals>` elements in an
 * Android resources file, keyed by their `name`, and the `<item>`s of
 * plurals, keyed by their `quantity`.
 *
 * Throws if the file is not well-formed or uses XML that this scanner
 * doesn't support (e.g. a DOCTYPE with an internal subset).
 */
export function scanResources(text: string): ScannedResources {
  const entries: ScannedEntry[] = [];
  const comments: Comment[] = [];
  let indent: string | undefined;
  let closeTagStart: number | undefined;
  let pos = 0;
  type Open = {
    name: string;
    start: number;
    attributes: Map<string, string>;
    /** offset after the start tag */
    contentStart: number;
    children: ScannedEntry[];
  };
  const stack: Open[] = [];
  let sawRoot = false;

  const fail = (message: string): never => {
    throw new Error(`${message} at offset ${pos}`);
  };
  const indexOf = (search: string, from: number) => {
    const index = text.indexOf(search, from);
    if (index === -1) fail(`Missing ${search}`);
    return index;
  };
  const lineIndent = (offset: number) => {
    const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
    const before = text.slice(lineStart, offset);
    return /^[ \t]*$/.test(before) ? before : undefined;
  };

  while (pos < text.length) {
    if (text.startsWith("<!--", pos)) {
      const end = indexOf("-->", pos + 4) + 3;
      comments.push({ start: pos, end });
      if (stack.length === 1 && indent === undefined) indent = lineIndent(pos);
      pos = end;
    } else if (text.startsWith("<![CDATA[", pos)) {
      if (stack.length === 0) fail("CDATA outside of the root element");
      pos = indexOf("]]>", pos + 9) + 3;
    } else if (text.startsWith("<?", pos)) {
      pos = indexOf("?>", pos + 2) + 2;
    } else if (text.startsWith("<!", pos)) {
      const end = indexOf(">", pos);
      if (text.slice(pos, end).includes("[")) fail("Unsupported DOCTYPE");
      pos = end + 1;
    } else if (text.startsWith("</", pos)) {
      const end = indexOf(">", pos);
      const name = text.slice(pos + 2, end).trim();
      const open = stack.pop();
      if (open === undefined || open.name !== name)
        fail(`Unexpected </${name}>`);
      if (stack.length === 0) closeTagStart = pos;
      const contentEnd = pos;
      pos = end + 1;
      close(open!, pos, contentEnd);
    } else if (text[pos] === "<") {
      const start = pos;
      pos++;
      const name = /^[^\s/>]+/.exec(text.slice(pos))?.[0];
      if (name === undefined) fail("Invalid tag");
      pos += name!.length;
      const attributes = new Map<string, string>();
      let selfClosing = false;
      for (;;) {
        pos += /^\s*/.exec(text.slice(pos))![0].length;
        if (text.startsWith("/>", pos)) {
          selfClosing = true;
          pos += 2;
          break;
        }
        if (text[pos] === ">") {
          pos++;
          break;
        }
        const attribute = /^([^\s=/>]+)\s*=\s*(["'])/.exec(text.slice(pos));
        if (attribute === null) fail("Invalid attribute");
        pos += attribute![0].length;
        const end = indexOf(attribute![2]!, pos);
        attributes.set(attribute![1]!, decodeEntities(text.slice(pos, end)));
        pos = end + 1;
      }
      if (stack.length === 0) {
        if (sawRoot || name !== "resources") fail("Expected one <resources>");
        sawRoot = true;
        if (selfClosing) fail("Empty <resources/>");
      } else if (stack.length === 1 && indent === undefined) {
        indent = lineIndent(start);
      }
      const open: Open = {
        name: name!,
        start,
        attributes,
        contentStart: pos,
        children: [],
      };
      if (selfClosing) {
        close(open, pos);
      } else {
        stack.push(open);
      }
    } else {
      const next = text.indexOf("<", pos);
      const end = next === -1 ? text.length : next;
      if (stack.length === 0 && !/^\s*$/.test(text.slice(pos, end)))
        fail("Text outside of the root element");
      pos = end;
    }
  }
  if (stack.length > 0 || closeTagStart === undefined)
    fail("Unclosed <resources>");

  /** `contentEnd` is the start of the end tag, if the element has one */
  function close(open: Open, end: number, contentEnd?: number) {
    // the element is a child of the element at the top of the stack
    const depth = stack.length;
    const key = open.attributes.get(depth === 1 ? "name" : "quantity");
    const valueRange =
      contentEnd === undefined
        ? {}
        : { valueRange: { start: open.contentStart, end: contentEnd } };
    const translatable = open.attributes.get("translatable") !== "false";
    if (
      depth === 1 &&
      (open.name === "string" || open.name === "plurals") &&
      key !== undefined
    ) {
      entries.push({
        key,
        start: open.start,
        end,
        translatable,
        ...(open.name === "plurals" ? { children: open.children } : valueRange),
      });
    } else if (
      depth === 2 &&
      stack[1]!.name === "plurals" &&
      open.name === "item" &&
      key !== undefined
    ) {
      stack[1]!.children.push({
        key,
        start: open.start,
        end,
        translatable,
        ...valueRange,
      });
    }
  }

  return { entries, comments, closeTagStart: closeTagStart!, indent };
}

function decodeEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g,
    (_, entity: string) => {
      if (entity.startsWith("#x"))
        return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      if (entity.startsWith("#"))
        return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[entity]!;
    },
  );
}
