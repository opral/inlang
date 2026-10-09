import { describe, expect, test } from "vitest";
import { loadProjectInMemory, newProject } from "@inlang/sdk";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { plugin, PLUGIN_KEY } from "./plugin.js";

const settings = {
  baseLocale: "en",
  locales: ["en", "de"],
  modules: [],
  [PLUGIN_KEY]: { pathPattern: "./Localizations/Localizable.xcstrings" },
};

describe("Apple String Catalog plugin", () => {
  test("imports and exports exact keys, locales, positional variables, plurals, and devices", async () => {
    const source = catalog({
      "ManageSale.PricePlaceholder": {
        extractionState: "manual",
        localizations: {
          en: { stringUnit: translated("Hello %1$@") },
          de: { stringUnit: translated("Hallo %1$@") },
        },
      },
      cart_items: {
        localizations: {
          en: {
            stringUnit: translated("%#@countPlural@"),
            substitutions: {
              countPlural: {
                argNum: 1,
                formatSpecifier: "lld",
                variations: {
                  plural: {
                    one: { stringUnit: translated("%1$lld item") },
                    other: { stringUnit: translated("%1$lld items") },
                  },
                },
              },
            },
          },
        },
      },
      learn_more: {
        localizations: {
          en: {
            variations: {
              device: {
                iphone: { stringUnit: translated("Tap to learn more") },
                other: { stringUnit: translated("Click to learn more") },
              },
            },
          },
        },
      },
    });
    const imported = await plugin.importFiles!({
      settings,
      files: [{ locale: "en", content: encode(source) }],
    });
    expect(imported.bundles.map((bundle) => bundle.id)).toEqual([
      "ManageSale.PricePlaceholder",
      "cart_items",
      "learn_more",
    ]);
    const pluralMessage = imported.messages.find(
      (message) => message.bundleId === "cart_items",
    )!;
    expect(pluralMessage.selectors).toEqual([
      { type: "variable-reference", name: "countPlural" },
    ]);
    const deviceMessage = imported.messages.find(
      (message) => message.bundleId === "learn_more",
    )!;
    expect(deviceMessage.selectors).toEqual([
      { type: "variable-reference", name: "device" },
    ]);

    const concrete = concretize(imported);
    const [file] = await plugin.exportFiles!({ settings, ...concrete });
    expect(file!.name).toBe("./Localizations/Localizable.xcstrings");
    const output = JSON.parse(decode(file!.content));
    expect(output.sourceLanguage).toBe("en");
    expect(
      output.strings["ManageSale.PricePlaceholder"].localizations.de.stringUnit
        .value,
    ).toBe("Hallo %1$@");
    expect(
      output.strings.cart_items.localizations.en.substitutions.countPlural
        .variations.plural.other.stringUnit.value,
    ).toBe("%1$lld items");
    expect(
      output.strings.learn_more.localizations.en.variations.device.iphone
        .stringUnit.value,
    ).toBe("Tap to learn more");
  });

  test("round-trips through the SDK project lifecycle", async () => {
    const project = await loadProjectInMemory({
      blob: await newProject({ settings }),
      providePlugins: [plugin as any],
    });
    try {
      const files = [
        {
          locale: "en",
          content: encode(
            catalog({
              greeting: {
                localizations: {
                  en: { stringUnit: translated("Hello %1$@") },
                  de: { stringUnit: translated("Hallo %1$@") },
                },
              },
            }),
          ),
        },
      ];
      await project.importFiles({ pluginKey: plugin.key, files });
      const [file] = await project.exportFiles({ pluginKey: plugin.key });
      const output = JSON.parse(decode(file!.content));
      expect(output.strings.greeting.localizations).toEqual({
        de: { stringUnit: translated("Hallo %1$@") },
        en: { stringUnit: translated("Hello %1$@") },
      });
    } finally {
      await project.close();
    }
  });

  test("preserves plural templates, argument positions, and compiles with Xcode", async () => {
    const source = catalog({
      cart: {
        localizations: {
          en: {
            stringUnit: translated("You have %#@items@ remaining"),
            substitutions: {
              items: {
                argNum: 2,
                formatSpecifier: "d",
                variations: {
                  plural: {
                    one: { stringUnit: translated("%d item") },
                    other: { stringUnit: translated("%d items") },
                  },
                },
              },
            },
          },
        },
      },
    });
    const imported = await plugin.importFiles!({
      settings,
      files: [{ locale: "en", content: encode(source) }],
    });
    expect(imported.variants[0]?.pattern?.[0]).toEqual({
      type: "text",
      value: "You have ",
    });
    const [file] = await plugin.exportFiles!({
      settings,
      ...concretize(imported),
    });
    const localization = JSON.parse(decode(file!.content)).strings.cart
      .localizations.en;
    expect(localization.substitutions.items.argNum).toBe(2);
    expect(localization.substitutions.items.formatSpecifier).toBe("d");
    expect(
      localization.substitutions.items.variations.plural.other.stringUnit.value,
    ).toBe("You have %2$d items remaining");
    compileWithXcode(file!.content);
  });

  test("imports and compiles standard direct plural variations", async () => {
    const source = catalog({
      cart_items_direct: {
        localizations: {
          en: {
            variations: {
              plural: {
                one: { stringUnit: translated("%1$lld item") },
                other: { stringUnit: translated("%1$lld items") },
              },
            },
          },
        },
      },
    });
    const imported = await plugin.importFiles!({
      settings,
      files: [{ locale: "en", content: encode(source) }],
    });
    const [file] = await plugin.exportFiles!({
      settings,
      ...concretize(imported),
    });
    expect(
      JSON.parse(decode(file!.content)).strings.cart_items_direct.localizations
        .en.variations.plural.other.stringUnit.value,
    ).toBe("%1$lld items");
    compileWithXcode(file!.content);
  });

  test("exports canonical Inlang plurals with numeric placeholders", () => {
    const [file] = plugin.exportFiles!({
      settings,
      bundles: [
        {
          id: "cart_items",
          declarations: [
            { type: "input-variable", name: "count" },
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
          ],
        },
      ] as any,
      messages: [
        {
          id: "message",
          bundleId: "cart_items",
          locale: "en",
          selectors: [{ type: "variable-reference", name: "countPlural" }],
        },
      ],
      variants: [
        {
          id: "one",
          messageId: "message",
          matches: [
            { type: "literal-match", key: "countPlural", value: "one" },
          ],
          pattern: [
            {
              type: "expression",
              arg: { type: "variable-reference", name: "count" },
            },
            { type: "text", value: " item" },
          ],
        },
        {
          id: "other",
          messageId: "message",
          matches: [{ type: "catchall-match", key: "countPlural" }],
          pattern: [
            {
              type: "expression",
              arg: { type: "variable-reference", name: "count" },
            },
            { type: "text", value: " items" },
          ],
        },
      ] as any,
    }) as any[];
    expect(
      JSON.parse(decode(file!.content)).strings.cart_items.localizations.en
        .substitutions.countPlural.variations.plural.other.stringUnit.value,
    ).toBe("%1$lld items");
    compileWithXcode(file!.content);
  });

  test("preserves plain percent text and escaped percent in formatted patterns", async () => {
    const source = catalog({
      raw: {
        localizations: { en: { stringUnit: translated("Save 20% and 100%%") } },
      },
      formatted: {
        localizations: {
          en: { stringUnit: translated("%1$@ is 20%% complete") },
        },
      },
    });
    const imported = await plugin.importFiles!({
      settings,
      files: [{ locale: "en", content: encode(source) }],
    });
    const [file] = await plugin.exportFiles!({
      settings,
      ...concretize(imported),
    });
    const output = JSON.parse(decode(file!.content));
    expect(output.strings.raw.localizations.en.stringUnit.value).toBe(
      "Save 20% and 100%%",
    );
    expect(output.strings.formatted.localizations.en.stringUnit.value).toBe(
      "%1$@ is 20%% complete",
    );
  });

  test("rejects malformed, nested, multi-selector, and missing-other catalogs", async () => {
    expect(() =>
      plugin.importFiles!({
        settings,
        files: [{ locale: "en", content: encode("not json") }],
      }),
    ).toThrow("Invalid Apple .xcstrings JSON");
    expect(() =>
      plugin.importFiles!({
        settings,
        files: [
          {
            locale: "en",
            content: encode(
              catalog({
                bad: {
                  localizations: {
                    en: {
                      variations: {
                        device: { iphone: { stringUnit: translated("Tap") } },
                      },
                    },
                  },
                },
              }),
            ),
          },
        ],
      }),
    ).toThrow('require "other"');
    expect(() =>
      plugin.importFiles!({
        settings,
        files: [
          {
            locale: "en",
            content: encode(
              catalog({
                bad: {
                  localizations: {
                    en: {
                      stringUnit: translated("value"),
                      variations: {
                        device: { other: { stringUnit: translated("other") } },
                      },
                    },
                  },
                },
              }),
            ),
          },
        ],
      }),
    ).toThrow("exactly one supported localization shape");
    expect(() =>
      plugin.exportFiles!({
        settings,
        bundles: [{ id: "bad", declarations: [] }],
        messages: [
          {
            id: "message",
            bundleId: "bad",
            locale: "en",
            selectors: [
              { type: "variable-reference", name: "a" },
              { type: "variable-reference", name: "b" },
            ],
          },
        ],
        variants: [],
      }),
    ).toThrow("one selector");
    expect(() =>
      plugin.importFiles!({
        settings,
        files: [
          {
            locale: "en",
            content: encode(
              JSON.stringify({
                sourceLanguage: "fr",
                strings: {},
                version: "1.0",
              }),
            ),
          },
        ],
      }),
    ).toThrow("must match baseLocale");
  });

  test("imports the key as the source language value of strings without a localization of the source language", async () => {
    // Xcode uses the key at runtime, e.g. for strings extracted from code
    // that nobody translated yet, `shouldTranslate: false`, stale strings
    const imported = await plugin.importFiles!({
      settings,
      files: [
        {
          locale: "en",
          content: encode(
            catalog({
              "": {},
              "Hello, %@!": {
                localizations: {
                  de: { stringUnit: translated("Hallo, %@!") },
                },
              },
              "Not yet translated": {},
              "%1$@ and %@": { comment: "a format the plugin can't read" },
              "Copyright © 2026": { shouldTranslate: false },
              "onboarding.title": {
                comment: "Title of the first page",
                extractionState: "manual",
              },
              stale: { extractionState: "stale", localizations: {} },
            }),
          ),
        },
      ],
    });
    const sourceMessages = (bundleId: string) =>
      imported.messages.filter((message) => message.bundleId === bundleId);
    const pattern = (bundleId: string, locale: string) =>
      imported.variants.find(
        (variant) =>
          variant.messageBundleId === bundleId &&
          variant.messageLocale === locale,
      )?.pattern;
    for (const id of [
      "",
      "Not yet translated",
      "%1$@ and %@",
      "Copyright © 2026",
      "onboarding.title",
      "stale",
    ]) {
      expect(sourceMessages(id), id).toEqual([
        { bundleId: id, locale: "en", selectors: [] },
      ]);
      expect(pattern(id, "en"), id).toEqual([{ type: "text", value: id }]);
    }
    expect(sourceMessages("Hello, %@!").map((m) => m.locale)).toEqual([
      "de",
      "en",
    ]);
    // the key is a format string like the values
    expect(pattern("Hello, %@!", "en")).toEqual([
      { type: "text", value: "Hello, " },
      {
        type: "expression",
        arg: { type: "variable-reference", name: "arg1" },
        annotation: {
          type: "function-reference",
          name: "apple-printf",
          options: [
            { name: "specifier", value: { type: "literal", value: "@" } },
            { name: "position", value: { type: "literal", value: "1" } },
          ],
        },
      },
      { type: "text", value: "!" },
    ]);
    expect(
      imported.bundles.find((bundle) => bundle.id === "Hello, %@!")
        ?.declarations,
    ).toEqual([{ type: "input-variable", name: "arg1" }]);
  });

  test("doesn't write the key as the source language value, so that strings without one keep their shape", async () => {
    const source = catalog({
      "Hello, %@!": {
        localizations: { de: { stringUnit: translated("Hallo, %@!") } },
      },
      "Not yet translated": {},
      "%1$@ and %@": {},
      "settings.title": {
        localizations: { en: { stringUnit: translated("Settings") } },
      },
    });
    const imported = await plugin.importFiles!({
      settings,
      files: [{ locale: "en", content: encode(source) }],
    });
    const data = concretize(imported);
    const [file] = await plugin.exportFiles!({ settings, ...data });
    const exported = JSON.parse(decode(file!.content));
    expect(exported.strings).toEqual({
      "Hello, %@!": {
        extractionState: "manual",
        localizations: { de: { stringUnit: translated("Hallo, %1$@!") } },
      },
      "Not yet translated": { extractionState: "manual" },
      "%1$@ and %@": { extractionState: "manual" },
      "settings.title": {
        extractionState: "manual",
        localizations: { en: { stringUnit: translated("Settings") } },
      },
    });
    compileWithXcode(file!.content);

    // a source language value other than the key is written
    const edited = structuredClone(data);
    const variant = edited.variants.find(
      (variant: any) =>
        variant.messageId ===
        edited.messages.find(
          (message: any) =>
            message.bundleId === "Not yet translated" &&
            message.locale === "en",
        ).id,
    );
    variant.pattern = [{ type: "text", value: "Not translated yet" }];
    const [editedFile] = await plugin.exportFiles!({ settings, ...edited });
    expect(
      JSON.parse(decode(editedFile!.content)).strings["Not yet translated"],
    ).toEqual({
      extractionState: "manual",
      localizations: { en: { stringUnit: translated("Not translated yet") } },
    });
  });

  test("imports format strings it can't read as text, which is written as it is", async () => {
    // e.g. ambiguous printf arguments; before, the import of the whole
    // catalog failed
    for (const value of ["%1$@ %d", "%1$@ %1$d", "100% %1$@ %q"]) {
      const source = catalog({
        bad: {
          extractionState: "manual",
          localizations: { en: { stringUnit: translated(value) } },
        },
      });
      const imported = await plugin.importFiles!({
        settings,
        files: [{ locale: "en", content: encode(source) }],
      });
      expect(imported.variants.map((variant) => variant.pattern)).toEqual([
        [{ type: "text", value }],
      ]);
      const [file] = await plugin.exportFiles!({
        settings,
        ...concretize(imported),
      });
      expect(JSON.parse(decode(file!.content))).toEqual(JSON.parse(source));
    }
  });

  test("reads implicit printf arguments with width and precision, and percent signs in text", async () => {
    const strings: Record<string, unknown> = {
      price: {
        localizations: {
          en: { stringUnit: translated("%@ costs %.2f (%5d)") },
        },
      },
    };
    // flags are not read for implicit arguments: prose with a percent sign
    const prose = [
      "50% off",
      "50%-off",
      "10%-ige Ermäßigung",
      "20%-discount",
      "100%'s",
      "a +5%+bonus",
    ];
    for (const [index, value] of prose.entries())
      strings[`prose${index}`] = {
        localizations: { en: { stringUnit: translated(value) } },
      };
    const imported = await plugin.importFiles!({
      settings,
      files: [{ locale: "en", content: encode(catalog(strings)) }],
    });
    const variant = (bundleId: string) =>
      imported.variants.find(
        (variant) => variant.messageBundleId === bundleId,
      )!;
    expect(
      variant("price").pattern!.flatMap((part) =>
        part.type === "expression"
          ? [(part.annotation as any).options[0].value.value]
          : [],
      ),
    ).toEqual(["@", ".2f", "5d"]);
    for (const [index, value] of prose.entries())
      expect(variant(`prose${index}`).pattern, value).toEqual([
        { type: "text", value },
      ]);
    const [file] = await plugin.exportFiles!({
      settings,
      ...concretize(imported),
    });
    const exported = JSON.parse(decode(file!.content));
    expect(exported.strings.price.localizations.en.stringUnit.value).toBe(
      "%1$@ costs %2$.2f (%3$5d)",
    );
    for (const [index, value] of prose.entries())
      expect(
        exported.strings[`prose${index}`].localizations.en.stringUnit.value,
      ).toBe(value);
    compileWithXcode(file!.content);
  });

  test("reads Xcode's %arg placeholder as one argument", async () => {
    // what `xcstringstool extract` writes for an interpolation of unknown type
    const imported = await plugin.importFiles!({
      settings,
      files: [
        {
          locale: "en",
          content: encode(
            catalog({
              "Hello, %arg!": {},
              "Pos %arg %arg": {
                localizations: {
                  en: {
                    stringUnit: { state: "new", value: "Pos %1$arg %2$arg" },
                  },
                },
              },
            }),
          ),
        },
      ],
    });
    const arg = (position: number) => ({
      type: "expression",
      arg: { type: "variable-reference", name: `arg${position}` },
      annotation: {
        type: "function-reference",
        name: "apple-printf",
        options: [
          { name: "specifier", value: { type: "literal", value: "arg" } },
          {
            name: "position",
            value: { type: "literal", value: String(position) },
          },
        ],
      },
    });
    const pattern = (bundleId: string) =>
      imported.variants.find((variant) => variant.messageBundleId === bundleId)!
        .pattern;
    expect(pattern("Hello, %arg!")).toEqual([
      { type: "text", value: "Hello, " },
      arg(1),
      { type: "text", value: "!" },
    ]);
    expect(pattern("Pos %arg %arg")).toEqual([
      { type: "text", value: "Pos " },
      arg(1),
      { type: "text", value: " " },
      arg(2),
    ]);
    // a translation with the arguments in another order
    const data = concretize(imported);
    const message = data.messages.find(
      (message: any) => message.bundleId === "Pos %arg %arg",
    );
    data.messages.push({ ...message, id: "pos-de", locale: "de" });
    data.variants.push({
      id: "pos-de-variant",
      messageId: "pos-de",
      matches: [],
      pattern: [arg(2), { type: "text", value: " Pos " }, arg(1)],
    });
    const [file] = await plugin.exportFiles!({ settings, ...data });
    const exported = JSON.parse(decode(file!.content));
    expect(exported.strings["Pos %arg %arg"].localizations.de).toEqual({
      stringUnit: translated("%2$arg Pos %1$arg"),
    });
    expect(exported.strings["Hello, %arg!"]).toEqual({
      extractionState: "manual",
    });
    compileWithXcode(file!.content);
  });

  test("a direct plural translated as text without the number reads again", async () => {
    // e.g. "Ein Artikel" / "Viele Artikel"; before, the next import failed
    // because no variant and not the key has a numeric argument
    for (const en of [
      { one: "%lld item", other: "%lld items" },
      { one: "One item", other: "Many items" },
    ]) {
      const source = catalog({
        items_count: {
          extractionState: "manual",
          localizations: {
            de: {
              variations: {
                plural: {
                  one: { stringUnit: translated("Ein Artikel") },
                  other: { stringUnit: translated("Viele Artikel") },
                },
              },
            },
            en: {
              variations: {
                plural: {
                  one: { stringUnit: translated(en.one) },
                  other: { stringUnit: translated(en.other) },
                },
              },
            },
          },
        },
      });
      const imported = await plugin.importFiles!({
        settings,
        files: [{ locale: "en", content: encode(source) }],
      });
      const [file] = await plugin.exportFiles!({
        settings,
        ...concretize(imported),
      });
      const exported = JSON.parse(decode(file!.content));
      expect(exported.strings.items_count.localizations.de).toEqual(
        JSON.parse(source).strings.items_count.localizations.de,
      );
      // Xcode requires the number in the source language only
      if (en.one.includes("%")) compileWithXcode(file!.content);
    }
  });

  test("rejects duplicate identities", () => {
    expect(() =>
      plugin.exportFiles!({
        settings,
        bundles: [
          { id: "same", declarations: [] },
          { id: "same", declarations: [] },
        ],
        messages: [],
        variants: [],
      }),
    ).toThrow("Duplicate Apple .xcstrings bundle id");
  });

  test("preserves prototype-looking exact keys and rejects missing bundles", () => {
    const [file] = plugin.exportFiles!({
      settings,
      bundles: [{ id: "__proto__", declarations: [] }],
      messages: [
        {
          id: "message",
          bundleId: "__proto__",
          locale: "en",
          selectors: [],
        },
      ],
      variants: [
        {
          id: "variant",
          messageId: "message",
          matches: [],
          pattern: [{ type: "text", value: "safe" }],
        },
      ],
    }) as any[];
    expect(JSON.parse(decode(file!.content)).strings.__proto__).toBeTruthy();
    expect(() =>
      plugin.exportFiles!({
        settings,
        bundles: [],
        messages: [
          {
            id: "message",
            bundleId: "missing",
            locale: "en",
            selectors: [],
          },
        ],
        variants: [],
      }),
    ).toThrow("references missing bundle");
  });
});

