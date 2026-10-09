import { describe, expect, test } from "vitest";
import { loadProjectInMemory, newProject } from "@inlang/sdk";
import { plugin, PLUGIN_KEY } from "./plugin.js";

const settings = {
  baseLocale: "en",
  locales: ["en", "de"],
  modules: [],
  [PLUGIN_KEY]: { pathPattern: "./res/values{locale}/strings.xml" },
};
const path = "./res/values/strings.xml";

/**
 * A file as Android Studio and people write it: four spaces, comments, empty
 * lines, elements out of order, unquoted values with escapes and entities,
 * implicit printf arguments, and elements the plugin doesn't import.
 */
const previous = `<?xml version="1.0" encoding="utf-8"?>
<!-- Strings of the app -->
<resources xmlns:tools="http://schemas.android.com/tools">
    <string name="app_name">My App</string>

    <!-- Shown on the home screen -->
    <string name="welcome">Hello %1$s, it\\'s &lt;great&gt; &amp; fun&#8230;</string>
    <plurals name="items">
        <item quantity="one">%d item</item>
        <item quantity="other">%d items</item>
    </plurals>
    <string-array name="planets">
        <item>Mercury</item>
        <item>Venus</item>
    </string-array>
    <string name="about">"About   us"</string>
    <color name="accent">#FF0000</color>
</resources>
`;

