import { afterEach, beforeEach, expect, test, vi } from "vitest";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";

vi.mock("./capture.js", () => ({ capture: vi.fn(async () => {}) }));
vi.mock("../services/error-monitoring/implementation.js", () => ({
  initErrorMonitoring: vi.fn(),
  captureException: vi.fn(),
}));
// the commands exit the process once done
vi.mock("../utilities/exit.js", () => ({ exit: vi.fn(async () => {}) }));

const fixture = fileURLToPath(
  new URL("../../test/fixtures/check-app", import.meta.url),
);
const secretProject = "/Users/jane-doe/acme-secret/project.inlang";

/** Strings that must never reach telemetry. */
const secrets = [
  "jane-doe",
  "acme-secret",
  "project.inlang",
  fixture,
  "check-app",
  "src/**",
  "*.ts",
  "de,fr",
  "en-GB",
  "pt-BR",
];

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DO_NOT_TRACK", "");
  vi.stubEnv("INLANG_TELEMETRY", "");
  vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** Runs `inlang <args>` and returns what was passed to `capture`. */
async function run(args: string[]) {
  const { cli } = await import("../main.js");
  const { capture } = await import("./capture.js");
  vi.mocked(capture).mockClear();
  await cli.parseAsync(["node", "inlang", ...args]);
  return vi.mocked(capture).mock.calls.map(([call]) => call);
}

function expectNoSecrets(calls: unknown[]) {
  const payload = JSON.stringify(calls);
  for (const secret of secrets) expect(payload).not.toContain(secret);
}

test("check sends the command and flag names, not the paths, globs or locales", async () => {
  const calls = await run([
    "check",
    "--project",
    nodePath.join(fixture, "project.inlang"),
    "--source",
    nodePath.join(fixture, "src/**/*.ts"),
    "--locales",
    "de,fr",
    "--format=json",
    "--no-fail",
  ]);
  expect(calls).toEqual([
    {
      event: "CLI command executed",
      properties: {
        name: "check",
        flags: ["format", "locales", "no-fail", "project", "source"],
        node_version: process.versions.node,
        platform: process.platform,
        version: expect.any(String),
      },
    },
  ]);
  expectNoSecrets(calls);
});

test("a project that can't be opened doesn't leak its path", async () => {
  const calls = await run(["check", "--project", secretProject]);
  expect(calls).toEqual([
    {
      event: "CLI command executed",
      properties: expect.objectContaining({
        name: "check",
        flags: ["project"],
      }),
    },
  ]);
  expectNoSecrets(calls);
});

test("subcommands and deprecated commands send only flag names", async () => {
  for (const [args, name, flags] of [
    [
      [
        "machine",
        "translate",
        "--project",
        secretProject,
        "--locale",
        "en-GB",
        "--targetLocales",
        "de,fr",
        "pt-BR",
        "-q",
      ],
      "machine translate",
      ["locale", "project", "quiet", "targetLocales"],
    ],
    [
      ["lint", "--project", secretProject, "--languageTags", "de,fr"],
      "lint",
      ["languageTags", "project"],
    ],
    [["validate", `--project=${secretProject}`], "validate", ["project"]],
  ] as const) {
    const calls = await run([...args]);
    expect(calls).toEqual([
      {
        event: "CLI command executed",
        properties: expect.objectContaining({ name, flags }),
      },
    ]);
    expectNoSecrets(calls);
  }
});

test("cloud sends no path", async () => {
  const calls = await run([
    "cloud",
    "--project",
    secretProject,
    "--json",
    "--no-open",
  ]);
  expect(calls.map((call) => call.event)).toEqual([
    "CLI cloud viewed",
    "CLI command executed",
  ]);
  expect(calls[1]!.properties).toEqual(
    expect.objectContaining({
      name: "cloud",
      flags: ["json", "no-open", "project"],
    }),
  );
  expectNoSecrets(calls);
});

test("DO_NOT_TRACK=1 and INLANG_TELEMETRY=off send nothing", async () => {
  for (const [name, value] of [
    ["DO_NOT_TRACK", "1"],
    ["INLANG_TELEMETRY", "off"],
  ] as const) {
    vi.resetModules();
    vi.stubEnv(name, value);
    expect(await run(["check", "--project", secretProject])).toEqual([]);
    vi.stubEnv(name, "");
  }
});
