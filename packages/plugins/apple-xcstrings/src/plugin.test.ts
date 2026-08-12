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
                    one: { stringUnit: translated("%1$@ has %2$d item") },
                    other: { stringUnit: translated("%1$@ has %2$d items") },
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
    ).toBe("You have %1$@ has %2$d items remaining");
    compileWithXcode(file!.content);
  });

  test("imports and compiles standard direct plural variations", async () => {
    const source = catalog({
      "%1$lld item(s)": {
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
      JSON.parse(decode(file!.content)).strings["%1$lld item(s)"].localizations
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
        files: [{ locale: "en", content: encode(catalog({ sourceOnly: {} })) }],
      }),
    ).toThrow("source-only entry");
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

  test("rejects ambiguous printf arguments and duplicate identities", () => {
    for (const value of ["%1$@ %d", "%1$@ %1$d"]) {
      expect(() =>
        plugin.importFiles!({
          settings,
          files: [
            {
              locale: "en",
              content: encode(
                catalog({
                  bad: {
                    localizations: { en: { stringUnit: translated(value) } },
                  },
                }),
              ),
            },
          ],
        }),
      ).toThrow();
    }
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
