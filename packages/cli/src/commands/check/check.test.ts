/**
 * End-to-end tests of the built CLI (`check`, `cloud`, `--help` and the
 * deprecated commands). Builds the CLI and runs it against a Paraglide-style
 * fixture (`test/fixtures/check-app`) with the workspace's message-format and
 * m-function-matcher plugins as local modules, and against a next-intl app
 * (`test/fixtures/next-intl-app`) with the workspace's next-intl plugin.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import nodePath from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { buildOptions } from "../../../buildOptions.js";

const cliDirectory = fileURLToPath(new URL("../../../", import.meta.url));
const fixtures = nodePath.join(cliDirectory, "test/fixtures");
const outdir = nodePath.join(cliDirectory, "node_modules/.cache/check-e2e");
const require = createRequire(import.meta.url);
/** The built, bundled plugin (`dist/index.js`). */
const pluginDist = (name: string) => require.resolve(name);

const temporary: string[] = [];

beforeAll(async () => {
  await build({
    ...buildOptions({ outdir }),
    absWorkingDir: cliDirectory,
    logLevel: "silent",
  });
  fs.writeFileSync(
    nodePath.join(outdir, "run.js"),
    `import { cli } from "./main.js";\ncli.parse();\n`,
  );
}, 60_000);

afterAll(() => {
  for (const directory of temporary)
    fs.rmSync(directory, { recursive: true, force: true });
});

