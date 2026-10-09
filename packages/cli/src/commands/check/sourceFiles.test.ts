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
  // app code in directories named like build output
  "src/routes/build/+page.ts": "m.build_page()",
  "src/dist/format.ts": "m.format()",
  // an app config is app code, a build tool config isn't
  "src/nav.config.ts": "export default [{ label: m.nav() }]",
  "src/About.svx": "{m.about()}",
  // a user's own runtime and messages modules aren't Paraglide's output
  "src/chat/runtime.ts": "",
  "src/chat/messages.ts": "",
  "src/chat/Chat.ts": "m.chat()",
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
  "coverage/lcov-report/prettify.js": "",
  "packages/ui/node_modules/dep/index.js": "",
  ".svelte-kit/generated/root.js": "",
  "project.inlang/plugins/plugin.js": "",
  "src/paraglide/runtime.js": "",
  "src/paraglide/messages.js": "export * as m from './messages/_index.js'",
  "src/paraglide/messages/_index.js": "",
};
const expected = [
  "src/About.svx",
  "src/App.tsx",
  "src/Widget.vue",
  "src/chat/Chat.ts",
  "src/chat/messages.ts",
  "src/chat/runtime.ts",
  "src/dist/format.ts",
  "src/legacy.cjs",
  "src/lib/util.ts",
  "src/nav.config.ts",
  "src/routes/+page.svelte",
  "src/routes/build/+page.ts",
];

test("reads source files, skipping dependencies, build output, tool configs and Paraglide's output", async () => {
  const root = tree(app);
  const snapshot = await collectSourceFiles({ roots: ["."], cwd: root });
  expect(snapshot.status).toBe("complete");
  if (snapshot.status !== "complete") return;
  expect(snapshot.files.map((file) => file.path)).toEqual(expected);
  expect(snapshot.files[1]).toEqual({
    path: "src/App.tsx",
    content: "m.app()",
  });
  expect(snapshot.roots).toEqual(["./"]);
});

test("in a git repository, .gitignore decides, including for untracked files", async () => {
  const root = tree({
    ...app,
    ".gitignore": "/dist\n/build\n/coverage\n/.svelte-kit\nsrc/lib/\n",
    "src/generated.ts": "m.generated()",
    ".storybook/preview.ts": "m.preview()",
  });
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "src/App.tsx"], { cwd: root });
  const snapshot = await collectSourceFiles({ roots: ["."], cwd: root });
  if (snapshot.status !== "complete") throw new Error(snapshot.status);
  expect(snapshot.files.map((file) => file.path)).toEqual(
    [...expected, "src/generated.ts", ".storybook/preview.ts"]
      .filter((path) => path !== "src/lib/util.ts")
      .sort(),
  );
});

test.each([false, true])(
  "follows symlinked directories (git: %s)",
  async (git) => {
    const shared = tree({ "Shared.ts": "m.shared()" });
    const root = tree({ "src/App.tsx": "m.app()" });
    fs.symlinkSync(shared, nodePath.join(root, "src/shared"), "dir");
    // a cycle is only read once
    fs.symlinkSync(root, nodePath.join(root, "src/loop"), "dir");
    if (git) execFileSync("git", ["init", "-q"], { cwd: root });
    const snapshot = await collectSourceFiles({ roots: ["."], cwd: root });
    if (snapshot.status !== "complete") throw new Error(snapshot.status);
    const paths = snapshot.files.map((file) => file.path);
    expect(paths).toContain("src/App.tsx");
    expect(paths).toContain("src/shared/Shared.ts");
  },
);

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
