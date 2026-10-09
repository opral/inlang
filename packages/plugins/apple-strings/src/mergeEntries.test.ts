import { expect, test } from "vitest";

test("mergeEntries.ts is the same in the apple-strings and android plugins", async () => {
  // not typed: the plugin doesn't depend on @types/node
  const fsModule = "node:fs";
  const fs = await import(fsModule);
  const read = (path: string) =>
    fs.readFileSync(new URL(path, import.meta.url), "utf-8");
  expect(read("../../android/src/mergeEntries.ts")).toBe(
    read("./mergeEntries.ts"),
  );
});
