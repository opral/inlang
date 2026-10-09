import { describe, expect, test } from "vitest";
import { loadProjectInMemory, newProject } from "@inlang/sdk";
import { plugin, PLUGIN_KEY } from "./plugin.js";

const settings = {
  baseLocale: "en",
  locales: ["en", "de"],
  modules: [],
  [PLUGIN_KEY]: {
    pathPattern: "./Localizations/{locale}.lproj/Localizable.strings",
  },
};

/**
 * A hand-written file: comments of both kinds, entries out of order, odd
 * whitespace, escapes the plugin doesn't write, a key-only entry, implicit
 * printf arguments.
 */
const previous = `/*
  Localizable.strings
  Header comment
*/

/* Greeting on the home screen */
"welcome"   =  "Hello %@, caf\\U00E9 \\"time\\"";

// the button
"done";
"cancel"="Cancel" ;	// trailing comment

/* Count */
"items" = "%d items";
"z.last" = "Zed";
`;

describe("export with the existing file", () => {
  test("a file without edits is written byte for byte", () => {
    expect(reexport(previous)).toBe(previous);
  });

  test("CRLF, a UTF-8 byte order mark and a missing final newline are kept", () => {
    const crlf = "﻿" + previous.replace(/\n/g, "\r\n").trimEnd();
    expect(reexport(crlf)).toBe(crlf);
  });

  test("UTF-16 files keep their encoding", () => {
    for (const littleEndian of [true, false]) {
      const content = utf16(previous, littleEndian);
      const [file] = exportWith(content, (data) => {
        setText(data, "z.last", "Zett");
      });
      expect([...file!.content]).toEqual([
        ...utf16(previous.replace('"Zed"', '"Zett"'), littleEndian),
      ]);
    }
  });

  test("editing one message only changes its value", () => {
    const output = reexport(previous, (data) => {
      setText(data, "cancel", "Abbrechen");
    });
    expect(output).toBe(
      previous.replace('"cancel"="Cancel" ;', '"cancel"="Abbrechen" ;'),
    );
  });

  test("an edit in a CRLF file is written with CRLF around it", () => {
    const crlf = previous.replace(/\n/g, "\r\n");
    const output = reexport(crlf, (data) => {
      setText(data, "z.last", "Zett");
    });
    expect(output).toBe(crlf.replace('"Zed"', '"Zett"'));
  });

  test("a change of only whitespace inside a pattern is written", () => {
    const output = reexport('"a" = "x y";\n', (data) => {
      setText(data, "a", "x  y");
    });
    expect(output).toBe('"a" = "x  y";\n');
  });

  test("a change of only a placeholder is written", () => {
    const output = reexport(previous, (data) => {
      const variant = findVariant(data, "items");
      variant.pattern[0].annotation.options[0].value.value = "lld";
    });
    expect(output).toBe(
      previous.replace('"items" = "%d items";', '"items" = "%1$lld items";'),
    );
  });

  test("the same text with other escapes is kept", () => {
    const output = reexport(previous, (data) => {
      setText(data, "welcome", 'Hello %1$@, café "time"');
    });
    expect(output).toBe(previous);
  });

  test("a new message is inserted after the message that precedes it in sorted order", () => {
    const output = reexport(previous, (data) => {
      addMessage(data, "delete", "Delete");
      addMessage(data, "zz", "Last");
      addMessage(data, "a", "First");
    });
    expect(output).toBe(
      previous
        .replace(
          "// trailing comment",
          '// trailing comment\n"delete" = "Delete";',
        )
        .replace('"z.last" = "Zed";', '"z.last" = "Zed";\n"zz" = "Last";')
        .replace(
          "/* Greeting on the home screen */",
          '"a" = "First";\n/* Greeting on the home screen */',
        ),
    );
  });

  test("a removed message is removed with its comment and line", () => {
    expect(reexport(previous, (data) => removeMessage(data, "welcome"))).toBe(
      previous.replace(
        '/* Greeting on the home screen */\n"welcome"   =  "Hello %@, caf\\U00E9 \\"time\\"";\n\n',
        "",
      ),
    );
    expect(reexport(previous, (data) => removeMessage(data, "cancel"))).toBe(
      previous.replace('"cancel"="Cancel" ;\t// trailing comment\n', ""),
    );
    expect(reexport(previous, (data) => removeMessage(data, "done"))).toBe(
      // the comment is followed by another entry: a heading, kept
      previous.replace('"done";\n', ""),
    );
    expect(reexport(previous, (data) => removeMessage(data, "z.last"))).toBe(
      previous.replace('"z.last" = "Zed";\n', ""),
    );
  });

  test("entries that share a line are removed without the line", () => {
    const oneLine = '"a" = "A"; "b" = "B";  "c" = "C";\n';
    expect(reexport(oneLine, (data) => removeMessage(data, "a"))).toBe(
      '"b" = "B";  "c" = "C";\n',
    );
    expect(reexport(oneLine, (data) => removeMessage(data, "b"))).toBe(
      '"a" = "A";  "c" = "C";\n',
    );
    expect(reexport(oneLine, (data) => removeMessage(data, "c"))).toBe(
      '"a" = "A"; "b" = "B";\n',
    );
  });

  test("a heading or license comment above the first entry of a group is kept", () => {
    const grouped = `/* Copyright 2026 Example */
"a" = "A";
"b" = "B";

/* Login */
"login" = "Log in";
"logout" = "Log out";
`;
    expect(reexport(grouped, (data) => removeMessage(data, "a"))).toBe(
      grouped.replace('"a" = "A";\n', ""),
    );
    expect(reexport(grouped, (data) => removeMessage(data, "login"))).toBe(
      grouped.replace('"login" = "Log in";\n', ""),
    );
    // the last entry of a group takes its comment along
    expect(
      reexport(grouped, (data) => {
        removeMessage(data, "login");
        removeMessage(data, "logout");
      }),
    ).toBe(
      grouped.replace(
        '\n/* Login */\n"login" = "Log in";\n"logout" = "Log out";\n',
        "",
      ),
    );
    // a new first entry is inserted below the heading
    expect(reexport(grouped, (data) => addMessage(data, "0", "Zero"))).toBe(
      grouped.replace('"a" = "A";', '"0" = "Zero";\n"a" = "A";'),
    );
  });

  test("an edit keeps a comment inside the entry and the spacing around the value", () => {
    const inline = '"b" /* inline */ = "B" ;\n';
    expect(reexport(inline, (data) => setText(data, "b", "Bee"))).toBe(
      '"b" /* inline */ = "Bee" ;\n',
    );
  });

  test("removing the last entry and adding one keeps a missing final line break", () => {
    expect(
      reexport('"a" = "A";\n"b" = "B";', (data) => {
        removeMessage(data, "b");
        addMessage(data, "c", "C");
      }),
    ).toBe('"a" = "A";\n"c" = "C";');
  });

  test("blocks separated by empty lines stay separated by one empty line", () => {
    const genstrings = `/* A */
"a" = "A";

/* B */
"b" = "B";

/* C */
"c" = "C";
`;
    expect(reexport(genstrings, (data) => removeMessage(data, "a"))).toBe(
      `/* B */
"b" = "B";

/* C */
"c" = "C";
`,
    );
    expect(reexport(genstrings, (data) => removeMessage(data, "b"))).toBe(
      `/* A */
"a" = "A";

/* C */
"c" = "C";
`,
    );
    expect(reexport(genstrings, (data) => removeMessage(data, "c"))).toBe(
      `/* A */
"a" = "A";

/* B */
"b" = "B";
`,
    );
    expect(reexport(genstrings, (data) => addMessage(data, "bb", "BB"))).toBe(
      `/* A */
"a" = "A";

/* B */
"b" = "B";

"bb" = "BB";

/* C */
"c" = "C";
`,
    );
  });

  test("a new first message while the first message is removed", () => {
    expect(
      reexport('"b" = "B";\n"c" = "C";\n', (data) => {
        removeMessage(data, "b");
        addMessage(data, "a", "A");
      }),
    ).toBe('"a" = "A";\n"c" = "C";\n');
    expect(
      reexport('/* x */\n"b" = "B";\n', (data) => {
        removeMessage(data, "b");
        addMessage(data, "a", "A");
      }),
    ).toBe('"a" = "A";\n');
  });

  test("messages added to an empty file", () => {
    expect(
      reexport("/* no strings yet */", (data) => {
        addMessage(data, "b", "B");
        addMessage(data, "a", "A");
      }),
    ).toBe('/* no strings yet */\n"a" = "A";\n"b" = "B";');
    expect(
      reexport("/* no strings yet */\n", (data) => {
        addMessage(data, "a", "A");
      }),
    ).toBe('/* no strings yet */\n"a" = "A";\n');
  });

  test("no existing file writes the full export as before", () => {
    const data = importStrings(previous);
    const expected = `"cancel" = "Cancel";
"done" = "done";
"items" = "%1$d items";
"welcome" = "Hello %1$@, café \\"time\\"";
"z.last" = "Zed";
`;
    for (const files of [undefined, []]) {
      const [file] = plugin.exportFiles!({
        settings,
        ...data,
        files,
      }) as any[];
      expect(decode(file!.content)).toBe(expected);
    }
    // a file of another locale is not used
    const [file] = plugin.exportFiles!({
      settings,
      ...data,
      files: [
        { path: "./de.strings", locale: "de", content: encode(previous) },
      ],
    }) as any[];
    expect(decode(file!.content)).toBe(expected);
  });

  test("removing a block between empty lines and the last block of the file", () => {
    const text =
      '"a"  =  "A";\n\n/* B */\n"b" = "B";\n\n// the button\n"c" = "C";\n';
    expect(
      reexport(text, (data) => {
        for (const key of ["b", "c"]) {
          data.messages = data.messages.filter((m) => m.bundleId !== key);
          data.variants = data.variants.filter((v) => v.messageId !== key);
        }
      }),
    ).toBe('"a"  =  "A";\n');
  });

  test("the file of a locale whose messages were all deleted is written without them", () => {
    const data = importStrings(previous);
    const dePath = "./Localizations/de.lproj/Localizable.strings";
    const files = plugin.exportFiles!({
      settings,
      ...data,
      files: [
        { path, locale: "en", content: encode(previous) },
        {
          path: dePath,
          locale: "de",
          content: encode(previous),
          imported: true,
        },
      ],
    }) as any[];
    expect(files.map((file) => [file.locale, file.name])).toEqual([
      ["en", expect.any(String)],
      ["de", dePath],
    ]);
    expect(decode(files[0]!.content)).toBe(previous);
    const de = decode(files[1]!.content);
    // the header stays, the entries and their comments are gone
    expect(de).toBe("/*\n  Localizable.strings\n  Header comment\n*/\n");
    expect(importStrings(de).messages).toEqual([]);
  });

  test("an existing file without messages of a locale without messages is not written", () => {
    const data = importStrings(previous);
    const files = plugin.exportFiles!({
      settings,
      ...data,
      files: [
        { path, locale: "en", content: encode(previous) },
        {
          path: "./de.strings",
          locale: "de",
          content: encode("/* none */\n"),
          imported: true,
        },
      ],
    }) as any[];
    expect(files.map((file) => file.locale)).toEqual(["en"]);
  });

  test("a file the project didn't read is not written", () => {
    // e.g. of a locale added to the settings after the project was loaded
    const data = importStrings(previous);
    const files = plugin.exportFiles!({
      settings,
      ...data,
      files: [
        { path, locale: "en", content: encode(previous) },
        { path: "./de.strings", locale: "de", content: encode(previous) },
      ],
    }) as any[];
    expect(files.map((file) => file.locale)).toEqual(["en"]);
  });

  test("an invalid existing file writes the full export", () => {
    const data = importStrings(previous);
    const [full] = plugin.exportFiles!({ settings, ...data }) as any[];
    for (const invalid of [
      '"a" = "A"',
      "/* unterminated",
      '"a" = "A";\n"a" = "B";\n',
      '"a" = "\\q";',
    ]) {
      const [file] = plugin.exportFiles!({
        settings,
        ...data,
        files: [{ path, locale: "en", content: encode(invalid) }],
      }) as any[];
      expect(decode(file!.content)).toBe(decode(full!.content));
    }
  });

  test("project.exportFiles only changes the edited message", async () => {
    const project = await loadProjectInMemory({
      blob: await newProject({ settings }),
      providePlugins: [plugin as any],
    });
    try {
      await project.importFiles({
        pluginKey: plugin.key,
        files: [{ locale: "en", content: encode(previous) }],
      });
      const files = [{ path, locale: "en", content: encode(previous) }];
      let [file] = await project.exportFiles({ pluginKey: plugin.key, files });
      expect(decode(file!.content)).toBe(previous);

      const message = await project.db
        .selectFrom("inlang_message")
        .where("bundle_id", "=", "z.last")
        .select("id")
        .executeTakeFirstOrThrow();
      await project.db
        .updateTable("inlang_variant")
        .where("message_id", "=", message.id)
        .set({ pattern: [{ type: "text", value: "Zett" }] })
        .execute();
      [file] = await project.exportFiles({ pluginKey: plugin.key, files });
      expect(decode(file!.content)).toBe(previous.replace('"Zed"', '"Zett"'));
    } finally {
      await project.close();
    }
  });
});

