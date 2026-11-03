/** Native translator guidance attached to exactly one entry, never a group heading. */
type Range = { start: number; end: number };
type Entry = Range & { key: string };
export function attachedDescription(
  text: string,
  entry: Entry,
  entries: Entry[],
  comments: Range[],
) {
  const comment = comments.find(
    (candidate) =>
      candidate.end <= entry.start &&
      /^[ \t]*(\r?\n)?[ \t]*$/.test(text.slice(candidate.end, entry.start)),
  );
  if (!comment) return undefined;
  const lineStart = text.lastIndexOf("\n", comment.start - 1) + 1;
  if (!/^\uFEFF?[ \t]*$/.test(text.slice(lineStart, comment.start)))
    return undefined;
  const after = text.slice(entry.end);
  const next = after.match(/^[ \t]*(?:\r?\n)?[ \t]*/)?.[0].length ?? 0;
  const offset = entry.end + next;
  if (entries.some((candidate) => candidate.start === offset)) return undefined;
  return comment;
}
export function readDescription(
  text: string,
  comment: Range | undefined,
  open: string,
  close: string,
): string | null {
  if (!comment) return null;
  return text
    .slice(comment.start + open.length, comment.end - close.length)
    .trim()
    .replace(/\r\n/g, "\n");
}
export function writeDescriptions(
  text: string,
  entries: Entry[],
  comments: Range[],
  descriptions: ReadonlyMap<string, string | null>,
  open: string,
  close: string,
): string {
  const edits: Array<Range & { text: string }> = [];
  for (const entry of entries) {
    if (!descriptions.has(entry.key)) continue;
    const description = descriptions.get(entry.key)!;
    const comment = attachedDescription(text, entry, entries, comments);
    // Separate a newly attached note from a following adjacent entry, so it
    // cannot be mistaken for a group heading on the next import.
    if (description !== null) {
      const gap =
        text.slice(entry.end).match(/^[ \t]*(?:\r?\n)?[ \t]*/)?.[0] ?? "";
      if (
        entries.some((candidate) => candidate.start === entry.end + gap.length)
      )
        edits.push({
          start: entry.end,
          end: entry.end,
          text: text.includes("\r\n") ? "\r\n" : "\n",
        });
    }
    if (readDescription(text, comment, open, close) === description) continue;
    if (
      description !== null &&
      (description.includes(close) ||
        (open === "<!--" && description.includes("--")))
    )
      throw new Error(
        `Description for "${entry.key}" cannot be represented as a native comment`,
      );
    const serialized =
      description === null ? "" : `${open} ${description} ${close}`;
    if (comment)
      edits.push({
        start: comment.start,
        end: description === null ? entry.start : comment.end,
        text: serialized,
      });
    else if (description !== null) {
      const lineStart = text.lastIndexOf("\n", entry.start - 1) + 1;
      const indent =
        text.slice(lineStart, entry.start).match(/^[ \t]*/)?.[0] ?? "";
      const newline = text.includes("\r\n") ? "\r\n" : "\n";
      edits.push({
        start: entry.start,
        end: entry.start,
        text: serialized + newline + indent,
      });
    }
  }
  for (const edit of edits.sort((a, b) => b.start - a.start))
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  return text;
}
