import { afterEach, expect, test, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import nodePath from "node:path";
import {
  CLOUD_FEATURES,
  cloudCommandAction,
  cloudFormUrl,
  usesParaglide,
} from "./index.js";

const FORM =
  "https://docs.google.com/forms/d/e/1FAIpQLSdwui1r1rFu1AXMPKa-g2ggDHOTvNFrmrxWDubaaYLHv8_4Mg/viewform";
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

function directory(files: Record<string, string> = {}): string {
  const root = fs.mkdtempSync(nodePath.join(os.tmpdir(), "inlang-cloud-"));
  directories.push(root);
  for (const [path, content] of Object.entries(files)) {
    fs.mkdirSync(nodePath.dirname(nodePath.join(root, path)), {
      recursive: true,
    });
    fs.writeFileSync(nodePath.join(root, path), content);
  }
  return root;
}

function run(
  options: Parameters<typeof cloudCommandAction>[0],
  env: { cwd: string; interactive?: boolean; opens?: boolean },
) {
  let output = "";
  const open = vi.fn(async () => env.opens ?? true);
  const capture = vi.fn(async () => {});
  const done = cloudCommandAction(options, {
    cwd: env.cwd,
    interactive: env.interactive ?? true,
    color: false,
    write: (text) => (output += text),
    open,
    capture,
  });
  return done.then(() => ({ output, open, capture }));
}

test("pre-selects Paraglide JS for Paraglide projects, nothing otherwise", () => {
  expect(cloudFormUrl(undefined)).toBe(FORM);
  expect(cloudFormUrl("Paraglide JS")).toBe(
    `${FORM}?usp=pp_url&entry.14901479=Paraglide+JS`,
  );
  expect(usesParaglide({ cwd: directory() })).toBe(false);
  expect(
    usesParaglide({
      cwd: directory({
        "package.json": JSON.stringify({
          devDependencies: { "@inlang/paraglide-js": "^2.0.0" },
        }),
      }),
    }),
  ).toBe(true);
  expect(
    usesParaglide({
      cwd: directory({
        "app/project.inlang/settings.json": JSON.stringify({
          modules: [
            "https://cdn.jsdelivr.net/npm/@inlang/plugin-m-function-matcher@2/dist/index.js",
          ],
        }),
      }),
      project: "app/project.inlang",
    }),
  ).toBe(true);
  expect(
    usesParaglide({ cwd: directory({ "package.json": "not json" }) }),
  ).toBe(false);
});

test("lists the features, prints the form and opens it at a terminal", async () => {
  const { output, open, capture } = await run(
    { open: true },
    {
      cwd: directory(),
    },
  );
  for (const group of CLOUD_FEATURES) {
    expect(output).toContain(group.title);
    for (const feature of group.features) {
      expect(output).toContain(
        `  • ${feature.name}\n    ${feature.description}`,
      );
    }
  }
  expect(output).toContain("Smart message keys");
  expect(output).toContain(`  ${FORM}\n`);
  expect(output).toContain("Opened the form in your browser.");
  expect(output).not.toMatch(/\$|€|price/i);
  expect(open).toHaveBeenCalledWith(FORM);
  expect(capture).toHaveBeenCalledWith({
    event: "CLI cloud interest",
    properties: { opened_form: true, product: "unknown" },
  });
});

test("doesn't open the browser with --no-open, in CI or when piped", async () => {
  for (const [options, interactive] of [
    [{ open: false }, true],
    [{ open: true }, false],
  ] as const) {
    const { output, open, capture } = await run(options, {
      cwd: directory(),
      interactive,
    });
    expect(open).not.toHaveBeenCalled();
    expect(output).toContain(FORM);
    expect(output).not.toContain("Opened");
    expect(capture).toHaveBeenCalledWith({
      event: "CLI cloud interest",
      properties: { opened_form: false, product: "unknown" },
    });
  }
});

test("prints the URL without claiming success when the browser can't open", async () => {
  const { output } = await run(
    { open: true },
    {
      cwd: directory(),
      opens: false,
    },
  );
  expect(output).toContain(FORM);
  expect(output).not.toContain("Opened");
});

test("--json prints the features and the form's URL", async () => {
  const cwd = directory({
    "package.json": JSON.stringify({
      dependencies: { "@inlang/paraglide-js": "2.0.0" },
    }),
  });
  const { output, open } = await run({ open: true, json: true }, { cwd });
  expect(JSON.parse(output)).toEqual({
    features: CLOUD_FEATURES,
    formUrl: `${FORM}?usp=pp_url&entry.14901479=Paraglide+JS`,
  });
  expect(open).not.toHaveBeenCalled();
});
