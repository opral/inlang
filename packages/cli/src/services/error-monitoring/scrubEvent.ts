import type { Event } from "@sentry/node";

/**
 * Removes what can identify the user from an error report: the machine's
 * hostname and fingerprint (boot time, memory, CPU, locale, timezone), console
 * output, and local paths and plugin source code in error messages and stack
 * frames (which contain user names, company and project names).
 */
export function scrubEvent<T extends Event>(
  event: T,
  args: { home: string; cwd: string },
): T {
  delete event.server_name;
  delete event.user;
  // breadcrumbs carry console output: paths, message keys, locales
  delete event.breadcrumbs;
  delete event.extra;
  // keep the runtime and OS, drop what fingerprints the machine
  const { runtime, os } = event.contexts ?? {};
  event.contexts = {
    ...(runtime ? { runtime } : {}),
    ...(os ? { os: { name: os.name, version: os.version } } : {}),
  };
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
      const inDependency = isInNodeModules(frame.filename ?? frame.abs_path);
      frame.filename = redactFramePath(frame.filename, args);
      frame.abs_path = redactFramePath(frame.abs_path, args);
      // derived from the file name: contains basenames or plugin source code
      delete frame.module;
      delete frame.vars;
      // the user's own code, e.g. a local plugin
      if (!inDependency) {
        delete frame.pre_context;
        delete frame.context_line;
        delete frame.post_context;
      }
    }
  }
  return event;
}

/** Characters that end a path in free text. */
const PATH_END = `\\s'"\`)\\]},;`;

/**
 * Replaces the current working directory with `.` and any other absolute
 * path (including the home directory) with `<path>`.
 */
export function redactPaths(
  text: string,
  args: { home: string; cwd: string },
): string {
  let result = text;
  // paths relative to the cwd are the project's, e.g. `./project.inlang`
  if (args.cwd.length > 1 && args.cwd !== args.home)
    result = result.replace(directoryPattern(args.cwd), ".");
  if (args.home.length > 1)
    result = result.replace(
      new RegExp(`${directoryPattern(args.home).source}[^${PATH_END}]*`, "g"),
      "<path>",
    );
  return (
    result
      // URLs of local files and modules, e.g. `file:///a` or `data:...`
      .replace(/\b(?:file|data|blob):[^\s'"`]+/g, "<path>")
      // quoted absolute paths, which can contain spaces (Node's fs errors)
      .replace(/(['"`])(?:[A-Za-z]:)?[\\/](?!\1).*?\1/g, "$1<path>$1")
      // Windows: `C:\a`, `C:/a` or `\\server\share`
      .replace(
        new RegExp(
          `(?:\\b[A-Za-z]:|\\\\\\\\[^\\s\\\\'"\`]+)[\\\\/][^${PATH_END}]*`,
          "g",
        ),
        "<path>",
      )
      // POSIX: `/a/b`, not part of a URL (`https://x/y`) or a relative path
      .replace(
        new RegExp(
          `(?<![\\w.~<>/-])\\/[^${PATH_END}/:]+(?:\\/[^${PATH_END}]*)?`,
          "g",
        ),
        "<path>",
      )
  );
}

/** Matches `directory` when it's a whole directory, not a prefix of a name. */
function directoryPattern(directory: string): RegExp {
  const escaped = directory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}(?=[\\\\/${PATH_END}:]|$)`, "g");
}

function isInNodeModules(path: string | undefined): boolean {
  return (
    path !== undefined &&
    !/^(?:data|blob):/.test(path) &&
    path.replace(/\\/g, "/").includes("/node_modules/")
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
  // plugins are imported from data URLs that contain their source code
  if (/^(?:data|blob):/.test(path)) return "<data-url>";
  if (isInNodeModules(path)) {
    const normalized = path.replace(/\\/g, "/");
    return normalized.slice(normalized.lastIndexOf("/node_modules/") + 1);
  }
  return redactPaths(path, args);
}
