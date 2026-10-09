import { afterEach, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import nodePath from "node:path";
import { collectSourceFiles, SOURCE_LIMITS } from "./sourceFiles.js";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

function tree(files: Record<string, string>): string {
  const root = fs.mkdtempSync(nodePath.join(os.tmpdir(), "inlang-sources-"));
  directories.push(root);
  for (const [path, content] of Object.entries(files)) {
    fs.mkdirSync(nodePath.dirname(nodePath.join(root, path)), {
      recursive: true,
    });
    fs.writeFileSync(nodePath.join(root, path), content);
  }
  return root;
}

const app = {
  "src/App.tsx": "m.app()",
  "src/lib/util.ts": "m.util()",
  "src/routes/+page.svelte": "<p>{m.page()}</p>",
  "src/legacy.cjs": "module.exports = {}",
  "src/Widget.vue": "<template />",
  "src/styles.css": "body {}",
  "README.md": "# app",
  "vite.config.ts": "export default {}",
  "tailwind.config.cjs": "module.exports = {}",
  ".eslintrc.cjs": "module.exports = {}",
  "node_modules/pkg/index.js": "",
  "dist/main.js": "",
  "build/main.js": "",
  "packages/ui/node_modules/dep/index.js": "",
  ".svelte-kit/generated/root.js": "",
  "project.inlang/plugins/plugin.js": "",
  "src/paraglide/runtime.js": "",
  "src/paraglide/messages.js": "export * as m from './messages/_index.js'",
  "src/paraglide/messages/_index.js": "",
};
const expected = [
  "src/App.tsx",
  "src/Widget.vue",
  "src/legacy.cjs",
  "src/lib/util.ts",
  "src/routes/+page.svelte",
];

test("reads source files, skipping dependencies, build output, configs and Paraglide's output", async () => {
  const root = tree(app);
  const snapshot = await collectSourceFiles({ roots: ["."], cwd: root });
  expect(snapshot.status).toBe("complete");
  if (snapshot.status !== "complete") return;
  expect(snapshot.files.map((file) => file.path)).toEqual(expected);
  expect(snapshot.files[0]).toEqual({
    path: "src/App.tsx",
    content: "m.app()",
  });
  expect(snapshot.roots).toEqual(["."]);
});

test("respects .gitignore in a git repository, including untracked files", async () => {
  const root = tree({
    ...app,
    ".gitignore": "src/lib/\n",
    "src/generated.ts": "m.generated()",
  });
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "src/App.tsx"], { cwd: root });
  const snapshot = await collectSourceFiles({ roots: ["."], cwd: root });
  if (snapshot.status !== "complete") throw new Error(snapshot.status);
  expect(snapshot.files.map((file) => file.path)).toEqual(
    [...expected, "src/generated.ts"]
      .filter((path) => path !== "src/lib/util.ts")
      .sort(),
  );
});

test("paths are relative to the working directory, explicit files are always read", async () => {
  const root = tree(app);
  const snapshot = await collectSourceFiles({
    roots: ["src/lib", "src/styles.css"],
    cwd: root,
  });
  if (snapshot.status !== "complete") throw new Error(snapshot.status);
  expect(snapshot.files.map((file) => file.path)).toEqual([
    "src/lib/util.ts",
    "src/styles.css",
  ]);
  expect(snapshot.roots).toEqual(["src/lib", "src/styles.css"]);
});

test("a missing source path is an error", async () => {
  const root = tree(app);
  await expect(
    collectSourceFiles({ roots: ["missing"], cwd: root }),
  ).rejects.toThrow('Source path "missing" doesn\'t exist.');
});

test("doesn't read a snapshot larger than the analyzer supports", async () => {
  const root = tree(app);
  const { files } = SOURCE_LIMITS;
  SOURCE_LIMITS.files = 2;
  try {
    const snapshot = await collectSourceFiles({ roots: ["src"], cwd: root });
    expect(snapshot.status).toBe("too-large");
    expect(snapshot).not.toHaveProperty("files");
  } finally {
    SOURCE_LIMITS.files = files;
  }
});
