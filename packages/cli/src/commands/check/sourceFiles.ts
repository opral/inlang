import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import nodePath from "node:path";
import type { SourceFile } from "@inlang/sdk";

/**
 * Files that can reference messages. Formats the usage analyzer doesn't support
 * (CommonJS, Vue, Astro, mdsvex, MDX, Marko) are included on purpose: the
 * analyzer reports them as incomplete instead of the CLI silently hiding
 * possible usages.
 */
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|svelte|svx|mdx|vue|astro|marko)$/i;
/**
 * Build tool configs often are CommonJS, which would make every project's
 * analysis incomplete, and they don't render messages. Only known tools: an
 * app's own `nav.config.ts` can use messages.
 */
const TOOL_CONFIG =
  /^(?:vite|vitest|svelte|tailwind|postcss|eslint|prettier|stylelint|next|nuxt|astro|remix|react-router|playwright|jest|cypress|babel|webpack|rollup|rolldown|rspack|tsup|esbuild|turbo|commitlint|lint-staged|uno|windi|quasar|metro|karma|vue|electron\.vite|wxt)\.config\.[cm]?[jt]s$/i;
/** Never analyzed: dependencies and inlang projects. */
const ALWAYS_EXCLUDED = (name: string) =>
  name === "node_modules" || name === ".git" || name.endsWith(".inlang");
/**
 * Build output, only skipped outside git (where `.gitignore` decides) and only
 * at the top of a root: `src/routes/build/` can be app code.
 */
const BUILD_OUTPUT = new Set(["dist", "build", "coverage"]);

/** The analyzer's limits: a larger snapshot can't be analyzed, so it isn't read. */
export const SOURCE_LIMITS = { files: 10_000, bytes: 50_000_000 };

export type SourceSnapshot =
  | { status: "complete"; files: SourceFile[]; roots: string[] }
  | { status: "too-large"; roots: string[]; reason: string };

/**
 * Reads the application source files under `roots` into the full snapshot
 * `checkProject` expects.
 *
 * In a git repository, the files git doesn't ignore are read (tracked and
 * untracked). Outside of one, every file is read except dot directories and
 * `dist`, `build` and `coverage` at the top of a root. Both skip
 * `node_modules`, `*.inlang` projects, Paraglide's compiled output, dotfiles
 * and known build tool configs. Symlinked directories and submodules are
 * followed. Explicitly passed files are always read.
 *
 * Paths are relative to `cwd` so diagnostics point at files the user can open.
 */
export async function collectSourceFiles(args: {
  roots: string[];
  cwd: string;
}): Promise<SourceSnapshot> {
  const paths = new Set<string>();
  const isOutput = paraglideOutputDetector();
  for (const root of args.roots) {
    const absolute = nodePath.resolve(args.cwd, root);
    const stat = statSync(absolute, { throwIfNoEntry: false });
    if (!stat) throw new Error(`Source path "${root}" doesn't exist.`);
    if (stat.isFile()) {
      paths.add(absolute);
      continue;
    }
    const listed = gitFiles(absolute);
    const candidates: string[] = [];
    if (listed === undefined) candidates.push(...(await walk(absolute, true)));
    else
      for (const relative of listed) {
        const file = nodePath.join(absolute, relative);
        // A symlinked directory or a submodule: git lists it as one entry.
        if (statSync(file, { throwIfNoEntry: false })?.isDirectory())
          candidates.push(
            ...(await walk(file, false)).map((path) =>
              nodePath.join(relative, path),
            ),
          );
        else candidates.push(relative);
      }
    for (const relative of candidates) {
      const segments = relative.split(/[\\/]/);
      const name = segments.at(-1)!;
      const directories = segments.slice(0, -1);
      if (
        !SOURCE_FILE.test(name) ||
        TOOL_CONFIG.test(name) ||
        name.startsWith(".") ||
        directories.some(ALWAYS_EXCLUDED) ||
        isOutput(absolute, directories)
      )
        continue;
      paths.add(nodePath.join(absolute, relative));
    }
  }
  const roots = args.roots.map((root) => displayPath(args.cwd, root));
  const files: { path: string; size: number }[] = [];
  let bytes = 0;
  for (const path of [...paths].sort()) {
    const stat = statSync(path, { throwIfNoEntry: false });
    // `git ls-files` lists tracked files that were deleted since.
    if (!stat?.isFile()) continue;
    files.push({ path, size: stat.size });
    bytes += stat.size;
    if (files.length > SOURCE_LIMITS.files || bytes > SOURCE_LIMITS.bytes)
      return {
        status: "too-large",
        roots,
        reason: `The source in ${roots.join(", ")} has more than ${SOURCE_LIMITS.files.toLocaleString("en-US")} files or ${SOURCE_LIMITS.bytes / 1_000_000} MB, more than usage analysis supports. Pass the directories that use messages with --source.`,
      };
  }
  const contents = await mapConcurrently(files, 32, (file) =>
    fs.readFile(file.path, "utf8"),
  );
  return {
    status: "complete",
    roots,
    files: files.map((file, index) => ({
      path: displayPath(args.cwd, file.path),
      content: contents[index]!,
    })),
  };
}

