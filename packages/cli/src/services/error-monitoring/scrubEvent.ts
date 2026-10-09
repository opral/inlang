import type { Event } from "@sentry/node";

/**
 * Removes what can identify the user from an error report: the machine's
 * hostname and local paths in error messages and stack frames (which contain
 * user names, company and project names).
 */
export function scrubEvent<T extends Event>(
  event: T,
  args: { home: string; cwd: string },
): T {
  delete event.server_name;
  delete event.user;
  // breadcrumbs carry console output: paths, message keys, locales
  delete event.breadcrumbs;
  const redact = (text: string | undefined) =>
    text === undefined ? undefined : redactPaths(text, args);
  if (event.message !== undefined) event.message = redact(event.message);
  if (event.logentry?.message !== undefined) {
    event.logentry.message = redact(event.logentry.message);
    delete event.logentry.params;
  }
  for (const exception of event.exception?.values ?? []) {
    exception.value = redact(exception.value);
    for (const frame of exception.stacktrace?.frames ?? []) {
      frame.filename = redactFramePath(frame.filename, args);
      frame.abs_path = redactFramePath(frame.abs_path, args);
      delete frame.vars;
    }
  }
  delete event.extra;
  return event;
}

/**
 * Replaces the current working directory with `.` and the home directory with
 * `~`, then any other absolute path with `<path>`.
 */
export function redactPaths(
  text: string,
  args: { home: string; cwd: string },
): string {
  let result = text;
  // longest first: the cwd is usually inside the home directory
  for (const [path, replacement] of [
    [args.cwd, "."],
    [args.home, "~"],
  ].sort((a, b) => b[0]!.length - a[0]!.length) as [string, string][]) {
    if (path.length > 1) result = result.split(path).join(replacement);
  }
  return (
    result
      // file URLs
      .replace(/file:\/\/[^\s'"`)]+/g, "<path>")
      // POSIX: `/a/b`, not part of a URL (`https://x/y`) or a relative path
      .replace(/(?<![\w.:/~<>-])\/[^\s'"`/:)]+(?:\/[^\s'"`/:)]*)+/g, "<path>")
      // Windows: `C:\a` or `\\server\share`
      .replace(/(?:\b[A-Za-z]:|\\\\[^\s\\'"`]+)\\[^\s'"`)]*/g, "<path>")
  );
}

/**
 * A stack frame's file, keeping what makes the stack trace useful: the
 * package's file inside `node_modules` (e.g. the CLI's own `dist/main.js`).
 */
function redactFramePath(
  path: string | undefined,
  args: { home: string; cwd: string },
): string | undefined {
  if (path === undefined) return undefined;
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/node_modules/");
  if (index !== -1) return normalized.slice(index + 1);
  return redactPaths(path, args);
}