const path = "./Localizations/en.lproj/Localizable.strings";

type Data = { bundles: any[]; messages: any[]; variants: any[] };

function reexport(text: string, edit?: (data: Data) => void): string {
  const [file] = exportWith(encode(text), edit);
  return decode(file!.content);
}

function exportWith(content: Uint8Array, edit?: (data: Data) => void) {
  const data = importStrings(content);
  edit?.(data);
  const files = plugin.exportFiles!({
    settings,
    ...data,
    files: [{ path, locale: "en", content }],
  }) as Array<{ locale: string; name: string; content: Uint8Array }>;
  // the plugin reads the result as the full export
  const [full] = plugin.exportFiles!({ settings, ...data }) as typeof files;
  expect(exportOf(importStrings(files[0]!.content))).toBe(
    exportOf(importStrings(full!.content)),
  );
  return files;
}

function exportOf(data: Data): string {
  const [file] = plugin.exportFiles!({ settings, ...data }) as any[];
  return decode(file!.content);
}

function importStrings(content: string | Uint8Array): Data {
  const imported = plugin.importFiles!({
    settings,
    files: [
      {
        locale: "en",
        content: typeof content === "string" ? encode(content) : content,
      },
    ],
  }) as Data;
  return {
    bundles: imported.bundles,
    messages: imported.messages.map((message) => ({
      ...message,
      id: message.bundleId,
    })),
    variants: imported.variants.map((variant) => ({
      ...variant,
      id: variant.messageBundleId,
      messageId: variant.messageBundleId,
    })),
  };
}

