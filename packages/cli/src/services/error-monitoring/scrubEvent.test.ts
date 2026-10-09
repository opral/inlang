import { expect, test } from "vitest";
import type { Event } from "@sentry/node";
import { redactPaths, scrubEvent } from "./scrubEvent.js";

const home = "/Users/jane-doe";
const cwd = "/Users/jane-doe/acme-secret/app";

test("redacts the cwd, the home directory and other absolute paths", () => {
  const args = { home, cwd };
  expect(
    redactPaths(
      `ENOENT: no such file or directory, open '${cwd}/project.inlang/settings.json'`,
      args,
    ),
  ).toBe(
    "ENOENT: no such file or directory, open './project.inlang/settings.json'",
  );
  expect(redactPaths(`at ${home}/other/x.ts`, args)).toBe("at ~/other/x.ts");
  expect(redactPaths("open '/srv/acme-secret/app/x.json'", args)).toBe(
    "open '<path>'",
  );
  expect(redactPaths("C:\\Users\\jane-doe\\app failed", args)).toBe(
    "<path> failed",
  );
  expect(redactPaths("file:///srv/acme-secret/x.js failed", args)).toBe(
    "<path> failed",
  );
  // URLs and relative paths stay
  expect(redactPaths("fetch https://inlang.com/a/b failed", args)).toBe(
    "fetch https://inlang.com/a/b failed",
  );
  expect(redactPaths("node:internal/fs/promises", args)).toBe(
    "node:internal/fs/promises",
  );
});

test("removes the hostname, breadcrumbs and paths from an error report", () => {
  const event: Event = {
    server_name: "janes-macbook",
    message: `failed in ${cwd}`,
    breadcrumbs: [{ message: "Couldn't open the inlang project" }],
    extra: { args: ["--project", cwd] },
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
              },
              { filename: `${cwd}/plugin.js`, vars: { secret: "x" } },
              { filename: "/srv/acme-secret/plugin.js" },
            ],
          },
        },
      ],
    },
  };
  const scrubbed = scrubEvent(event, { home, cwd });
  const payload = JSON.stringify(scrubbed);
  for (const secret of ["jane-doe", "acme-secret", "janes-macbook"])
    expect(payload).not.toContain(secret);
  expect(scrubbed.exception?.values?.[0]?.value).toBe(
    "Couldn't open the inlang project at ./project.inlang",
  );
  expect(
    scrubbed.exception?.values?.[0]?.stacktrace?.frames?.map(
      (frame) => frame.filename,
    ),
  ).toEqual(["node_modules/@inlang/cli/dist/main.js", "./plugin.js", "<path>"]);
  expect(scrubbed.breadcrumbs).toBeUndefined();
  expect(scrubbed.extra).toBeUndefined();
});
