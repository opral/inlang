import { describe, expect, test } from "vitest";
import {
  loadProjectFromDirectory,
  saveProjectToDirectory,
  type Bundle,
  type InlangPlugin,
  type Message,
  type Variant,
} from "@inlang/sdk";
import { plugin, PLUGIN_KEY } from "./plugin.js";

/**
 * Saving a project must not change the bytes of translation files beyond the
 * actual edits. `exportFiles` gets the previous files and keeps the text of
 * every entry that didn't change.
 */

const settings = {
  baseLocale: "en",
  locales: ["en", "de"],
  [PLUGIN_KEY]: { pathPattern: "./messages/{locale}.json" },
};

type Rows = { bundles: Bundle[]; messages: Message[]; variants: Variant[] };

/** The rows of a project that imported `files`, with stable ids. */
async function importRows(files: Record<string, string>): Promise<Rows> {
  const imported = await plugin.importFiles!({
    files: Object.entries(files).map(([locale, text]) => ({
      locale,
      content: new TextEncoder().encode(text),
    })),
    settings,
  });
  const messages: Message[] = imported.messages.map((message) => ({
    id: `${message.bundleId}:${message.locale}`,
    bundleId: message.bundleId,
    locale: message.locale,
    selectors: message.selectors ?? [],
  }));
  const variants: Variant[] = imported.variants.map((variant, index) => ({
    id: `variant-${index}`,
    messageId: `${variant.messageBundleId}:${variant.messageLocale}`,
    matches: variant.matches ?? [],
    pattern: variant.pattern ?? [],
  }));
  return {
    bundles: imported.bundles as Bundle[],
    messages,
    variants,
  };
}

/** Exports `rows`, with the previous files if given, as text by locale. */
async function exportTexts(
  rows: Rows,
  previous?: Record<string, string>,
): Promise<Record<string, string>> {
  const files = await plugin.exportFiles!({
    ...structuredClone(rows),
    settings,
    files:
      previous === undefined
        ? undefined
        : Object.entries(previous).map(([locale, text]) => ({
            path: `./messages/${locale}.json`,
            locale,
            content: new TextEncoder().encode(text),
          })),
  });
  return Object.fromEntries(
    files.map((file) => [
      file.locale,
      new TextDecoder("utf-8", { ignoreBOM: true }).decode(file.content),
    ]),
  );
}

/** Imports `files`, exports them with the previous files and no edits. */
async function roundtrip(files: Record<string, string>) {
  return exportTexts(await importRows(files), files);
}

/** The rows after setting the message `key` of `locale` to `source`. */
async function edit(
  files: Record<string, string>,
  locale: string,
  key: string,
  source: string | undefined,
): Promise<Rows> {
  const json = JSON.parse(files[locale]!);
  if (source === undefined) {
    delete json[key];
  } else {
    json[key] = source;
  }
  return importRows({ ...files, [locale]: JSON.stringify(json) });
}

/** Replaces `previous` by `next` in `text`, which must occur exactly once. */
function replaceOnce(text: string, previous: string, next: string): string {
  expect(text.split(previous)).toHaveLength(2);
  return text.replace(previous, next);
}

const en = `{
  "zebra":   "Hello  {name}!",
  "apple" : "caf\\u00e9 \\u2014 \\"quoted\\"",
  "count": "{count,plural,one{# item}other{# items}}",
  "offset": "{ guests , plural , offset:1 =0 {nobody} one {{host} and # other} other {{host} and # others} }",
  "quotes": "It's '{'literal'}' and '#', Don''t",
  "pound": "{n, plural, one {'#' is #} other {# is '#'}}",
  "number": "{n,number}  {p, number, percent}",
  "date": "{d, date, short} at {t,time}",
  "select": "{g, select, male {He} female {She} other {They}}",
  "nested": "{g, select, male {{count, plural, one {He has # cat} other {He has # cats}}} other {{count, plural, one {They have # cat} other {They have # cats}}}}"
}
`;

const de = `{\r
\t"apple": "Caf\\u00e9",\r
\t"count": "{count, plural,\\n  one {# Ding}\\n  other {# Dinge}\\n}",\r
\t"zebra": "Hallo {name}!"\r
}`;