/** A copy of the fixture app with the workspace plugins, as the current directory of a run. */
function app(
  options: {
    fixture?: "check-app" | "next-intl-app";
    files?: Record<string, string | null>;
    settings?: (settings: Record<string, any>) => void;
  } = {},
): string {
  const root = fs.mkdtempSync(nodePath.join(os.tmpdir(), "inlang-check-"));
  temporary.push(root);
  const fixture = options.fixture ?? "check-app";
  fs.cpSync(nodePath.join(fixtures, fixture), root, { recursive: true });
  const plugins = nodePath.join(root, "project.inlang/plugins");
  fs.mkdirSync(plugins);
  for (const name of fixture === "check-app"
    ? ["plugin-message-format", "plugin-m-function-matcher"]
    : ["plugin-next-intl", "plugin-m-function-matcher"])
    fs.copyFileSync(
      pluginDist(`@inlang/${name}`),
      nodePath.join(plugins, `${name}.js`),
    );
  for (const [path, content] of Object.entries(options.files ?? {})) {
    const file = nodePath.join(root, path);
    if (content === null) fs.rmSync(file);
    else {
      fs.mkdirSync(nodePath.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
  }
  if (options.settings) {
    const path = nodePath.join(root, "project.inlang/settings.json");
    const settings = JSON.parse(fs.readFileSync(path, "utf8"));
    options.settings(settings);
    fs.writeFileSync(path, JSON.stringify(settings, undefined, 2));
  }
  return root;
}

/** The environment of a user's shell: consola only logs warnings in test environments. */
const cliEnv = Object.fromEntries(
  Object.entries({ ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" }).filter(
    ([name]) => !/^(VITEST|TEST$|NODE_ENV$)/.test(name),
  ),
);

function run(
  cwd: string,
  args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [nodePath.join(outdir, "run.js"), ...args],
      { cwd, env: cliEnv },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

const project = ["--project", "./project.inlang"];

describe("inlang check", { timeout: 60_000 }, () => {
  test("reports findings grouped by check and why unused messages can't be determined", async () => {
    const { code, stdout } = await run(app(), ["check", ...project]);
    expect(code).toBe(1);
    expect(stdout).toContain(
      "Checked project.inlang · 7 messages · locales en-US, pt-BR · 3 source files in ./",
    );
    expect(stdout).toContain(
      "missing-translation (1)\n  welcome_back  pt-BR  no translation\n",
    );
    expect(stdout).toContain(
      "missing-variable (2)\n  cart_items  pt-BR  missing {count} (countPlural=other)\n  greeting    pt-BR  missing {name}\n",
    );
    expect(stdout).toContain(
      "unused-message incomplete: unused messages can't be determined because:\n  src/Field.tsx:14:8  m[`${fieldName}_label`]  Dynamic message access cannot be resolved.",
    );
    expect(stdout).toContain(
      "3 findings\n  missing-translation  1\n  missing-variable     2\n",
    );
    // Paraglide's compiled output isn't analyzed, its re-exports would make analysis incomplete.
    expect(stdout).not.toContain("paraglide/messages.js");
  });

  test("reports unused messages once every usage is resolved", async () => {
    const { code, stdout } = await run(
      app({ files: { "src/Field.tsx": null } }),
      ["check", ...project, "--unused-messages"],
    );
    expect(code).toBe(1);
    // legacy_banner is used by the fixture's Astro component.
    expect(stdout).toContain(
      "unused-message (2)\n  email_label\n  password_label\n",
    );
    expect(stdout).not.toContain("missing-translation");
    expect(stdout).not.toContain("Unsupported source format");
    expect(stdout).toContain("2 findings\n  unused-message  2\n");
  });

  test("--source limits the analyzed files", async () => {
    const { stdout } = await run(app(), [
      "check",
      ...project,
      "--unused-messages",
      "--source",
      "src/Home.tsx",
    ]);
    expect(stdout).toContain("1 source file in src/Home.tsx");
    expect(stdout).toContain("unused-message (3)");
  });

  test("--format json prints only the report on stdout", async () => {
    const { code, stdout } = await run(
      app({ files: { "src/Field.tsx": null } }),
      ["check", ...project, "--format", "json"],
    );
    expect(code).toBe(1);
    const report = JSON.parse(stdout);
    expect(report).toMatchObject({
      version: 1,
      project: "project.inlang",
      locales: ["en-US", "pt-BR"],
      baseLocale: "en-US",
      messages: 7,
      source: { roots: ["./"], files: 2 },
      errors: [],
      summary: {
        findings: 5,
        errors: 0,
        byCheck: {
          "missing-translation": 1,
          "missing-variable": 2,
          "unused-message": 2,
        },
      },
    });
    expect(
      report.checks.map((check: { status: string }) => check.status),
    ).toEqual(Array(9).fill("complete"));
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        checkId: "missing-variable",
        bundleId: "cart_items",
        locale: "pt-BR",
        name: "count",
        matches: [
          { type: "literal-match", key: "countPlural", value: "other" },
        ],
      }),
    );
    // plugins regenerate message and variant IDs on every load
    expect(report.diagnostics).toContainEqual({
      checkId: "missing-variable",
      bundleId: "greeting",
      locale: "pt-BR",
      name: "name",
      message: 'Message "greeting" is missing {name} in "pt-BR".',
    });
    for (const diagnostic of report.diagnostics)
      for (const key of ["fixes", "severity", "messageId", "variantId"])
        expect(diagnostic).not.toHaveProperty(key);
  });

  test("JSON lists incomplete analysis with locations and code", async () => {
    const { stdout } = await run(app(), [
      "check",
      ...project,
      "--unused-messages",
      "--format",
      "json",
    ]);
    const report = JSON.parse(stdout);
    expect(report.checks).toEqual([
      {
        id: "unused-message",
        status: "incomplete",
        reason:
          "Some usages could not be analyzed. Unused diagnostics and fixes are withheld.",
        issues: [
          {
            path: "src/Field.tsx",
            reason: "Dynamic message access cannot be resolved.",
            start: { line: 14, column: 7 },
            end: { line: 14, column: 30 },
            code: "m[`${fieldName}_label`]",
          },
        ],
      },
    ]);
    expect(report.diagnostics).toEqual([]);
  });

  test("exits with 0 without findings and with --no-fail", async () => {
    const root = app();
    const clean = await run(root, ["check", ...project, "--missing-markup"]);
    expect(clean.code).toBe(0);
    expect(clean.stdout).toContain("✔ No findings.");
    const noFail = await run(root, ["check", ...project, "--no-fail"]);
    expect(noFail.code).toBe(0);
    expect(noFail.stdout).toContain("3 findings");
  });

  test("--locales filters findings and validates the locales", async () => {
    const root = app();
    const filtered = await run(root, [
      "check",
      ...project,
      "--locales",
      "en-US",
    ]);
    expect(filtered.code).toBe(0);
    expect(filtered.stdout).toContain("locale en-US");
    // a clean result says which checks couldn't complete
    expect(filtered.stdout).toContain(
      "No findings, but unused-message incomplete.",
    );
    // the hidden v1 alias, comma separated
    const alias = await run(root, [
      "check",
      ...project,
      "--languageTags",
      "en-US,pt-BR",
      "--missing-translations",
    ]);
    expect(alias.stdout).toContain("welcome_back  pt-BR  no translation");
    const unknown = await run(root, ["check", ...project, "--locales", "de"]);
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain(
      `Locale "de" is not in the project's settings. Possible locales are en-US, pt-BR.`,
    );
  });

  test("tells users of a matcher without usage analysis to update it", async () => {
    const legacy =
      "./project.inlang/plugins/plugin-m-function-matcher@2.2.6.js";
    const root = app({
      files: {
        [legacy]: `export default { key: "plugin.inlang.mFunctionMatcher", meta: { "app.inlang.ideExtension": { messageReferenceMatchers: [] } } };`,
      },
      settings: (settings) => {
        settings.modules = [settings.modules[0], legacy];
      },
    });
    const { stdout } = await run(root, [
      "check",
      ...project,
      "--unused-messages",
    ]);
    expect(stdout).toContain(
      "unused-message not checked: The installed @inlang/plugin-m-function-matcher can't analyze usages.\n  Unused-message check needs @inlang/plugin-m-function-matcher ≥ 2.3.0, update the module URL in settings.json: ./project.inlang/plugins/plugin-m-function-matcher@2.2.6.js",
    );
  });

  test("next-intl: reports unused messages once every usage is resolved", async () => {
    const { code, stdout } = await run(
      app({
        fixture: "next-intl-app",
        files: { "src/components/Status.tsx": null },
      }),
      ["check", ...project, "--unused-messages"],
    );
    expect(code).toBe(1);
    expect(stdout).toContain(
      "Checked project.inlang · 7 messages · locales en, de · 3 source files in ./",
    );
    expect(stdout).toContain(
      "unused-message (3)\n  Home.legacy\n  Status.closed\n  Status.open\n",
    );
    expect(stdout).not.toContain("Paraglide");
    expect(stdout).not.toContain("m-function-matcher");
  });

  test("next-intl: a dynamic key withholds unused messages and is located", async () => {
    const { code, stdout } = await run(app({ fixture: "next-intl-app" }), [
      "check",
      ...project,
      "--unused-messages",
    ]);
    expect(code).toBe(0);
    expect(stdout).toContain(
      "unused-message incomplete: unused messages can't be determined because:\n  src/components/Status.tsx:6:19  state  A dynamic message key can't be resolved statically.\n  Unused messages are only reported when every usage can be resolved, e.g. m.some_key() or t(\"some.key\").",
    );
    expect(stdout).not.toContain("Paraglide");
    expect(stdout).not.toContain("m-function-matcher");
  });

  test("next-intl: an older plugin without usage analysis is asked to be updated", async () => {
    const legacy = "./project.inlang/plugins/plugin-next-intl@2.3.0.js";
    const root = app({
      fixture: "next-intl-app",
      files: {
        [legacy]: `export default { key: "plugin.inlang.nextIntl", toBeImportedFiles: async () => [], importFiles: async () => ({ bundles: [], messages: [], variants: [] }) };`,
      },
      settings: (settings) => {
        settings.modules = [legacy];
      },
    });
    const { stdout } = await run(root, [
      "check",
      ...project,
      "--unused-messages",
    ]);
    expect(stdout).toContain(
      "unused-message not checked: The installed @inlang/plugin-next-intl can't analyze usages.\n  Unused-message check needs @inlang/plugin-next-intl ≥ 2.4.0, update the module URL in settings.json: ./project.inlang/plugins/plugin-next-intl@2.3.0.js",
    );
    expect(stdout).not.toContain("Paraglide");
  });

  test("next-intl: an older plugin next to the m-function matcher withholds unused messages", async () => {
    const legacy = "./project.inlang/plugins/plugin-next-intl@2.3.0.js";
    const root = app({
      fixture: "next-intl-app",
      files: {
        [legacy]: `export default { key: "plugin.inlang.nextIntl", toBeImportedFiles: async () => [], importFiles: async () => ({ bundles: [], messages: [], variants: [] }), addCustomApi: () => ({ "app.inlang.ideExtension": { messageReferenceMatchers: [async () => []] } }) };`,
      },
      settings: (settings) => {
        settings.modules = [
          legacy,
          "./project.inlang/plugins/plugin-m-function-matcher.js",
        ];
      },
    });
    const { stdout } = await run(root, [
      "check",
      ...project,
      "--unused-messages",
    ]);
    expect(stdout).toContain(
      "Matcher plugin.inlang.nextIntl does not support usage analysis.",
    );
    expect(stdout).toContain(
      "Unused-message check needs @inlang/plugin-next-intl ≥ 2.4.0, update the module URL in settings.json: ./project.inlang/plugins/plugin-next-intl@2.3.0.js",
    );
    expect(stdout).not.toContain("unused-message (");
  });

  test("a project that can't be opened is a short error", async () => {
    const { code, stderr } = await run(app(), [
      "check",
      "--project",
      "./missing.inlang",
    ]);
    expect(code).toBe(1);
    expect(stderr).toContain(
      "Couldn't open the inlang project at ./missing.inlang: ENOENT",
    );
    expect(stderr).not.toMatch(/^\s+at /m);
  });

  test("reports project errors", async () => {
    const root = app({
      settings: (settings) => {
        settings.modules.push("./project.inlang/plugins/missing.js");
      },
    });
    const { code, stdout } = await run(root, [
      "check",
      ...project,
      "--missing-markup",
    ]);
    expect(code).toBe(1);
    expect(stdout).toContain("Project errors (1)\n  PluginImportError:");
    expect(stdout).toContain("1 finding\n  project errors  1");
  });
});

describe("deprecated commands", { timeout: 60_000 }, () => {
  test("--help lists check and cloud but hides validate and lint", async () => {
    const { stdout } = await run(app(), ["--help"]);
    expect(stdout).toMatch(/^\s+check \[options\]/m);
    expect(stdout).toMatch(/^\s+cloud \[options\]/m);
    expect(stdout).toContain("Run `inlang cloud`.");
    expect(stdout).not.toMatch(/^\s+validate/m);
    expect(stdout).not.toMatch(/^\s+lint/m);
  });

  test("validate warns and still only checks the project setup", async () => {
    const { code, stderr, stdout } = await run(app(), ["validate", ...project]);
    expect(stderr).toContain("inlang validate is deprecated. Use inlang check");
    expect(stdout).toContain("The project is valid!");
    expect(code).toBe(0);
  });

  test("lint only points to check and runs nothing", async () => {
    const { code, stderr, stdout } = await run(app(), [
      "lint",
      ...project,
      "--languageTags",
      "pt-BR",
      "--no-fail",
    ]);
    expect(stderr).toContain(
      "inlang lint is deprecated and does nothing. Use inlang check",
    );
    expect(stdout).not.toContain("welcome_back");
    expect(code).toBe(0);
  });
});

describe("inlang cloud", { timeout: 60_000 }, () => {
  test("prints the features and the form without opening a browser when piped", async () => {
    const { code, stdout } = await run(app(), ["cloud"]);
    expect(code).toBe(0);
    expect(stdout).toContain("inlang Cloud · coming soon");
    expect(stdout).toContain("AI translation");
    // the fixture uses the m-function matcher, so Paraglide JS is pre-selected
    expect(stdout).toContain("entry.14901479=Paraglide+JS");
    expect(stdout).not.toContain("Opened");
  });
});
