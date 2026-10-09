import { expect, test } from "vitest";
import type { Event } from "@sentry/node";
import { redactPaths, scrubEvent } from "./scrubEvent.js";

const home = "/Users/jane-doe";
const cwd = "/Users/jane-doe/acme-secret/app";
const args = { home, cwd };

test.each([
  [
    `ENOENT: no such file or directory, open '${cwd}/project.inlang/settings.json'`,
    "ENOENT: no such file or directory, open './project.inlang/settings.json'",
  ],
  [`at ${home}/clients/acme/x.ts`, "at <path>"],
  [`at ${cwd}2/x.ts`, "at <path>"],
  [`[${cwd}]`, "[.]"],
  ["open '/srv/acme-secret/app/x.json'", "open '<path>'"],
  ["open '/Volumes/Jane Doe/acme secret/x.json'", "open '<path>'"],
  ["in /srv/acme, then", "in <path>, then"],
  ["PATH=/usr/bin:/Users/jane/bin", "PATH=<path>"],
  ["C:\\Users\\jane-doe\\app failed", "<path> failed"],
  ["C:/Users/someone/acme/app failed", "<path> failed"],
  ["\\\\server\\acme\\x failed", "<path> failed"],
  ["file:///srv/acme-secret/x.js failed", "<path> failed"],
  ["data:application/javascript,export%20default%20x failed", "<path> failed"],
  // URLs, relative paths and Node's internal modules stay
  [
    "fetch https://inlang.com/a/b failed",
    "fetch https://inlang.com/a/b failed",
  ],
  ["node:internal/fs/promises", "node:internal/fs/promises"],
  ["./src/app.ts and/or 1/2", "./src/app.ts and/or 1/2"],
  ["Couldn't parse it", "Couldn't parse it"],
])("redactPaths(%j)", (input, expected) => {
  expect(redactPaths(input, args)).toBe(expected);
});

test("removes the hostname, fingerprint, breadcrumbs, paths and plugin source from an error report", () => {
  const event: Event = {
    server_name: "janes-macbook",
    message: `failed in ${cwd}`,
    breadcrumbs: [{ message: "Couldn't open the inlang project" }],
    extra: { args: ["--project", cwd] },
    contexts: {
      runtime: { name: "node", version: "v22.0.0" },
      os: { name: "macOS", version: "15.0", build: "24A335" },
      device: { boot_time: "2026-09-15T15:30:27.167Z", memory_size: 1 },
      culture: { locale: "en-US", timezone: "Europe/Berlin" },
      app: { app_start_time: "2026-10-09T12:00:00.000Z" },
    },
    exception: {
      values: [
        {
          type: "Error",
          value: `Couldn't open the inlang project at ${cwd}/project.inlang`,
          stacktrace: {
            frames: [
              {
                filename: `${home}/.npm/_npx/1/node_modules/@inlang/cli/dist/main.js`,
                abs_path: `${home}/.npm/_npx/1/node_modules/@inlang/cli/dist/main.js`,
                module: "@inlang.cli.dist:main",
                context_line: "throw error;",
              },
              {
                filename: `${cwd}/plugin.js`,
                module: "plugin",
                vars: { secret: "x" },
                context_line: "const apiKey = 'acme-secret';",
              },
              { filename: "/srv/acme-secret/plugin.js" },
              {
                filename:
                  "data:application/javascript,export%20default%20%22acme-secret%2Fnode_modules%2F%22",
                module: "javascript,export%20default%20%22acme-secret",
              },
            ],
          },
        },
      ],
    },
  };
  const scrubbed = scrubEvent(event, args);
  const payload = JSON.stringify(scrubbed);
  for (const secret of [
    "jane-doe",
    "acme-secret",
    "janes-macbook",
    "boot_time",
    "Europe/Berlin",
    "24A335",
  ])
    expect(payload).not.toContain(secret);
  expect(scrubbed.contexts).toEqual({
    runtime: { name: "node", version: "v22.0.0" },
    os: { name: "macOS", version: "15.0" },
  });
  expect(scrubbed.exception?.values?.[0]?.value).toBe(
    "Couldn't open the inlang project at ./project.inlang",
  );
  const frames = scrubbed.exception?.values?.[0]?.stacktrace?.frames ?? [];
  expect(frames.map((frame) => frame.filename)).toEqual([
    "node_modules/@inlang/cli/dist/main.js",
    "./plugin.js",
    "<path>",
    "<data-url>",
  ]);
  expect(frames.map((frame) => frame.module)).toEqual([
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
  // source lines of dependencies stay, the user's own code is removed
  expect(frames.map((frame) => frame.context_line)).toEqual([
    "throw error;",
    undefined,
    undefined,
    undefined,
  ]);
  expect(scrubbed.breadcrumbs).toBeUndefined();
  expect(scrubbed.extra).toBeUndefined();
});