describe("export with the previous files", () => {
  test("is byte-identical if nothing was edited", async () => {
    const files = { en, de };
    expect(await roundtrip(files)).toStrictEqual(files);
  });

  test("the full export differs from the hand-written files", async () => {
    // the files of the tests are not what the plugin writes
    const whole = await exportTexts(await importRows({ en, de }));
    expect(whole.en).not.toBe(en);
    expect(whole.de).not.toBe(de);
  });

  test("is byte-identical for minified, BOM and odd whitespace files", async () => {
    const files = {
      en: '﻿{"b":"B {x}","a":"{n, plural, one {#} other {##}}"}',
      de: '  {\n        "a"   :\n "{n,plural,one{#}other{##}}" ,"b":"B {x}"}\n\n',
    };
    expect(await roundtrip(files)).toStrictEqual(files);
  });

  test("only the edited entry changes", async () => {
    const files = { en, de };
    const rows = await edit(files, "en", "zebra", "Hi {name}!");
    expect((await exportTexts(rows, files)).en).toBe(
      replaceOnce(en, '"Hello  {name}!"', '"Hi {name}!"'),
    );

    const rowsDe = await edit(
      files,
      "de",
      "count",
      "{count, plural, one {# Sache} other {# Sachen}}",
    );
    expect(await exportTexts(rowsDe, files)).toStrictEqual({
      en,
      de: replaceOnce(
        de,
        '"{count, plural,\\n  one {# Ding}\\n  other {# Dinge}\\n}"',
        '"{count, plural, one {# Sache} other {# Sachen}}"',
      ),
    });
  });

  test("an edited plural is written as the plugin writes it, the rest is kept", async () => {
    const files = { en, de };
    const rows = await edit(
      files,
      "en",
      "offset",
      "{ guests , plural , offset:1 =0 {nobody} one {{host} and # guest} other {{host} and # others} }",
    );
    expect((await exportTexts(rows, files)).en).toBe(
      replaceOnce(
        en,
        '"{ guests , plural , offset:1 =0 {nobody} one {{host} and # other} other {{host} and # others} }"',
        '"{guests, plural, offset:1 =0 {nobody} one {{host} and # guest} other {{host} and # others}}"',
      ),
    );
  });

  test("adding and removing messages", async () => {
    const files = { en, de };
    const added = await edit(files, "de", "new_key", "Neu {x}");
    expect((await exportTexts(added, files)).de).toBe(
      // after the key that precedes it in the full export
      replaceOnce(
        de,
        '"Hallo {name}!"\r\n}',
        '"Hallo {name}!",\r\n\t"new_key": "Neu {x}"\r\n}',
      ),
    );

    const removed = await edit(files, "en", "apple", undefined);
    expect((await exportTexts(removed, files)).en).toBe(
      replaceOnce(en, '  "apple" : "caf\\u00e9 \\u2014 \\"quoted\\"",\n', ""),
    );

    // the last entry
    const removedLast = await edit(files, "de", "zebra", undefined);
    expect((await exportTexts(removedLast, files)).de).toBe(
      replaceOnce(de, ',\r\n\t"zebra": "Hallo {name}!"', ""),
    );
  });

  test("a new message of a new bundle is inserted after its predecessor in the full export", async () => {
    // the full export writes keys in the order of the rows: new bundles last
    const files = { en, de };
    const rows = await edit(files, "en", "aaa", "first");
    expect((await exportTexts(rows, files)).en).toBe(
      replaceOnce(
        en,
        '"{g, select, male {{count, plural, one {He has # cat} other {He has # cats}}} other {{count, plural, one {They have # cat} other {They have # cats}}}}"\n',
        '"{g, select, male {{count, plural, one {He has # cat} other {He has # cats}}} other {{count, plural, one {They have # cat} other {They have # cats}}}}",\n  "aaa": "first"\n',
      ),
    );
  });
});

