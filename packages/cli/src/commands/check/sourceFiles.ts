import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import nodePath from "node:path";
import type { SourceFile } from "@inlang/sdk";

/**
 * Files that can reference messages. Formats the usage analyzer doesn't support
 * (CommonJS, Vue, Astro) are included on purpose: the analyzer reports them as
 * incomplete instead of the CLI silently hiding possible usages.
 */
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|svelte|vue|astro)$/i;
/** Build tool configs (`vite.config.ts`, `tailwind.config.cjs`) don't render messages. */
const CONFIG_FILE = /\.config\.[^./]+$/i;
/** Dependencies and build output. Dot directories (`.git`, `.svelte-kit`, `.next`) are skipped too. */
const EXCLUDED_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
]);

/** The analyzer's limits: a larger snapshot can't be analyzed, so it isn't read. */
export const SOURCE_LIMITS = { files: 10_000, bytes: 50_000_000 };

export type SourceSnapshot =
  | { status: "complete"; files: SourceFile[]; roots: string[] }
  | { status: "too-large"; roots: string[]; reason: string };

/**
 * Reads the application source files under `roots` into the full snapshot
 * `checkProject` expects. Respects `.gitignore` when the roots are in a git
 * repository, and skips dependencies, build output, dot directories, build
 * tool configs, `*.inlang` projects and Paraglide's generated output.
 *
 * Paths are relative to `cwd` so diagnostics point at files the user can open.
 */
export async function collectSourceFiles(args: {
  roots: string[];
  cwd: string;
}): Promise<SourceSnapshot> {
  const paths = new Set<string>();
  const outputDirectory = paraglideOutputDetector();
  for (const root of args.roots) {
    const absolute = nodePath.resolve(args.cwd, root);
    const stat = statSync(absolute, { throwIfNoEntry: false });
    if (!stat) throw new Error(`Source path "${root}" doesn't exist.`);
    // An explicitly passed file is always read.
    if (stat.isFile()) {
      paths.add(absolute);
      continue;
    }
    const relativePaths = gitFiles(absolute) ?? (await walk(absolute));
    for (const relative of relativePaths) {
      const segments = relative.split(/[\\/]/);
      const name = segments.at(-1)!;
      const directories = segments.slice(0, -1);
      if (
        !SOURCE_FILE.test(name) ||
        CONFIG_FILE.test(name) ||
        name.startsWith(".") ||
        directories.some(isExcludedDirectory)
      )
        continue;
      const file = nodePath.join(absolute, relative);
      if (outputDirectory(absolute, directories)) continue;
      paths.add(file);
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

function isExcludedDirectory(name: string): boolean {
  return (
    EXCLUDED_DIRECTORIES.has(name) ||
    name.startsWith(".") ||
    name.endsWith(".inlang")
  );
}

/** A path relative to `cwd` with forward slashes, `.` for `cwd` itself. */
export function displayPath(cwd: string, path: string): string {
  const relative = nodePath.relative(cwd, nodePath.resolve(cwd, path));
  return relative === "" ? "." : relative.split(nodePath.sep).join("/");
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

/** Every file under `directory`, relative to it, without descending into excluded directories. */
async function walk(directory: string): Promise<string[]> {
  const result: string[] = [];
  const pending = [""];
  while (pending.length) {
    const relative = pending.pop()!;
    const entries = await fs.readdir(nodePath.join(directory, relative), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const path = relative ? nodePath.join(relative, entry.name) : entry.name;
      if (entry.isDirectory()) {
        if (!isExcludedDirectory(entry.name)) pending.push(path);
      } else if (entry.isFile()) result.push(path);
    }
  }
  return result;
}

/**
 * Whether a file lies in Paraglide's compiled output (`outdir`), recognized by
 * its `runtime.js` and `messages.js`. The output re-exports every message, so
 * analyzing it would make usage analysis incomplete.
 */
function paraglideOutputDetector() {
  const cache = new Map<string, boolean>();
  const isOutput = (directory: string) => {
    let result = cache.get(directory);
    if (result === undefined) {
      const has = (name: string) =>
        existsSync(nodePath.join(directory, `${name}.js`)) ||
        existsSync(nodePath.join(directory, `${name}.ts`));
      result = has("runtime") && has("messages");
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