describe("export with the existing file", () => {
  test("a file without edits is written byte for byte", () => {
    expect(reexport(previous)).toBe(previous);
  });

  test("CRLF, a byte order mark and a missing final newline are kept", () => {
    const crlf = "﻿" + previous.replace(/\n/g, "\r\n").trimEnd();
    expect(reexport(crlf)).toBe(crlf);
  });

  test("unusual XML is kept: CDATA, single quotes, comments in plurals, tabs, one line", () => {
    const odd = `<resources><!-- <string name="commented">x</string> -->
\t<string name='single'><![CDATA[<b>bold</b> & co]]></string><string name="b">B</string>
\t<plurals name="p" ><!-- one -->
\t\t<item quantity="one"  >one</item>
\t\t<!-- other -->
\t\t<item quantity='other'>"other"</item></plurals>
\t<dimen name="d">1dp</dimen><bool name="flag">true</bool>
</resources>`;
    expect(reexport(odd)).toBe(odd);
    expect(
      reexport(odd, (data) => {
        setText(data, "b", "Bee");
        setText(data, "p", "others", "other");
        removeMessage(data, "single");
      }),
    ).toBe(
      odd
        .replace(
          `<string name='single'><![CDATA[<b>bold</b> & co]]></string><string name="b">B</string>`,
          `<string name="b">"Bee"</string>`,
        )
        .replace(
          `<item quantity='other'>"other"</item>`,
          `<item quantity="other">"others"</item>`,
        ),
    );
  });

  test("editing one message only changes its element", () => {
    const output = reexport(previous, (data) => {
      setText(data, "app_name", "Meine App");
    });
    expect(output).toBe(
      previous.replace(
        '<string name="app_name">My App</string>',
        '<string name="app_name">"Meine App"</string>',
      ),
    );
  });

  test("editing one plural variant only changes its item", () => {
    const output = reexport(previous, (data) => {
      setText(data, "items", "%1$d thing", "one");
    });
    expect(output).toBe(
      previous.replace(
        '<item quantity="one">%d item</item>',
        '<item quantity="one">"%1$d thing"</item>',
      ),
    );
  });

  test("an edit in a CRLF file is written with CRLF", () => {
    const crlf = previous.replace(/\n/g, "\r\n");
    const output = reexport(crlf, (data) => {
      addMessage(data, "zebra", "Zebra");
      addPlural(data, "apples", { one: "%1$d apple", other: "%1$d apples" });
    });
    expect(output).toBe(
      crlf
        .replace(
          '    <string name="app_name">',
          [
            '    <plurals name="apples">',
            '        <item quantity="one">"%1$d apple"</item>',
            '        <item quantity="other">"%1$d apples"</item>',
            "    </plurals>",
            '    <string name="app_name">',
          ].join("\r\n"),
        )
        .replace(
          "fun&#8230;</string>",
          'fun&#8230;</string>\r\n    <string name="zebra">"Zebra"</string>',
        ),
    );
  });

  test("a change of only whitespace inside a pattern is written", () => {
    const output = reexport(previous, (data) => {
      setText(data, "about", "About us");
    });
    expect(output).toBe(previous.replace('"About   us"', '"About us"'));
  });

  test("a change of only a placeholder is written", () => {
    const output = reexport(previous, (data) => {
      const variant = findVariant(data, "welcome");
      variant.pattern[1].annotation.options[0].value.value = "d";
    });
    expect(output).toBe(
      previous.replace(
        "Hello %1$s, it\\'s &lt;great&gt; &amp; fun&#8230;",
        `"Hello %1$d, it\\'s &lt;great&gt; &amp; fun&amp;#8230;"`,
      ),
    );
  });

  test("new messages are inserted after the message that precedes them in the full export", () => {
    // the full export writes plurals before strings, sorted by name
    const output = reexport(previous, (data) => {
      addMessage(data, "banana", "Banana");
      addPlural(data, "apples", { one: "%1$d apple", other: "%1$d apples" });
      addPlural(data, "lemons", { other: "%1$d lemons" });
    });
    expect(output).toBe(
      previous
        .replace(
          '    <string name="app_name">My App</string>',
          [
            '    <plurals name="apples">',
            '        <item quantity="one">"%1$d apple"</item>',
            '        <item quantity="other">"%1$d apples"</item>',
            "    </plurals>",
            '    <string name="app_name">My App</string>',
            '    <string name="banana">"Banana"</string>',
          ].join("\n"),
        )
        .replace(
          '        <item quantity="other">%d items</item>\n    </plurals>',
          [
            '        <item quantity="other">%d items</item>',
            "    </plurals>",
            '    <plurals name="lemons">',
            '        <item quantity="other">"%1$d lemons"</item>',
            "    </plurals>",
          ].join("\n"),
        ),
    );
  });

  test("a new plural variant is inserted, a removed one is removed", () => {
    const output = reexport(previous, (data) => {
      const items = findVariant(data, "items", "one");
      data.variants.push({
        ...items,
        id: "items-few",
        matches: [{ type: "literal-match", key: "countPlural", value: "few" }],
      });
      data.variants = data.variants.filter((variant) => variant !== items);
    });
    expect(output).toBe(
      previous.replace(
        '<item quantity="one">%d item</item>\n        <item quantity="other">%d items</item>',
        '<item quantity="other">%d items</item>\n        <item quantity="few">"%1$d item"</item>',
      ),
    );
  });

  test("removed messages are removed with their line", () => {
    // the comment is followed by another element after the removed one, so
    // it may be a heading of a group: kept
    expect(reexport(previous, (data) => removeMessage(data, "welcome"))).toBe(
      previous.replace(
        '    <string name="welcome">Hello %1$s, it\\\'s &lt;great&gt; &amp; fun&#8230;</string>\n',
        "",
      ),
    );
    expect(reexport(previous, (data) => removeMessage(data, "items"))).toBe(
      previous.replace(
        previous.slice(
          previous.indexOf("    <plurals"),
          previous.indexOf("    <string-array"),
        ),
        "",
      ),
    );
    expect(reexport(previous, (data) => removeMessage(data, "about"))).toBe(
      previous.replace('    <string name="about">"About   us"</string>\n', ""),
    );
  });

  test("a comment goes with a removed element only if it belongs to it alone", () => {
    const grouped = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Copyright 2026 Example -->
    <string name="a">A</string>
    <string name="b">B</string>

    <!-- Login -->
    <string name="login">Log in</string>
    <string name="logout">Log out</string>

    <!-- The title -->
    <string name="title">Title</string>

    <!-- The footer -->
    <string name="z">Z</string>
</resources>
`;
    // headings of groups are kept
    expect(reexport(grouped, (data) => removeMessage(data, "a"))).toBe(
      grouped.replace('    <string name="a">A</string>\n', ""),
    );
    expect(reexport(grouped, (data) => removeMessage(data, "login"))).toBe(
      grouped.replace('    <string name="login">Log in</string>\n', ""),
    );
    // a comment of one element, followed by an empty line or the end of
    // <resources>, goes with it, as does the heading of a removed group
    expect(reexport(grouped, (data) => removeMessage(data, "title"))).toBe(
      grouped.replace(
        '    <!-- The title -->\n    <string name="title">Title</string>\n\n',
        "",
      ),
    );
    expect(reexport(grouped, (data) => removeMessage(data, "z"))).toBe(
      grouped.replace(
        '\n    <!-- The footer -->\n    <string name="z">Z</string>\n',
        "",
      ),
    );
    expect(
      reexport(grouped, (data) => {
        removeMessage(data, "login");
        removeMessage(data, "logout");
      }),
    ).toBe(
      grouped.replace(
        '    <!-- Login -->\n    <string name="login">Log in</string>\n    <string name="logout">Log out</string>\n\n',
        "",
      ),
    );
  });

  test("the order of plural items doesn't matter for the check", () => {
    const reversed = `<resources>
    <plurals name="items">
        <item quantity="other">%d items</item>
        <item quantity="one">%d item</item>
    </plurals>
    <string name="s">S</string>
</resources>`;
    expect(
      reexport(reversed, (data) => {
        setText(data, "s", "Ess");
        // the new data lists the variants in another order than the file
        data.variants.reverse();
      }),
    ).toBe(reversed.replace(">S<", '>"Ess"<'));
  });

  test("messages added to a file without messages are inserted before </resources>", () => {
    const empty = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string-array name="planets">
        <item>Mercury</item>
    </string-array>
</resources>
`;
    expect(
      reexport(empty, (data) => {
        addMessage(data, "b", "B");
        addPlural(data, "a", { other: "%1$d A" });
      }),
    ).toBe(
      empty.replace(
        "</resources>",
        [
          '    <plurals name="a">',
          '        <item quantity="other">"%1$d A"</item>',
          "    </plurals>",
          '    <string name="b">"B"</string>',
          "</resources>",
        ].join("\n"),
      ),
    );
  });

  test("no existing file writes the full export as before", () => {
    const data = importAndroid(previous);
    const expected = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <plurals name="items">
    <item quantity="one">"%1$d item"</item>
    <item quantity="other">"%1$d items"</item>
  </plurals>
  <string name="about">"About   us"</string>
  <string name="app_name">"My App"</string>
  <string name="welcome">"Hello %1$s, it\\'s &lt;great&gt; &amp; fun&amp;#8230;"</string>
</resources>
`;
    for (const files of [undefined, []]) {
      const [file] = plugin.exportFiles!({ settings, ...data, files }) as any[];
      expect(decode(file!.content)).toBe(expected);
    }
    // a file of another locale is not used
    const [file] = plugin.exportFiles!({
      settings,
      ...data,
      files: [
        {
          path: "./res/values-de/strings.xml",
          locale: "de",
          content: encode(previous),
        },
      ],
    }) as any[];
    expect(decode(file!.content)).toBe(expected);
  });

  test("an invalid existing file writes the full export", () => {
    const data = importAndroid(previous);
    const [full] = plugin.exportFiles!({ settings, ...data }) as any[];
    for (const invalid of [
      "<resources><string name='a'>A</resources>",
      "<resources/>",
      // the plugin can't import a file without elements
      "<resources></resources>",
      '<!DOCTYPE resources [<!ENTITY a "A">]><resources></resources>',
      '<resources><string name="a" translatable="false">A</string></resources>',
      "not xml",
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
        .where("bundle_id", "=", "app_name")
        .select("id")
        .executeTakeFirstOrThrow();
      await project.db
        .updateTable("inlang_variant")
        .where("message_id", "=", message.id)
        .set({ pattern: [{ type: "text", value: "Meine App" }] })
        .execute();
      [file] = await project.exportFiles({ pluginKey: plugin.key, files });
      expect(decode(file!.content)).toBe(
        previous.replace(">My App<", '>"Meine App"<'),
      );
    } finally {
      await project.close();
    }
  });
});

type Data = { bundles: any[]; messages: any[]; variants: any[] };

function reexport(text: string, edit?: (data: Data) => void): string {
  const data = importAndroid(text);
  edit?.(data);
  const [file] = plugin.exportFiles!({
    settings,
    ...data,
    files: [{ path, locale: "en", content: encode(text) }],
  }) as Array<{ content: Uint8Array }>;
  const output = decode(file!.content);
  // the plugin reads the result as the full export (in any order)
  const [full] = plugin.exportFiles!({ settings, ...data }) as (typeof file)[];
  expect(exportOf(importAndroid(output)).split("\n").sort()).toEqual(
    exportOf(importAndroid(decode(full!.content)))
      .split("\n")
      .sort(),
  );
  return output;
}

function exportOf(data: Data): string {
  const [file] = plugin.exportFiles!({ settings, ...data }) as any[];
  return decode(file!.content);
}

function importAndroid(content: string): Data {
  const imported = plugin.importFiles!({
    settings,
    files: [{ locale: "en", content: encode(content) }],
  }) as Data;
  return {
    bundles: imported.bundles,
    messages: imported.messages.map((message) => ({
      ...message,
      id: message.bundleId,
    })),
    variants: imported.variants.map((variant) => ({
      ...variant,
      id: `${variant.messageBundleId}-${JSON.stringify(variant.matches)}`,
      messageId: variant.messageBundleId,
    })),
  };
}

function findVariant(data: Data, key: string, quantity?: string) {
  const variant = data.variants.find(
    (variant) =>
      variant.messageId === key &&
      (quantity === undefined ||
        (quantity === "other"
          ? variant.matches[0]?.type === "catchall-match"
          : variant.matches[0]?.value === quantity)),
  );
  if (!variant) throw new Error(`no variant ${key} ${quantity}`);
  return variant;
}

/** A pattern of text and `%1$s`-style printf arguments. */
function pattern(text: string, declarations: any[]) {
  return text
    .split(/(%\d+\$[a-z]+)/)
    .filter((part) => part !== "")
    .map((part) => {
      const found = /^%(\d+)\$([a-z]+)$/.exec(part);
      if (!found) return { type: "text", value: part };
      const name =
        found[2] === "d" && found[1] === "1" ? "count" : `arg${found[1]}`;
      if (!declarations.some((declaration) => declaration.name === name))
        declarations.unshift({ type: "input-variable", name });
      return {
        type: "expression",
        arg: { type: "variable-reference", name },
        annotation: {
          type: "function-reference",
          name: "android-printf",
          options: [
            { name: "specifier", value: { type: "literal", value: found[2] } },
            { name: "position", value: { type: "literal", value: found[1] } },
          ],
        },
      };
    });
}

function setText(data: Data, key: string, text: string, quantity?: string) {
  const bundle = data.bundles.find((bundle) => bundle.id === key);
  findVariant(data, key, quantity).pattern = pattern(text, bundle.declarations);
}

function addMessage(data: Data, key: string, text: string) {
  const bundle = { id: key, declarations: [] };
  data.bundles.push(bundle);
  data.messages.push({ id: key, bundleId: key, locale: "en", selectors: [] });
  data.variants.push({
    id: key,
    messageId: key,
    matches: [],
    pattern: pattern(text, bundle.declarations),
  });
}

function addPlural(data: Data, key: string, texts: Record<string, string>) {
  const bundle = {
    id: key,
    declarations: [
      {
        type: "local-variable",
        name: "countPlural",
        value: {
          type: "expression",
          arg: { type: "variable-reference", name: "count" },
          annotation: {
            type: "function-reference",
            name: "plural",
            options: [],
          },
        },
      },
    ] as any[],
  };
  data.bundles.push(bundle);
  data.messages.push({
    id: key,
    bundleId: key,
    locale: "en",
    selectors: [{ type: "variable-reference", name: "countPlural" }],
  });
  for (const [quantity, text] of Object.entries(texts))
    data.variants.push({
      id: `${key}-${quantity}`,
      messageId: key,
      matches: [
        quantity === "other"
          ? { type: "catchall-match", key: "countPlural" }
          : { type: "literal-match", key: "countPlural", value: quantity },
      ],
      pattern: pattern(text, bundle.declarations),
    });
}

function removeMessage(data: Data, key: string) {
  data.bundles = data.bundles.filter((bundle) => bundle.id !== key);
  data.messages = data.messages.filter((message) => message.id !== key);
  data.variants = data.variants.filter((variant) => variant.messageId !== key);
}

function encode(value: string) {
  return new TextEncoder().encode(value);
}
function decode(value: Uint8Array) {
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(value);
}
