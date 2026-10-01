import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

// Test actual publish artifacts in a consumer with no workspace links.
const root = fileURLToPath(new URL("../", import.meta.url));
const pluginsRoot = join(root, "packages/plugins");
const plugins = readdirSync(pluginsRoot)
  .filter((name) => name !== "README.md")
  .map((name) => join(pluginsRoot, name))
  .filter((path) => {
    try {
      return JSON.parse(
        readFileSync(join(path, "package.json"), "utf8"),
      ).name.startsWith("@inlang/plugin-");
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
      throw error;
    }
  });
const require = createRequire(
  join(pluginsRoot, "inlang-message-format/package.json"),
);
const tsc = require.resolve("typescript/bin/tsc");
const ts = require("typescript");
const temporary = mkdtempSync(join(tmpdir(), "inlang-plugin-packages-"));

try {
  const tarballs = [];
  for (const path of [join(root, "packages/sdk"), ...plugins]) {
    const result = JSON.parse(
      execFileSync(
        "pnpm",
        ["pack", "--json", "--pack-destination", temporary],
        {
          cwd: path,
          encoding: "utf8",
        },
      ),
    );
    tarballs.push(result.filename);
    const files = new Set(result.files.map((file) => file.path));
    const manifest = JSON.parse(
      readFileSync(join(path, "package.json"), "utf8"),
    );
    if (!manifest.name.startsWith("@inlang/plugin-")) continue;
    assert(
      files.has(manifest.types.replace(/^\.\//, "")),
      `${manifest.name}: missing declarations`,
    );
    const checkExport = (value) => {
      if (typeof value === "string") {
        assert(
          files.has(value.replace(/^\.\//, "")),
          `${manifest.name}: unpublished export ${value}`,
        );
      } else {
        Object.values(value).forEach(checkExport);
      }
    };
    Object.values(manifest.exports).forEach(checkExport);
    const visited = new Set();
    const checkDeclaration = (file) => {
      if (visited.has(file)) return;
      visited.add(file);
      assert(
        files.has(file),
        `${manifest.name}: unpublished declaration ${file}`,
      );
      const source = readFileSync(join(path, file), "utf8");
      for (const { fileName } of ts.preProcessFile(source).importedFiles) {
        if (fileName.startsWith(".")) {
          checkDeclaration(
            posix.normalize(
              posix.join(dirname(file), fileName.replace(/\.js$/, ".d.ts")),
            ),
          );
        } else if (!fileName.startsWith("node:")) {
          const dependency = fileName.startsWith("@")
            ? fileName.split("/").slice(0, 2).join("/")
            : fileName.split("/")[0];
          assert(
            manifest.dependencies?.[dependency] ||
              manifest.peerDependencies?.[dependency],
            `${manifest.name}: declaration dependency ${dependency} is unavailable to consumers`,
          );
        }
      }
    };
    checkDeclaration(manifest.types.replace(/^\.\//, ""));
    for (const value of Object.values(manifest.exports)) {
      if (value.types) checkDeclaration(value.types.replace(/^\.\//, ""));
    }
    assert(
      ![...files].some((file) => file.endsWith(".test.d.ts")),
      `${manifest.name}: test declarations published`,
    );
  }

  writeFileSync(
    join(temporary, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      ...tarballs,
      "@types/node@22",
    ],
    {
      cwd: temporary,
      stdio: "inherit",
    },
  );
  const names = plugins.map(
    (path) => JSON.parse(readFileSync(join(path, "package.json"), "utf8")).name,
  );
  const source =
    names
      .map(
        (name, index) => `import plugin${index} from ${JSON.stringify(name)};
const key${index}: string = plugin${index}.key;
type Key${index}IsTyped = Assert<IsAny<typeof plugin${index}.key> extends false ? true : false>;`,
      )
      .join("\n") +
    `
import { FileSchema } from "@inlang/plugin-message-format/file-schema";
type SchemaIsTyped = Assert<IsAny<typeof FileSchema> extends false ? true : false>;
type IsAny<T> = 0 extends (1 & T) ? true : false;
type Assert<T extends true> = T;
`;
  writeFileSync(join(temporary, "consumer.ts"), source);
  for (const [resolution, module] of [
    ["bundler", "esnext"],
    ["nodenext", "nodenext"],
    ["node10", "esnext"],
  ]) {
    execFileSync(
      process.execPath,
      [
        tsc,
        "--noEmit",
        "--strict",
        "--skipLibCheck",
        "--target",
        "es2022",
        "--module",
        module,
        "--moduleResolution",
        resolution,
        "consumer.ts",
      ],
      {
        cwd: temporary,
        stdio: "inherit",
      },
    );
  }
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    for (const name of ${JSON.stringify(names)}) {
      const { default: plugin } = await import(name);
      if (typeof plugin.key !== "string") throw new Error(name + ": missing plugin export");
    }
    const { FileSchema } = await import("@inlang/plugin-message-format/file-schema");
    if (!FileSchema || typeof FileSchema !== "object") throw new Error("Missing FileSchema export");
  `,
    ],
    { cwd: temporary, stdio: "inherit" },
  );
  console.log(
    `Validated ${names.length} packed plugins under Bundler, NodeNext, and Node10 resolution.`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