describe("data changes are detected", () => {
  const files = { en, de };

  test("only the match of a plural variant changed", async () => {
    const rows = await importRows(files);
    const variant = rows.variants.find(
      (variant) =>
        variant.messageId === "count:en" &&
        variant.matches.some(
          (match) => match.type === "literal-match" && match.value === "one",
        ),
    )!;
    variant.matches = variant.matches.map((match) =>
      match.type === "literal-match" ? { ...match, value: "few" } : match,
    );
    expect((await exportTexts(rows, files)).en).toBe(
      replaceOnce(
        en,
        '"{count,plural,one{# item}other{# items}}"',
        '"{count, plural, few {# item} other {# items}}"',
      ),
    );
  });

  test("an exact match instead of a plural category", async () => {
    const rows = await edit(
      files,
      "en",
      "count",
      "{count,plural,=1{# item}other{# items}}",
    );
    expect((await exportTexts(rows, files)).en).toBe(
      replaceOnce(
        en,
        '"{count,plural,one{# item}other{# items}}"',
        '"{count, plural, =1 {# item} other {# items}}"',
      ),
    );
  });

  test("only the format of an argument changed", async () => {
    const rows = await edit(
      files,
      "en",
      "number",
      "{n,number,percent}  {p, number, percent}",
    );
    expect((await exportTexts(rows, files)).en).toBe(
      replaceOnce(
        en,
        '"{n,number}  {p, number, percent}"',
        '"{n, number, percent}  {p, number, percent}"',
      ),
    );

    const dateRows = await edit(
      files,
      "en",
      "date",
      "{d, date, long} at {t,time}",
    );
    expect((await exportTexts(dateRows, files)).en).toBe(
      replaceOnce(
        en,
        '"{d, date, short} at {t,time}"',
        '"{d, date, long} at {t, time}"',
      ),
    );
  });

  test("only the format of an argument changed, in the rows", async () => {
    const rows = await importRows(files);
    const variant = rows.variants.find(
      (variant) => variant.messageId === "number:en",
    )!;
    variant.pattern = variant.pattern.map((part) =>
      part.type === "expression" &&
      part.arg.type === "variable-reference" &&
      part.arg.name === "n"
        ? { ...part, annotation: undefined }
        : part,
    );
    expect((await exportTexts(rows, files)).en).toBe(
      replaceOnce(
        en,
        '"{n,number}  {p, number, percent}"',
        '"{n}  {p, number, percent}"',
      ),
    );
  });

  test("only whitespace inside a pattern changed", async () => {
    const rows = await edit(files, "en", "zebra", "Hello {name}!");
    expect((await exportTexts(rows, files)).en).toBe(
      replaceOnce(en, '"Hello  {name}!"', '"Hello {name}!"'),
    );

    const pluralRows = await edit(
      files,
      "en",
      "count",
      "{count,plural,one{#  item}other{# items}}",
    );
    expect((await exportTexts(pluralRows, files)).en).toBe(
      replaceOnce(
        en,
        '"{count,plural,one{# item}other{# items}}"',
        '"{count, plural, one {#  item} other {# items}}"',
      ),
    );
  });

  test("only a variable name changed", async () => {
    const rows = await importRows(files);
    const variant = rows.variants.find(
      (variant) => variant.messageId === "zebra:de",
    )!;
    variant.pattern = variant.pattern.map((part) =>
      part.type === "expression" && part.arg.type === "variable-reference"
        ? { ...part, arg: { ...part.arg, name: "nam" } }
        : part,
    );
    expect((await exportTexts(rows, files)).de).toBe(
      replaceOnce(de, '"Hallo {name}!"', '"Hallo {nam}!"'),
    );
  });

  test("only the quoting of a literal changed", async () => {
    // `'#'` in a plural is a literal "#", `#` is the number
    const rows = await edit(
      files,
      "en",
      "pound",
      "{n, plural, one {# is #} other {# is '#'}}",
    );
    expect((await exportTexts(rows, files)).en).toBe(
      replaceOnce(
        en,
        `"{n, plural, one {'#' is #} other {# is '#'}}"`,
        `"{n, plural, one {# is #} other {# is '#'}}"`,
      ),
    );
  });
});