/** A path relative to `cwd` with forward slashes, `./` for `cwd` itself. */
export function displayPath(cwd: string, path: string): string {
  const relative = nodePath.relative(cwd, nodePath.resolve(cwd, path));
  return relative === "" ? "./" : relative.split(nodePath.sep).join("/");
}

/**
 * Tracked and untracked files that aren't ignored, relative to `directory`, or
 * `undefined` outside a git repository (or without git).
 */
function gitFiles(directory: string): string[] | undefined {
  try {
    const output = execFileSync(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      {
        cwd: directory,
        encoding: "utf8",
        maxBuffer: 512 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    return [...new Set(output.split("\0").filter(Boolean))];
  } catch {
    return undefined;
  }
}

/**
 * Every file under `directory`, relative to it. Follows symlinks (once per
 * real directory) and skips `node_modules`, dot directories and, if
 * `skipBuildOutput`, `dist`, `build` and `coverage` at the top.
 */
async function walk(
  directory: string,
  skipBuildOutput: boolean,
): Promise<string[]> {
  const result: string[] = [];
  const visited = new Set<string>();
  const pending = [""];
  while (pending.length) {
    const relative = pending.pop()!;
    const current = nodePath.join(directory, relative);
    const real = await fs.realpath(current).catch(() => undefined);
    if (real === undefined || visited.has(real)) continue;
    visited.add(real);
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const path = relative ? nodePath.join(relative, entry.name) : entry.name;
      const type = entry.isSymbolicLink()
        ? statSync(nodePath.join(directory, path), { throwIfNoEntry: false })
        : entry;
      if (type?.isDirectory()) {
        if (
          !ALWAYS_EXCLUDED(entry.name) &&
          !entry.name.startsWith(".") &&
          !(skipBuildOutput && !relative && BUILD_OUTPUT.has(entry.name))
        )
          pending.push(path);
      } else if (type?.isFile()) result.push(path);
    }
  }
  return result;
}

/**
 * Whether a file lies in Paraglide's compiled output (`outdir`), recognized by
 * its `runtime.js`, `messages.js` and `messages/` directory. The output
 * re-exports every message, so analyzing it would make usage analysis
 * incomplete.
 */
function paraglideOutputDetector() {
  const cache = new Map<string, boolean>();
  const isOutput = (directory: string) => {
    let result = cache.get(directory);
    if (result === undefined) {
      const has = (name: string) => existsSync(nodePath.join(directory, name));
      result =
        has("runtime.js") &&
        has("messages.js") &&
        statSync(nodePath.join(directory, "messages"), {
          throwIfNoEntry: false,
        })?.isDirectory() === true;
      cache.set(directory, result);
    }
    return result;
  };
  return (root: string, directories: string[]) => {
    let directory = root;
    if (isOutput(directory)) return true;
    for (const name of directories) {
      directory = nodePath.join(directory, name);
      if (isOutput(directory)) return true;
    }
    return false;
  };
}

async function mapConcurrently<T, R>(
  items: readonly T[],
  limit: number,
  map: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await map(items[index]!);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}