function findVariant(data: Data, key: string) {
  const variant = data.variants.find((variant) => variant.messageId === key);
  if (!variant) throw new Error(`no variant ${key}`);
  return variant;
}

/** Sets the pattern to text and `%1$@`-style printf arguments. */
function setText(data: Data, key: string, text: string) {
  const variables = new Set<string>();
  findVariant(data, key).pattern = text
    .split(/(%\d+\$[a-z@]+)/)
    .filter((part) => part !== "")
    .map((part) => {
      const found = /^%(\d+)\$([a-z@]+)$/.exec(part);
      if (!found) return { type: "text", value: part };
      variables.add(`arg${found[1]}`);
      return {
        type: "expression",
        arg: { type: "variable-reference", name: `arg${found[1]}` },
        annotation: {
          type: "function-reference",
          name: "apple-printf",
          options: [
            { name: "specifier", value: { type: "literal", value: found[2] } },
            { name: "position", value: { type: "literal", value: found[1] } },
          ],
        },
      };
    });
  const bundle = data.bundles.find((bundle) => bundle.id === key);
  for (const name of variables)
    if (!bundle.declarations.some((d: any) => d.name === name))
      bundle.declarations.push({ type: "input-variable", name });
}

function addMessage(data: Data, key: string, text: string) {
  data.bundles.push({ id: key, declarations: [] });
  data.messages.push({ id: key, bundleId: key, locale: "en", selectors: [] });
  data.variants.push({ id: key, messageId: key, matches: [], pattern: [] });
  setText(data, key, text);
}

function removeMessage(data: Data, key: string) {
  data.bundles = data.bundles.filter((bundle) => bundle.id !== key);
  data.messages = data.messages.filter((message) => message.id !== key);
  data.variants = data.variants.filter((variant) => variant.messageId !== key);
}

function utf16(text: string, littleEndian: boolean) {
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes[0] = littleEndian ? 0xff : 0xfe;
  bytes[1] = littleEndian ? 0xfe : 0xff;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    bytes[2 + index * 2] = littleEndian ? code & 0xff : code >> 8;
    bytes[3 + index * 2] = littleEndian ? code >> 8 : code & 0xff;
  }
  return bytes;
}

function encode(value: string) {
  return new TextEncoder().encode(value);
}
function decode(value: Uint8Array) {
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(value);
}