function catalog(strings: Record<string, unknown>) {
  return JSON.stringify({ sourceLanguage: "en", strings, version: "1.0" });
}
function translated(value: string) {
  return { state: "translated", value };
}
function encode(value: string) {
  return new TextEncoder().encode(value);
}
function decode(value: Uint8Array) {
  return new TextDecoder().decode(value);
}
function compileWithXcode(content: Uint8Array) {
  if (process.platform !== "darwin") return;
  const directory = mkdtempSync(join(tmpdir(), "inlang-xcstrings-"));
  const input = join(directory, "Localizable.xcstrings");
  writeFileSync(input, content);
  execFileSync("xcrun", [
    "xcstringstool",
    "compile",
    input,
    "--output-directory",
    directory,
    "--serialization-format",
    "text",
  ]);
  expect(
    existsSync(join(directory, "en.lproj", "Localizable.strings")) ||
      existsSync(join(directory, "en.lproj", "Localizable.stringsdict")),
  ).toBe(true);
}
function concretize(
  imported: Awaited<ReturnType<NonNullable<typeof plugin.importFiles>>>,
) {
  const messages = imported.messages.map((message, index) => ({
    ...message,
    id: `message-${index}`,
  }));
  const variants = imported.variants.map((variant, index) => ({
    ...variant,
    id: `variant-${index}`,
    messageId: messages.find(
      (message) =>
        message.bundleId === variant.messageBundleId &&
        message.locale === variant.messageLocale,
    )!.id,
  }));
  return {
    bundles: imported.bundles as any,
    messages: messages as any,
    variants: variants as any,
  };
}
