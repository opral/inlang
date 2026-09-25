import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cliDirectory = fileURLToPath(new URL("../", import.meta.url));
const sdkDirectory = fileURLToPath(new URL("../../sdk/", import.meta.url));
const tempDirectory = mkdtempSync(join(tmpdir(), "inlang-cli-wasm-"));

function pack(directory, name) {
  const { version } = JSON.parse(
    readFileSync(join(directory, "package.json"), "utf8"),
  );
  execFileSync("pnpm", ["pack", "--pack-destination", tempDirectory], {
    cwd: directory,
  });
  return join(tempDirectory, `${name}-${version}.tgz`);
}

try {
  const sdkTarball = pack(sdkDirectory, "inlang-sdk");
  const cliTarball = pack(cliDirectory, "inlang-cli");
  const consumerDirectory = join(tempDirectory, "consumer");
  const projectDirectory = join(consumerDirectory, "project.inlang");
  mkdirSync(projectDirectory, { recursive: true });
  writeFileSync(
    join(projectDirectory, "settings.json"),
    JSON.stringify({ baseLocale: "en", locales: ["en"], modules: [] }),
  );

  execFileSync(
    "npm",
    [
      "install",
      "--no-audit",
      "--no-fund",
      "--omit=optional",
      sdkTarball,
      cliTarball,
    ],
    {
      cwd: consumerDirectory,
      stdio: "inherit",
    },
  );

  const nativePackage = join(
    consumerDirectory,
    "node_modules",
    "@lix-js",
    `sdk-${process.platform}-${process.arch}`,
  );
  assert.equal(
    existsSync(nativePackage),
    false,
    "native Lix addon must be absent for this test",
  );

  const output = execFileSync(
    process.execPath,
    [
      "./node_modules/@inlang/cli/bin/run.js",
      "validate",
      "--project",
      "./project.inlang",
    ],
    { cwd: consumerDirectory, encoding: "utf8", timeout: 120_000 },
  );
  assert.match(output, /The project is valid!/);
  process.stdout.write(output);
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}
