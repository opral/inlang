/**
 * Writes the entries of a new translation file into the text of the previous
 * file, keeping the text of every entry that didn't change.
 *
 * Format independent: the plugin scans the previous file into entries (key and
 * position) and comments, and provides the text it writes for each entry of
 * the previous file (`previous`, i.e. the export of what the previous file
 * imports to) and of the new data (`next`, in the order the plugin writes
 * them).
 *
 * - An entry whose text in `previous` equals the one in `next` keeps its
 *   original text.
 * - A changed entry is replaced by its text in `next`. Entries with children
 *   (e.g. the items of Android plurals) are merged child by child.
 * - Removed entries are removed with the comment directly above them and their
 *   line.
 * - New entries are inserted after the entry that precedes them in `next`.
 * - Everything else (whitespace, comments, text that is not an entry) is kept.
 */

export type Entry = {
  key: string;
  /** offset of the first character of the entry */
  start: number;
  /** offset after the last character of the entry */
  end: number;
  children?: Entry[];
};

export type Comment = { start: number; end: number };

export type EntryText = {
  /**
   * The text of the entry without the indentation of its first line. Lines
   * after the first are indented with `indentUnit` per level, relative to
   * the first line.
   */
  text: string;
  /** The text of the entry without its children, if it has children. */
  shell?: string;
  children?: Map<string, EntryText>;
};

export type Edit = { start: number; end: number; text: string };

export function mergeEntries(args: {
  text: string;
  entries: Entry[];
  comments: Comment[];
  previous: Map<string, EntryText>;
  next: Map<string, EntryText>;
  /** One level of indentation in `EntryText.text`. */
  indentUnit: string;
  /** One level of indentation in the file. */
  fileIndentUnit: string;
  /** The indentation of entries inserted by `insertIntoEmpty`. */
  emptyIndent?: string;
  /**
   * Where to insert new entries if `entries` is empty. Returns `undefined`
   * if there is no place, i.e. the previous file can't be kept.
   */
  insertIntoEmpty: (texts: string[]) => Edit | undefined;
}): string | undefined {
  const newline = args.text.includes("\r\n") ? "\r\n" : "\n";
  const edits = mergeLevel({ ...args, newline });
  if (edits === undefined) return undefined;
  return applyEdits(args.text, edits);
}

function mergeLevel(args: {
  text: string;
  entries: Entry[];
  comments: Comment[];
  previous: Map<string, EntryText>;
  next: Map<string, EntryText>;
  indentUnit: string;
  fileIndentUnit: string;
  emptyIndent?: string;
  newline: string;
  insertIntoEmpty: (texts: string[]) => Edit | undefined;
}): Edit[] | undefined {
  const { text, entries, previous, next } = args;
  const edits: Edit[] = [];
  const write = (entry: EntryText, indent: string) =>
    reindent(entry.text, {
      from: args.indentUnit,
      to: args.fileIndentUnit,
      indent,
      newline: args.newline,
    });

  for (const entry of entries) {
    const nextEntry = next.get(entry.key);
    if (nextEntry === undefined) {
      edits.push(removal(text, entry, args.comments));
      continue;
    }
    const previousEntry = previous.get(entry.key);
    if (previousEntry?.text === nextEntry.text) {
      continue;
    }
    if (
      entry.children &&
      entry.children.length > 0 &&
      previousEntry?.children &&
      nextEntry.children &&
      previousEntry.shell === nextEntry.shell
    ) {
      const childEdits = mergeLevel({
        ...args,
        entries: entry.children,
        previous: previousEntry.children,
        next: nextEntry.children,
        insertIntoEmpty: () => undefined,
      });
      if (childEdits !== undefined) {
        edits.push(...childEdits);
        continue;
      }
    }
    edits.push({
      start: entry.start,
      end: entry.end,
      text: write(nextEntry, lineIndent(text, entry.start)),
    });
  }

  // new entries, after the entry that precedes them in `next`
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  const firstKept = entries.find((entry) => next.has(entry.key));
  const separator = entrySeparator(text, entries, args.newline);
  const added: string[] = [];
  let anchor: Entry | undefined;
  const flush = () => {
    if (added.length === 0) return true;
    if (anchor !== undefined) {
      const end = blockEnd(text, anchor, args.comments);
      edits.push({
        start: end,
        end,
        text: added.map((entry) => separator + entry).join(""),
      });
    } else if (firstKept !== undefined) {
      const first = blockStart(text, firstKept, args.comments);
      edits.push({
        start: first,
        end: first,
        text: added.map((entry) => entry + separator).join(""),
      });
    } else {
      const edit = args.insertIntoEmpty(added);
      if (edit === undefined) return false;
      edits.push(edit);
    }
    added.length = 0;
    return true;
  };
  for (const [key, entry] of next) {
    const existing = byKey.get(key);
    if (existing !== undefined) {
      if (!flush()) return undefined;
      anchor = existing;
      continue;
    }
    const indent =
      anchor !== undefined
        ? lineIndent(text, anchor.start)
        : firstKept !== undefined
          ? lineIndent(text, firstKept.start)
          : (args.emptyIndent ?? "");
    added.push(write(entry, indent));
  }
  if (!flush()) return undefined;
  return edits;
}