describe("falls back to the full export", () => {
  test("without a previous file, e.g. for a new locale", async () => {
    const rows = await importRows({ en, de });
    const whole = await exportTexts(rows);
    expect(await exportTexts(rows, { en })).toStrictEqual({
      en,
      de: whole.de,
    });
    expect(await exportTexts(rows, {})).toStrictEqual(whole);
  });

  test("if the previous file is not valid JSON", async () => {
    const rows = await importRows({ en, de });
    const whole = await exportTexts(rows);
    expect(
      await exportTexts(rows, { en: en.replace("}\n", "},\n"), de: "" }),
    ).toStrictEqual(whole);
  });

  test("if the previous file is not a JSON object", async () => {
    const rows = await importRows({ en, de });
    const whole = await exportTexts(rows);
    expect(await exportTexts(rows, { en: '["x"]', de })).toStrictEqual({
      en: whole.en,
      de,
    });
  });
});

describe("several path patterns", () => {
  const multiSettings = {
    ...settings,
    [PLUGIN_KEY]: {
      pathPattern: ["./a/{locale}.json", "./b/{locale}.json"],
    },
  };
  // b has a message that a has too, with the same text
  const files: Record<string, string> = {
    "./a/en.json": '{\n  "x": "X {n,number}",\n  "shared": "S"\n}\n',
    "./b/en.json": '{\n    "y": "Y",\n    "shared": "S"\n}',
    "./a/de.json": '{"x":"X {n,number}"}',
    "./b/de.json": '{\r\n\t"y": "Y"\r\n}\r\n',
  };

  /** The rows of a project that imported `files` (by path). */
  async function importMulti(files: Record<string, string>): Promise<Rows> {
    const toBeImported = await plugin.toBeImportedFiles!({
      settings: multiSettings,
    });
    const imported = await plugin.importFiles!({
      files: toBeImported
        .filter((file) => files[file.path] !== undefined)
        .map((file) => ({
          locale: file.locale,
          content: new TextEncoder().encode(files[file.path]),
        })),
      settings: multiSettings,
    });
    // like the SDK: one message per bundle and locale, the last one wins
    const messages = new Map<string, Message>();
    for (const message of imported.messages) {
      const id = `${message.bundleId}:${message.locale}`;
      messages.set(id, {
        id,
        bundleId: message.bundleId,
        locale: message.locale,
        selectors: message.selectors ?? [],
      });
    }
    const variants = new Map<string, Variant>();
    for (const variant of imported.variants) {
      const messageId = `${variant.messageBundleId}:${variant.messageLocale}`;
      const id = `${messageId}:${JSON.stringify(variant.matches)}`;
      variants.set(id, {
        id,
        messageId,
        matches: variant.matches ?? [],
        pattern: variant.pattern ?? [],
      });
    }
    return {
      bundles: imported.bundles as Bundle[],
      messages: [...messages.values()],
      variants: [...variants.values()],
    };
  }

  /** Exports `rows` with the previous files (by path), as text by path. */
  async function exportMulti(
    rows: Rows,
    previous?: Record<string, string>,
  ): Promise<Record<string, string>> {
    const toBeImported = await plugin.toBeImportedFiles!({
      settings: multiSettings,
    });
    const exported = await plugin.exportFiles!({
      ...structuredClone(rows),
      settings: multiSettings,
      files:
        previous === undefined
          ? undefined
          : toBeImported
              .filter((file) => previous[file.path] !== undefined)
              .map((file) => ({
                ...file,
                content: new TextEncoder().encode(previous[file.path]),
              })),
    });
    for (const file of exported) {
      // each file is written to its own path
      expect(
        file.metadata?.["pathPattern"]?.replace("{locale}", file.locale),
      ).toBe(file.name);
    }
    return Object.fromEntries(
      exported.map((file) => [
        file.name,
        new TextDecoder().decode(file.content),
      ]),
    );
  }

  /** The rows after setting `key` of the file at `path` to `source`. */
  function editMulti(path: string, key: string, source: string | undefined) {
    const json = JSON.parse(files[path]!);
    if (source === undefined) {
      delete json[key];
    } else {
      json[key] = source;
    }
    return importMulti({ ...files, [path]: JSON.stringify(json) });
  }

  test("without edits, each file stays as it is", async () => {
    // the full export writes all messages of a locale to every file
    const whole = await exportMulti(await importMulti(files));
    expect(JSON.parse(whole["./b/de.json"]!)).toStrictEqual({
      x: "X {n, number}",
      y: "Y",
    });
    expect(await exportMulti(await importMulti(files), files)).toStrictEqual(
      files,
    );
  });

  test("an edited message changes only in the files that have it", async () => {
    expect(
      await exportMulti(await editMulti("./b/de.json", "y", "Y2"), files),
    ).toStrictEqual({
      ...files,
      "./b/de.json": '{\r\n\t"y": "Y2"\r\n}\r\n',
    });
    expect(
      await exportMulti(await editMulti("./a/en.json", "x", "X2"), files),
    ).toStrictEqual({
      ...files,
      "./a/en.json": '{\n  "x": "X2",\n  "shared": "S"\n}\n',
    });
    // a message that both files have changes in both
    expect(
      await exportMulti(await editMulti("./b/en.json", "shared", "S2"), files),
    ).toStrictEqual({
      ...files,
      "./a/en.json": '{\n  "x": "X {n,number}",\n  "shared": "S2"\n}\n',
      "./b/en.json": '{\n    "y": "Y",\n    "shared": "S2"\n}',
    });
  });

  test("a new message is added to every file of the locale, like the full export", async () => {
    expect(
      await exportMulti(await editMulti("./b/de.json", "z", "Z"), files),
    ).toStrictEqual({
      ...files,
      "./a/de.json": '{"x":"X {n,number}","z":"Z"}',
      "./b/de.json": '{\r\n\t"y": "Y",\r\n\t"z": "Z"\r\n}\r\n',
    });
  });

  test("a deleted message is removed from the files that have it", async () => {
    expect(
      await exportMulti(await editMulti("./b/de.json", "y", undefined), files),
    ).toStrictEqual({
      ...files,
      "./b/de.json": "{}\r\n",
    });
    const rows = await importMulti(files);
    rows.messages = rows.messages.filter(
      (message) => message.id !== "shared:en",
    );
    expect(await exportMulti(rows, files)).toStrictEqual({
      ...files,
      "./a/en.json": '{\n  "x": "X {n,number}"\n}\n',
      "./b/en.json": '{\n    "y": "Y"\n}',
    });
  });

  test("saveProjectToDirectory writes only the edits, and they are read back", async () => {
    // the package has no @types/node
    const nodeFs: any = await import("node:fs" as string);
    const nodeOs: any = await import("node:os" as string);
    const nodePath: any = await import("node:path" as string);
    const dir = nodeFs.mkdtempSync(
      nodePath.join(nodeOs.tmpdir(), "icu1-keep-multi-"),
    );
    const projectPath = nodePath.join(dir, "project.inlang");
    const read = () =>
      Object.fromEntries(
        Object.keys(files).map((path) => [
          path,
          nodeFs.readFileSync(nodePath.join(dir, path), "utf-8"),
        ]),
      );
    const load = () =>
      loadProjectFromDirectory({
        path: projectPath,
        fs: nodeFs,
        providePlugins: [plugin as InlangPlugin],
      });
    const setText = async (
      project: Awaited<ReturnType<typeof load>>,
      bundleId: string,
      locale: string,
      value: string,
    ) => {
      const message = await project.db
        .selectFrom("inlang_message")
        .selectAll()
        .where("bundle_id", "=", bundleId)
        .where("locale", "=", locale)
        .executeTakeFirstOrThrow();
      await project.db
        .updateTable("inlang_variant")
        .set({ pattern: [{ type: "text", value }] })
        .where("message_id", "=", message.id)
        .execute();
    };
    try {
      for (const [path, text] of Object.entries(files)) {
        nodeFs.mkdirSync(nodePath.dirname(nodePath.join(dir, path)), {
          recursive: true,
        });
        nodeFs.writeFileSync(nodePath.join(dir, path), text);
      }
      nodeFs.mkdirSync(projectPath, { recursive: true });
      nodeFs.writeFileSync(
        nodePath.join(projectPath, "settings.json"),
        JSON.stringify(multiSettings),
      );

      const project = await load();
      try {
        await saveProjectToDirectory({
          project,
          path: projectPath,
          fs: nodeFs,
        });
        expect(read()).toStrictEqual(files);

        await setText(project, "y", "de", "Y2");
        await setText(project, "shared", "en", "S2");
        await saveProjectToDirectory({
          project,
          path: projectPath,
          fs: nodeFs,
        });
        expect(read()).toStrictEqual({
          ...files,
          "./a/en.json": '{\n  "x": "X {n,number}",\n  "shared": "S2"\n}\n',
          "./b/en.json": '{\n    "y": "Y",\n    "shared": "S2"\n}',
          "./b/de.json": '{\r\n\t"y": "Y2"\r\n}\r\n',
        });
      } finally {
        await project.close();
      }

      // the edits are read back
      const reloaded = await load();
      try {
        const texts = await reloaded.db
          .selectFrom("inlang_message")
          .innerJoin(
            "inlang_variant",
            "inlang_variant.message_id",
            "inlang_message.id",
          )
          .select(["bundle_id", "locale", "pattern"])
          .execute();
        expect(
          Object.fromEntries(
            texts.map((row) => [
              `${row.bundle_id}:${row.locale}`,
              (row.pattern as Array<{ type: string; value?: string }>)
                .map((part) => part.value ?? `{${part.type}}`)
                .join(""),
            ]),
          ),
        ).toMatchObject({ "y:de": "Y2", "shared:en": "S2", "y:en": "Y" });
      } finally {
        await reloaded.close();
      }
    } finally {
      nodeFs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test("saveProjectToDirectory only writes the edited entry", async () => {
  // the package has no @types/node
  const nodeFs: any = await import("node:fs" as string);
  const nodeOs: any = await import("node:os" as string);
  const nodePath: any = await import("node:path" as string);
  const dir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "icu1-keep-"));
  try {
    nodeFs.mkdirSync(nodePath.join(dir, "messages"), { recursive: true });
    nodeFs.mkdirSync(nodePath.join(dir, "project.inlang"), {
      recursive: true,
    });
    nodeFs.writeFileSync(nodePath.join(dir, "messages/en.json"), en);
    nodeFs.writeFileSync(nodePath.join(dir, "messages/de.json"), de);
    nodeFs.writeFileSync(
      nodePath.join(dir, "project.inlang/settings.json"),
      JSON.stringify(settings),
    );
    const project = await loadProjectFromDirectory({
      path: nodePath.join(dir, "project.inlang"),
      fs: nodeFs,
      providePlugins: [plugin as InlangPlugin],
    });
    try {
      await saveProjectToDirectory({
        project,
        path: nodePath.join(dir, "project.inlang"),
        fs: nodeFs,
      });
      const read = (locale: string) =>
        nodeFs.readFileSync(
          nodePath.join(dir, `messages/${locale}.json`),
          "utf-8",
        );
      expect(read("en")).toBe(en);
      expect(read("de")).toBe(de);

      const message = await project.db
        .selectFrom("inlang_message")
        .selectAll()
        .where("bundle_id", "=", "zebra")
        .where("locale", "=", "de")
        .executeTakeFirstOrThrow();
      await project.db
        .updateTable("inlang_variant")
        .set({ pattern: [{ type: "text", value: "Servus" }] })
        .where("message_id", "=", message.id)
        .execute();
      await saveProjectToDirectory({
        project,
        path: nodePath.join(dir, "project.inlang"),
        fs: nodeFs,
      });
      expect(read("en")).toBe(en);
      expect(read("de")).toBe(replaceOnce(de, '"Hallo {name}!"', '"Servus"'));
    } finally {
      await project.close();
    }
  } finally {
    nodeFs.rmSync(dir, { recursive: true, force: true });
  }
});
