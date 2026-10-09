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
        // only the content of an edited element is replaced
        .replace(
          `<item quantity='other'>"other"</item>`,
          `<item quantity='other'>"others"</item>`,
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
      '<!DOCTYPE resources [<!ENTITY a "A">]><resources></resources>',
      // a name defined twice can't be imported, and the file has only
      // messages
      '<resources><!-- c --><string name="a">A</string><string name="a">B</string></resources>',
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

/**
 * A `res/values/strings.xml` like real apps have: the `tools` namespace,
 * non-translatable strings and plurals, lint attributes on strings, plurals
 * and items, and `formatted="false"`.
 */
const realWorld = `<?xml version="1.0" encoding="utf-8"?>
<resources xmlns:tools="http://schemas.android.com/tools" tools:locale="en" tools:ignore="MissingTranslation">
    <!-- Not translated -->
    <string name="app_name" translatable="false">Acme</string>
    <string name="privacy_url" translatable="false">https://acme.example/privacy</string>

    <!-- Home -->
    <string name="welcome" tools:ignore="UnusedResources">Welcome, %1$s!</string>
    <string name="progress" formatted="false">%d of %d done</string>
    <string name="maps_api_key" translatable="false" tools:ignore="TypographyDashes">YOUR-API-KEY</string>
    <plurals name="songs" tools:ignore="UnusedQuantity">
        <item quantity="one">%d song</item>
        <item quantity="other" tools:ignore="ImpliedQuantity">%d songs</item>
    </plurals>
    <plurals name="debug_items" translatable="false">
        <item quantity="other">%d items</item>
    </plurals>
    <string name="share">Share</string>
</resources>
`;

describe('real-world files: translatable="false" and tools: attributes', () => {
  test("only translatable strings and plurals are imported", () => {
    const data = importAndroid(realWorld);
    expect(data.bundles.map((bundle) => bundle.id).sort()).toEqual([
      "progress",
      "share",
      "songs",
      "welcome",
    ]);
  });

  test("a file without edits is written byte for byte", () => {
    expect(reexport(realWorld)).toBe(realWorld);
  });

  test("an edited element keeps its attributes", () => {
    expect(
      reexport(realWorld, (data) => {
        setText(data, "welcome", "Hi, %1$s!");
        setText(data, "progress", "%d of %d finished");
        setText(data, "songs", "%1$d tracks", "other");
      }),
    ).toBe(
      realWorld
        .replace(
          '<string name="welcome" tools:ignore="UnusedResources">Welcome, %1$s!</string>',
          '<string name="welcome" tools:ignore="UnusedResources">"Hi, %1$s!"</string>',
        )
        .replace(
          '<string name="progress" formatted="false">%d of %d done</string>',
          '<string name="progress" formatted="false">"%d of %d finished"</string>',
        )
        .replace(
          '<item quantity="other" tools:ignore="ImpliedQuantity">%d songs</item>',
          '<item quantity="other" tools:ignore="ImpliedQuantity">"%1$d tracks"</item>',
        ),
    );
  });

  test("non-translatable elements are kept when messages around them are added or removed", () => {
    expect(
      reexport(realWorld, (data) => {
        removeMessage(data, "welcome");
        removeMessage(data, "share");
        addMessage(data, "about", "About");
      }),
    ).toBe(
      realWorld
        .replace(
          '    <string name="welcome" tools:ignore="UnusedResources">Welcome, %1$s!</string>\n',
          "",
        )
        .replace('    <string name="share">Share</string>\n', "")
        // after the element that precedes it in the full export
        .replace(
          "    </plurals>\n    <plurals",
          '    </plurals>\n    <string name="about">"About"</string>\n    <plurals',
        ),
    );
  });

  test("a message with the name of a non-translatable string replaces it instead of defining the name twice", () => {
    const output = reexport(realWorld, (data) => {
      addMessage(data, "app_name", "Acme Translated");
    });
    expect(output).toBe(
      realWorld.replace(
        '<string name="app_name" translatable="false">Acme</string>',
        '<string name="app_name">"Acme Translated"</string>',
      ),
    );
  });

  test("non-translatable elements are never written to other locales", () => {
    const de = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="welcome">Willkommen, %1$s!</string>
</resources>
`;
    const imported = plugin.importFiles!({
      settings,
      files: [
        { locale: "en", content: encode(realWorld) },
        { locale: "de", content: encode(de) },
      ],
    }) as Data;
    const data = identifyRows(imported);
    for (const files of [
      undefined,
      [
        { path, locale: "en", content: encode(realWorld) },
        {
          path: "./res/values-de/strings.xml",
          locale: "de",
          content: encode(de),
        },
      ],
    ]) {
      const exported = plugin.exportFiles!({
        settings,
        ...data,
        files,
      }) as any[];
      const deFile = decode(
        exported.find((file) => file.locale === "de")!.content,
      );
      if (files) expect(deFile).toBe(de);
      for (const name of [
        "app_name",
        "privacy_url",
        "maps_api_key",
        "debug_items",
      ])
        expect(deFile).not.toContain(`name="${name}"`);
    }
  });
});

describe("real-world files: edge cases", () => {
  test("an edited self-closing element keeps its attributes", () => {
    const file = `<resources xmlns:tools="http://schemas.android.com/tools">
    <string name="empty" tools:ignore="UnusedResources"/>
    <plurals name="songs">
        <item quantity="one" tools:ignore="ImpliedQuantity" />
        <item quantity="other">%d songs</item>
    </plurals>
</resources>
`;
    expect(reexport(file)).toBe(file);
    expect(
      reexport(file, (data) => {
        setText(data, "empty", "now filled");
        setText(data, "songs", "%1$d song", "one");
      }),
    ).toBe(
      file
        .replace(
          '<string name="empty" tools:ignore="UnusedResources"/>',
          '<string name="empty" tools:ignore="UnusedResources">"now filled"</string>',
        )
        .replace(
          '<item quantity="one" tools:ignore="ImpliedQuantity" />',
          '<item quantity="one" tools:ignore="ImpliedQuantity" >"%1$d song"</item>',
        ),
    );
  });

  test("messages are added to a self-closing <resources/>, which keeps its attributes", () => {
    const file = `<?xml version="1.0" encoding="utf-8"?>
<resources xmlns:tools="http://schemas.android.com/tools" tools:locale="de"/>
`;
    expect(importAndroid(file).messages).toEqual([]);
    expect(
      reexport(file, (data) => {
        addMessage(data, "b", "B");
        addMessage(data, "a", "A");
      }),
    ).toBe(`<?xml version="1.0" encoding="utf-8"?>
<resources xmlns:tools="http://schemas.android.com/tools" tools:locale="de">
  <string name="a">"A"</string>
  <string name="b">"B"</string>
</resources>
`);
  });

  test('formatted="false" strings are text, with raw %, and round-trip', () => {
    const file = `<resources>
    <string name="pct" formatted="false">Save 50% on %s</string>
    <string name="done" formatted="false" tools:ignore="X">%d% complete</string>
    <string name="plain">Plain</string>
</resources>
`;
    const data = importAndroid(file);
    expect(findVariant(data, "pct").pattern).toEqual([
      { type: "text", value: "Save 50% on %s" },
    ]);
    expect(findVariant(data, "done").pattern).toEqual([
      { type: "text", value: "%d% complete" },
    ]);
    expect(reexport(file)).toBe(file);
    // an edit keeps the attributes and writes % as is
    expect(
      reexport(file, (data) => {
        setText(data, "pct", "Save 60% on %s");
        setText(data, "done", "Done");
      }),
    ).toBe(
      file
        .replace(">Save 50% on %s<", '>"Save 60% on %s"<')
        .replace(">%d% complete<", '>"Done"<'),
    );
    // text that reads as printf gets formatted="false", an expression loses it
    expect(
      reexport(file, (data) => {
        setText(data, "plain", "50% of %s");
        setText(data, "pct", "Save %1$s");
      }),
    ).toBe(
      file
        .replace(
          '<string name="plain">Plain</string>',
          '<string name="plain" formatted="false">"50% of %s"</string>',
        )
        .replace(
          '<string name="pct" formatted="false">Save 50% on %s</string>',
          '<string name="pct">"Save %1$s"</string>',
        ),
    );
    // the full export writes formatted="false" too and reads as the same text
    const full = exportOf(data);
    expect(full).toContain(
      '<string name="pct" formatted="false">"Save 50% on %s"</string>',
    );
    expect(full).toContain(
      '<string name="done" formatted="false">"%d% complete"</string>',
    );
    expect(full).toContain('<string name="plain">"Plain"</string>');
    const byId = (a: any, b: any) => a.id.localeCompare(b.id);
    expect(importAndroid(full).variants.sort(byId)).toEqual(
      data.variants.sort(byId),
    );
  });

  test('adding or removing formatted="false" keeps the other attributes', () => {
    const file = `<resources xmlns:tools="http://schemas.android.com/tools">
    <string name="x" tools:ignore="Typos" formatted='false'>50%</string>
    <string name="y" tools:ignore="Typos">Plain</string>
    <string name="z" tools:ignore="Typos" />
</resources>
`;
    // an expression: formatted="false" is removed
    expect(reexport(file, (data) => setText(data, "x", "%1$s at 50"))).toBe(
      file.replace(
        `<string name="x" tools:ignore="Typos" formatted='false'>50%</string>`,
        '<string name="x" tools:ignore="Typos">"%1$s at 50"</string>',
      ),
    );
    // text that reads as printf: formatted="false" is added after the name
    expect(
      reexport(file, (data) => {
        setText(data, "y", "50% of %s");
        setText(data, "z", "%d%");
      }),
    ).toBe(
      file
        .replace(
          '<string name="y" tools:ignore="Typos">Plain</string>',
          '<string name="y" formatted="false" tools:ignore="Typos">"50% of %s"</string>',
        )
        .replace(
          '<string name="z" tools:ignore="Typos" />',
          '<string name="z" formatted="false" tools:ignore="Typos" >"%d%"</string>',
        ),
    );
  });

  test("translatable and formatted are read like AAPT2 reads booleans", () => {
    const file = `<resources>
    <string name="a" translatable="FALSE">A</string>
    <string name="b" translatable=" False ">B</string>
    <plurals name="c" translatable="False"><item quantity="other">C</item></plurals>
    <string name="d" translatable="TRUE">D</string>
    <string name="e" formatted="FALSE">50% %s</string>
</resources>
`;
    const data = importAndroid(file);
    expect(data.bundles.map((bundle) => bundle.id)).toEqual(["d", "e"]);
    expect(findVariant(data, "e").pattern).toEqual([
      { type: "text", value: "50% %s" },
    ]);
    expect(reexport(file)).toBe(file);
    expect(reexport(file, (data) => setText(data, "d", "Dee"))).toBe(
      file.replace(">D<", '>"Dee"<'),
    );
  });

  test("names are unique per resource type", () => {
    const file = `<resources>
    <plurals name="dbg" translatable="false">
        <item quantity="other">%d entries</item>
    </plurals>
    <string name="x" translatable="false">X</string>
    <plurals name="x">
        <item quantity="other">%d x</item>
    </plurals>
</resources>
`;
    expect(importAndroid(file).bundles.map((bundle) => bundle.id)).toEqual([
      "x",
    ]);
    expect(reexport(file)).toBe(file);
    // a <string> "dbg" is another resource than the <plurals> "dbg"
    expect(reexport(file, (data) => addMessage(data, "dbg", "Debug"))).toBe(
      file.replace(
        "</resources>",
        '    <string name="dbg">"Debug"</string>\n</resources>',
      ),
    );
    // a translatable <string> and <plurals> would be one message
    expect(() =>
      importAndroid(
        '<resources><string name="x">X</string><plurals name="x"><item quantity="other">%d x</item></plurals></resources>',
      ),
    ).toThrow("can't both be translated");
    // the same type twice is a duplicate
    expect(() =>
      importAndroid(
        '<resources><plurals name="x" translatable="false"><item quantity="other">a</item></plurals><plurals name="x"><item quantity="other">b</item></plurals></resources>',
      ),
    ).toThrow('Duplicate Android resource <plurals name="x">');
  });

  test("a message of another locale with the name of a non-translatable resource of the base locale is not written", () => {
    const en = `<resources>
    <string name="app_name" translatable="false">Acme</string>
    <plurals name="debug" translatable="false"><item quantity="other">%d</item></plurals>
    <string name="title">Title</string>
</resources>
`;
    const de = `<resources>
    <string name="title">Titel</string>
</resources>
`;
    const data = identifyRows(
      plugin.importFiles!({
        settings,
        files: [
          { locale: "en", content: encode(en) },
          { locale: "de", content: encode(de) },
        ],
      }) as Data,
    );
    // e.g. created in an editor
    for (const [id, text] of [
      ["app_name", "Acme DE"],
      ["debug", "Debug DE"],
    ]) {
      data.bundles.push({ id, declarations: [] });
      data.messages.push({
        id: `${id}-de`,
        bundleId: id,
        locale: "de",
        selectors: [],
      });
      data.variants.push({
        id: `${id}-de`,
        messageId: `${id}-de`,
        matches: [],
        pattern: [{ type: "text", value: text }],
      });
    }
    const exportDe = (files: any[] | undefined) =>
      decode(
        (plugin.exportFiles!({ settings, ...data, files }) as any[]).find(
          (file) => file.locale === "de",
        )!.content,
      );
    const files = [
      { path, locale: "en", content: encode(en) },
      {
        path: "./res/values-de/strings.xml",
        locale: "de",
        content: encode(de),
      },
    ];
    // app_name is not written, debug is a <string>, not the <plurals>
    expect(exportDe(files)).toBe(
      de.replace(
        "    <string",
        '    <string name="debug">"Debug DE"</string>\n    <string',
      ),
    );
    // unless the file of the locale has it already
    const deWithAppName = de.replace(
      "</resources>",
      '    <string name="app_name">Acme DE</string>\n</resources>',
    );
    expect(
      exportDe([files[0], { ...files[1], content: encode(deWithAppName) }]),
    ).toBe(
      deWithAppName.replace(
        "</resources>",
        '    <string name="debug">"Debug DE"</string>\n</resources>',
      ),
    );
  });

  test("the files get their path as metadata.pathPattern only if the host passes the existing files", () => {
    const data = importAndroid(previous);
    const withoutFiles = plugin.exportFiles!({ settings, ...data }) as any[];
    expect(withoutFiles).toEqual([
      {
        locale: "en",
        name: "./res/values/strings.xml",
        content: expect.any(Uint8Array),
      },
    ]);
    for (const files of [
      [],
      [{ path, locale: "en", content: encode(previous) }],
    ]) {
      const [file] = plugin.exportFiles!({ settings, ...data, files }) as any[];
      expect(file.name).toBe("./res/values/strings.xml");
      expect(file.metadata).toEqual({
        pathPattern: "./res/values/strings.xml",
      });
    }
    data.messages[0].locale = "de";
    const [de] = plugin.exportFiles!({ settings, ...data, files: [] }) as any[];
    expect(de.metadata).toEqual({ pathPattern: "./res/values-de/strings.xml" });
  });
});

describe("locale qualifiers", () => {
  const localeSettings = {
    ...settings,
    locales: ["en", "de", "pt-BR", "zh-Hans", "es-419", "fil"],
  };

  test("toBeImportedFiles lists the qualifier as Android Studio writes it first, then the BCP 47 one", async () => {
    const files = await plugin.toBeImportedFiles!({
      settings: localeSettings,
    } as any);
    expect(files.map((file) => [file.locale, file.path])).toEqual([
      ["en", "./res/values/strings.xml"],
      ["de", "./res/values-de/strings.xml"],
      ["pt-BR", "./res/values-pt-rBR/strings.xml"],
      ["pt-BR", "./res/values-b+pt+BR/strings.xml"],
      ["zh-Hans", "./res/values-b+zh+Hans/strings.xml"],
      ["es-419", "./res/values-b+es+419/strings.xml"],
      ["fil", "./res/values-fil/strings.xml"],
    ]);
  });

  test("the language is lowercase, and legacy language codes are read too", async () => {
    const files = await plugin.toBeImportedFiles!({
      settings: { ...settings, locales: ["en", "PT-br", "he", "id-ID", "yi"] },
    } as any);
    expect(files.map((file) => [file.locale, file.path])).toEqual([
      ["en", "./res/values/strings.xml"],
      ["PT-br", "./res/values-pt-rBR/strings.xml"],
      ["PT-br", "./res/values-b+pt+BR/strings.xml"],
      // as written, e.g. for a case-sensitive file system
      ["PT-br", "./res/values-b+PT+br/strings.xml"],
      ["he", "./res/values-he/strings.xml"],
      ["he", "./res/values-iw/strings.xml"],
      ["id-ID", "./res/values-id-rID/strings.xml"],
      ["id-ID", "./res/values-b+id+ID/strings.xml"],
      ["id-ID", "./res/values-in-rID/strings.xml"],
      ["id-ID", "./res/values-b+in+ID/strings.xml"],
      ["yi", "./res/values-yi/strings.xml"],
      ["yi", "./res/values-ji/strings.xml"],
    ]);
    // written to the existing file
    const data = importAndroid(
      '<resources><string name="a">A</string></resources>',
    );
    data.messages[0].locale = "he";
    const [file] = plugin.exportFiles!({
      settings: { ...settings, locales: ["en", "he"] },
      ...data,
      files: [
        {
          path: "./res/values-iw/strings.xml",
          locale: "he",
          content: encode("<resources>\n</resources>"),
        },
      ],
    }) as any[];
    expect(file.name).toBe("./res/values-iw/strings.xml");
  });

  test("of a current and a legacy language code, the current one is read", () => {
    const imported = plugin.importFiles!({
      settings: { ...settings, locales: ["en", "he"] },
      files: [
        {
          locale: "he",
          content: encode('<resources><string name="a">A</string></resources>'),
          toBeImportedFilesMetadata: { path: "./res/values-he/strings.xml" },
        },
        {
          locale: "he",
          content: encode(
            '<resources><string name="a">IW</string></resources>',
          ),
          toBeImportedFilesMetadata: {
            path: "./res/values-iw/strings.xml",
            legacy: true,
          },
        },
      ],
    } as any) as Data;
    expect(imported.variants.map((variant) => variant.pattern)).toEqual([
      [{ type: "text", value: "A" }],
    ]);
  });

  test("extension subtags are not cased", async () => {
    const files = await plugin.toBeImportedFiles!({
      settings: { ...settings, locales: ["en", "de-u-co-phonebk"] },
    } as any);
    expect(files.map((file) => file.path)).toEqual([
      "./res/values/strings.xml",
      "./res/values-b+de+u+co+phonebk/strings.xml",
    ]);
  });

  test("every {locale} and {languageTag} of the path pattern is replaced", async () => {
    const files = await plugin.toBeImportedFiles!({
      settings: {
        ...settings,
        locales: ["en", "pt-BR"],
        [PLUGIN_KEY]: {
          pathPattern: "./res{locale}/values{languageTag}/strings{locale}.xml",
        },
      },
    } as any);
    expect(files.map((file) => file.path)).toEqual([
      "./res/values/strings.xml",
      "./res-pt-rBR/values-pt-rBR/strings-pt-rBR.xml",
      "./res-b+pt+BR/values-b+pt+BR/strings-b+pt+BR.xml",
    ]);
  });

  test("a locale is written to its existing file, else to the qualifier as Android Studio writes it", () => {
    const pt = `<resources>\n    <string name="a">A</string>\n</resources>\n`;
    const data = identifyRows(
      plugin.importFiles!({
        settings: localeSettings,
        files: [{ locale: "pt-BR", content: encode(pt) }],
      }) as Data,
    );
    const exportWith = (files: any[] | undefined) =>
      (
        plugin.exportFiles!({
          settings: localeSettings,
          ...data,
          files,
        }) as any[]
      ).map((file) => [file.name, file.metadata?.pathPattern]);
    expect(exportWith(undefined)).toEqual([
      ["./res/values-pt-rBR/strings.xml", undefined],
    ]);
    expect(exportWith([])).toEqual([
      ["./res/values-pt-rBR/strings.xml", "./res/values-pt-rBR/strings.xml"],
    ]);
    for (const path of [
      "./res/values-pt-rBR/strings.xml",
      "./res/values-b+pt+BR/strings.xml",
    ])
      expect(
        exportWith([{ path, locale: "pt-BR", content: encode(pt) }]),
      ).toEqual([[path, path]]);
  });

  test("two files of one locale are rejected", () => {
    const file = (path: string) => ({
      locale: "pt-BR",
      content: encode("<resources></resources>"),
      toBeImportedFilesMetadata: { path },
    });
    expect(() =>
      plugin.importFiles!({
        settings: localeSettings,
        files: [
          file("./res/values-pt-rBR/strings.xml"),
          file("./res/values-b+pt+BR/strings.xml"),
        ],
      } as any),
    ).toThrow('Locale "pt-BR" has two Android resource files');
  });
});

describe("product variants and formatted plurals", () => {
  test("non-translatable product variants are accepted and kept", () => {
    const file = `<resources>
    <string name="a" product="tablet" translatable="false">Tablet</string>
    <string name="a" product="default" translatable="false">Phone</string>
    <string name="b">B</string>
</resources>
`;
    expect(importAndroid(file).bundles.map((bundle) => bundle.id)).toEqual([
      "b",
    ]);
    expect(reexport(file)).toBe(file);
    // a message "a" doesn't replace one of the products
    expect(reexport(file, (data) => addMessage(data, "a", "A"))).toBe(
      file.replace(
        '    <string name="b">',
        '    <string name="a">"A"</string>\n    <string name="b">',
      ),
    );
    // translatable product variants can't be represented
    expect(() =>
      importAndroid(
        '<resources><string name="a" product="tablet">T</string><string name="a" product="default">P</string></resources>',
      ),
    ).toThrow("product-specific resources are not supported");
  });

  test('formatted="false" plurals are text and round-trip', () => {
    const file = `<resources xmlns:tools="http://schemas.android.com/tools">
    <plurals name="p" tools:ignore="X" formatted="false">
        <item quantity="one">50% of %d</item>
        <item quantity="other">%d% of %d</item>
    </plurals>
</resources>
`;
    const data = importAndroid(file);
    expect(findVariant(data, "p", "one").pattern).toEqual([
      { type: "text", value: "50% of %d" },
    ]);
    expect(reexport(file)).toBe(file);
    expect(
      reexport(file, (data) => setText(data, "p", "60% of %d", "one")),
    ).toBe(file.replace(">50% of %d<", '>"60% of %d"<'));
    // the full export writes formatted="false" too
    expect(exportOf(data)).toContain('<plurals name="p" formatted="false">');
    expect(importAndroid(exportOf(data)).variants).toEqual(data.variants);
  });

  test('formatted="false" is added to or removed from a <plurals> and keeps its other attributes', () => {
    const file = `<resources xmlns:tools="http://schemas.android.com/tools">
    <plurals name="p" tools:ignore="X">
        <item quantity="one">One song</item>
        <item quantity="other">Songs</item>
    </plurals>
    <plurals name="q" formatted="false" tools:ignore="Y">
        <item quantity="one">One</item>
        <item quantity="other">50% of them</item>
    </plurals>
</resources>
`;
    // text that reads as printf: added, the unchanged item is kept
    expect(reexport(file, (data) => setText(data, "p", "%d%", "other"))).toBe(
      file
        .replace(
          '<plurals name="p" tools:ignore="X">',
          '<plurals name="p" formatted="false" tools:ignore="X">',
        )
        .replace(">Songs<", '>"%d%"<'),
    );
    // an expression: removed
    expect(
      reexport(file, (data) => setText(data, "q", "%1$d of them", "other")),
    ).toBe(
      file
        .replace(
          '<plurals name="q" formatted="false" tools:ignore="Y">',
          '<plurals name="q" tools:ignore="Y">',
        )
        .replace(">50% of them<", '>"%1$d of them"<'),
    );
  });
});

describe("fallbacks and plural formatting", () => {
  test("the full export is not written over elements it would delete", () => {
    const data = importAndroid(previous);
    for (const [content, lost] of [
      [
        // can't be imported: a name defined twice
        '<resources><string name="a">A</string><string name="a">B</string><string-array name="planets"><item>Mercury</item></string-array></resources>',
        '<string-array name="planets">',
      ],
      [
        '<resources><string name="k" translatable="false">K</string><string name="a">A</string><string name="a">B</string></resources>',
        '<string name="k">',
      ],
    ] as const) {
      expect(() =>
        plugin.exportFiles!({
          settings,
          ...data,
          files: [{ path, locale: "en", content: encode(content) }],
        }),
      ).toThrow(
        `Can't write ./res/values/strings.xml without removing elements the Android plugin doesn't import (${lost})`,
      );
    }
  });

  test("a new message of another locale is written if the base locale has only a product variant of the name non-translatable", () => {
    const en = `<resources>
    <string name="greeting" product="tablet" translatable="false">Hi tablet</string>
    <string name="greeting">Hello</string>
</resources>
`;
    const data = identifyRows(
      plugin.importFiles!({
        settings,
        files: [{ locale: "en", content: encode(en) }],
      }) as Data,
    );
    data.messages.push({
      id: "greeting-de",
      bundleId: "greeting",
      locale: "de",
      selectors: [],
    });
    data.variants.push({
      id: "greeting-de",
      messageId: "greeting-de",
      matches: [],
      pattern: [{ type: "text", value: "Hallo" }],
    });
    const files = plugin.exportFiles!({
      settings,
      ...data,
      files: [{ path, locale: "en", content: encode(en) }],
    }) as any[];
    expect(
      decode(files.find((file) => file.locale === "de")!.content),
    ).toContain('<string name="greeting">"Hallo"</string>');
  });

  test("an edit changes only the translatable element of a name, not a non-translatable one of the name", () => {
    const file = `<resources>
    <string name="x" product="tablet" translatable="false">T</string>
    <string name="x">X</string>
    <string name="y" product="tablet" translatable="false"/>
    <string name="y">Y</string>
    <plurals name="z" translatable="false">
        <item quantity="other">%d z</item>
    </plurals>
    <string name="z">Z</string>
</resources>
`;
    expect(
      reexport(file, (data) => {
        setText(data, "x", "lots of %d");
        setText(data, "y", "Why");
        setText(data, "z", "50% of %s");
      }),
    ).toBe(
      file
        .replace(
          '<string name="x">X</string>',
          '<string name="x" formatted="false">"lots of %d"</string>',
        )
        .replace(
          '<string name="y">Y</string>',
          '<string name="y">"Why"</string>',
        )
        .replace(
          '<string name="z">Z</string>',
          '<string name="z" formatted="false">"50% of %s"</string>',
        ),
    );
  });

  test("in a plural with placeholders every item is a format string", () => {
    const file = `<resources>
    <plurals name="p">
        <item quantity="one">One at 100%% off</item>
        <item quantity="other">%d at 100%% off</item>
    </plurals>
    <plurals name="raw">
        <item quantity="one">One 100%%</item>
        <item quantity="other">Many 100%</item>
    </plurals>
</resources>
`;
    const data = importAndroid(file);
    expect(findVariant(data, "p", "one").pattern).toEqual([
      { type: "text", value: "One at 100% off" },
    ]);
    // without placeholders, items are text as before
    expect(findVariant(data, "raw", "one").pattern).toEqual([
      { type: "text", value: "One 100%%" },
    ]);
    expect(reexport(file)).toBe(file);
    // a text item with what reads as a placeholder is escaped
    expect(
      reexport(file, (data) => setText(data, "p", "lots of %d", "one")),
    ).toBe(file.replace(">One at 100%% off<", '>"lots of %%d"<'));
    const full = exportOf(data);
    expect(full).toContain('<item quantity="one">"One at 100%% off"</item>');
    expect(full).toContain('<item quantity="one">"One 100%%"</item>');
  });

  test("a % that isn't a placeholder in a plural with placeholders is read as text and written %%", () => {
    const file = `<resources>
    <plurals name="discount">
        <item quantity="one">50% Rabatt</item>
        <item quantity="other">%d Artikel</item>
    </plurals>
</resources>
`;
    const data = importAndroid(file);
    expect(findVariant(data, "discount", "one").pattern).toEqual([
      { type: "text", value: "50% Rabatt" },
    ]);
    expect(reexport(file)).toBe(file);
    expect(exportOf(data)).toContain('"50%% Rabatt"');
  });

  test("a Java specifier the plugin doesn't support is not read as text in a plural", () => {
    expect(() =>
      importAndroid(
        '<resources><plurals name="p"><item quantity="one">%d file (%.1f MB)</item><item quantity="other">%d files (%.1f MB)</item></plurals></resources>',
      ),
    ).toThrow("Unsupported Android format specifier");
    for (const specifier of ["%02d", "%,d", "%x", "%n", "%5$x"])
      expect(() =>
        importAndroid(
          `<resources><plurals name="p"><item quantity="other">%d at ${specifier}</item></plurals></resources>`,
        ),
      ).toThrow("Unsupported Android format specifier");
  });

  test('a plural that loses formatted="false" is read as format strings even if only the edited item has a placeholder', () => {
    const file = `<resources>
    <!-- keep me -->
    <plurals name="p" formatted="false">
        <item quantity="one">One</item>
        <item quantity="other">%1$s at 50%</item>
    </plurals>
    <string-array name="a"><item>A</item></string-array>
</resources>
`;
    expect(
      reexport(file, (data) => setText(data, "p", "%1$d thing", "one")),
    ).toBe(
      file
        .replace(' formatted="false"', "")
        .replace(">One<", '>"%1$d thing"<')
        .replace(">%1$s at 50%<", '>"%%1$s at 50%%"<'),
    );
  });

  test("a file that only the importer reads (a DOCTYPE with entities) is not overwritten with the full export", () => {
    const file = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE resources [<!ENTITY appname "Acme">]>
<resources>
    <string name="app_name" translatable="false">&appname;</string>
    <string name="hello">Hello</string>
    <string-array name="arr"><item>A</item></string-array>
    <eat-comment/>
</resources>
`;
    const data = importAndroid(file);
    setText(data, "hello", "Hi");
    expect(() =>
      plugin.exportFiles!({
        settings,
        ...data,
        files: [{ path, locale: "en", content: encode(file) }],
      }),
    ).toThrow(
      'without removing elements the Android plugin doesn\'t import (<string name="app_name">, <string-array name="arr">)',
    );
  });

  test('a plural that loses formatted="false" gets its items with a % written as format strings', () => {
    const file = `<resources>
    <plurals name="discount" formatted="false" tools:ignore="X">
        <item quantity="one">%d Artikel</item>
        <item quantity="few">Wenige</item>
        <item quantity="other">50% Rabatt</item>
    </plurals>
</resources>
`;
    const output = reexport(file, (data) =>
      setText(data, "discount", "%1$d Artikel", "one"),
    );
    expect(output).toBe(
      file
        .replace(' formatted="false"', "")
        // reads as the new data as a format string: kept
        .replace(">50% Rabatt<", '>"50%% Rabatt"<'),
    );
    // and reads as the new data
    expect(
      findVariant(importAndroid(output), "discount", "other").pattern,
    ).toEqual([{ type: "text", value: "50% Rabatt" }]);
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
  return identifyRows(imported);
}

/** Bundles, messages and variants with ids, from the result of an import. */
function identifyRows(imported: Data): Data {
  return {
    bundles: imported.bundles,
    messages: imported.messages.map((message) => ({
      ...message,
      id: `${message.bundleId}${message.locale === "en" ? "" : `-${message.locale}`}`,
    })),
    variants: imported.variants.map((variant) => {
      const messageId = `${variant.messageBundleId}${variant.messageLocale === "en" ? "" : `-${variant.messageLocale}`}`;
      return {
        ...variant,
        id: `${messageId}-${JSON.stringify(variant.matches)}`,
        messageId,
      };
    }),
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

describe("a locale whose messages were all deleted", () => {
  const dePath = "./res/values-de/strings.xml";
  const de = `<?xml version="1.0" encoding="utf-8"?>
<!-- German -->
<resources xmlns:tools="http://schemas.android.com/tools">
    <string name="app_name" translatable="false">My App</string>

    <!-- Greeting -->
    <string name="welcome">Hallo</string>
    <string-array name="planets">
        <item>Merkur</item>
    </string-array>
</resources>
`;
  const en =
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="welcome">Hello</string>\n</resources>\n';
  const exportWith = (imported: boolean) => {
    const data = identifyRows(importAndroid(en));
    return plugin.exportFiles!({
      settings,
      ...data,
      files: [
        { path, locale: "en", content: encode(en), imported: true },
        { path: dePath, locale: "de", content: encode(de), imported },
      ],
    }) as Array<{ locale: string; name: string; content: Uint8Array }>;
  };

  test("its file is written without them, other elements stay", () => {
    // the comment above `welcome` is a heading of the elements below it
    const files = exportWith(true);
    expect(files.map((file) => [file.locale, file.name])).toEqual([
      ["en", path],
      ["de", dePath],
    ]);
    expect(decode(files[0]!.content)).toBe(en);
    expect(decode(files[1]!.content))
      .toBe(`<?xml version="1.0" encoding="utf-8"?>
<!-- German -->
<resources xmlns:tools="http://schemas.android.com/tools">
    <string name="app_name" translatable="false">My App</string>

    <!-- Greeting -->
    <string-array name="planets">
        <item>Merkur</item>
    </string-array>
</resources>
`);
  });

  test("a file the project didn't read is not written", () => {
    expect(exportWith(false).map((file) => file.locale)).toEqual(["en"]);
  });

  test("a file that can't be kept and has other elements stays, without failing the export", () => {
    const withEntity = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE resources [<!ENTITY app "My App">]>
<resources>
    <string name="welcome">Hallo &app;</string>
    <string-array name="planets">
        <item>Merkur</item>
    </string-array>
</resources>
`;
    const data = identifyRows(importAndroid(en));
    const files = plugin.exportFiles!({
      settings,
      ...data,
      files: [
        { path, locale: "en", content: encode(en), imported: true },
        {
          path: dePath,
          locale: "de",
          content: encode(withEntity),
          imported: true,
        },
      ],
    }) as Array<{ locale: string }>;
    expect(files.map((file) => file.locale)).toEqual(["en"]);
  });
});