/**
 * The whitespace between two entries of the file, e.g. a line break and the
 * indentation, or an empty line.
 */
function entrySeparator(
  text: string,
  entries: Entry[],
  newline: string,
): string {
  for (let index = 0; index + 1 < entries.length; index++) {
    const between = text.slice(entries[index]!.end, entries[index + 1]!.start);
    if (/^\s*$/.test(between) && between.includes("\n")) return between;
  }
  for (const entry of entries) {
    const after = /^\s*/.exec(text.slice(entry.end))![0];
    const followedBy = text[entry.end + after.length];
    // followed by a comment or another element, not by the end of a block
    if (
      after.includes("\n") &&
      followedBy !== undefined &&
      !text.startsWith("</", entry.end + after.length)
    )
      return after;
  }
  return newline + (entries[0] ? lineIndent(text, entries[0].start) : "");
}

/** The edit that removes an entry, the comment directly above it and its line. */
function removal(text: string, entry: Entry, comments: Comment[]): Edit {
  let start = blockStart(text, entry, comments);
  let end = blockEnd(text, entry, comments);
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const afterEnd = /^[ \t]*(\r?\n|$)/.exec(text.slice(end));
  if (/^[ \t]*$/.test(text.slice(lineStart, start)) && afterEnd !== null) {
    // whole lines
    start = lineStart;
    end += afterEnd[0].length;
    const blankBefore =
      start === 0 || /\n[ \t]*\r?\n$/.test(text.slice(0, start));
    const blankAfter = /^[ \t]*\r?\n/.exec(text.slice(end));
    if (blankBefore && blankAfter !== null) {
      // the entry was a block between empty lines
      end += blankAfter[0].length;
    } else if (
      blankAfter === null &&
      end === text.length &&
      /\n[ \t]*\r?\n$/.test(text.slice(0, start))
    ) {
      // the last block of the file: remove the empty line before it
      start -= text.slice(0, start).endsWith("\r\n") ? 2 : 1;
    }
    return { start, end, text: "" };
  }
  // The entry shares its line with other text. At the start of the line,
  // the text after it moves to its place, else the whitespace before it is
  // removed.
  if (/^[ \t]*$/.test(text.slice(lineStart, start))) {
    const after = /^[ \t]*/.exec(text.slice(end))![0];
    return { start, end: end + after.length, text: "" };
  }
  const before = /[ \t]*$/.exec(text.slice(0, start))![0];
  return { start: start - before.length, end, text: "" };
}

/** The end of an entry, including a comment after it on the same line. */
function blockEnd(text: string, entry: Entry, comments: Comment[]): number {
  const comment = comments.find(
    (candidate) =>
      candidate.start >= entry.end &&
      /^[ \t]*$/.test(text.slice(entry.end, candidate.start)),
  );
  return comment !== undefined &&
    !text.slice(entry.end, comment.end).includes("\n")
    ? comment.end
    : entry.end;
}

/** The start of an entry, including the comment directly above it. */
function blockStart(text: string, entry: Entry, comments: Comment[]): number {
  const comment = comments.find(
    (candidate) =>
      candidate.end <= entry.start &&
      /^[ \t]*(\r?\n)?[ \t]*$/.test(text.slice(candidate.end, entry.start)),
  );
  if (comment === undefined) return entry.start;
  // only a comment that starts its line
  const lineStart = text.lastIndexOf("\n", comment.start - 1) + 1;
  return /^[ \t]*$/.test(text.slice(lineStart, comment.start))
    ? comment.start
    : entry.start;
}

/** The indentation of the line that contains `offset`. */
function lineIndent(text: string, offset: number): string {
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  return /^[ \t]*/.exec(text.slice(lineStart, offset))![0];
}

function reindent(
  text: string,
  args: { from: string; to: string; indent: string; newline: string },
): string {
  const lines = text.split("\n");
  return lines
    .map((line, index) => {
      if (index === 0) return line;
      let level = 0;
      let rest = line;
      while (args.from !== "" && rest.startsWith(args.from)) {
        level++;
        rest = rest.slice(args.from.length);
      }
      return args.indent + args.to.repeat(level) + rest;
    })
    .join(args.newline);
}

export function applyEdits(text: string, edits: Edit[]): string {
  // insertions before a removal at the same offset; stable otherwise
  const sorted = edits
    .map((edit, index) => ({ edit, index }))
    .sort(
      (a, b) =>
        a.edit.start - b.edit.start ||
        a.edit.end - a.edit.start - (b.edit.end - b.edit.start) ||
        a.index - b.index,
    )
    .map(({ edit }) => edit);
  let result = "";
  let cursor = 0;
  for (const edit of sorted) {
    if (edit.start < cursor) {
      throw new Error("Overlapping edits");
    }
    result += text.slice(cursor, edit.start) + edit.text;
    cursor = edit.end;
  }
  return result + text.slice(cursor);
}
