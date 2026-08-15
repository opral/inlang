import { describe, expect, test } from "vitest";
import { loadProjectInMemory, newProject } from "@inlang/sdk";
import { plugin, PLUGIN_KEY } from "./plugin.js";

const settings = {
  baseLocale: "en",
  locales: ["en"],
  modules: [],
  [PLUGIN_KEY]: {
    pathPattern: "./Localizations/{locale}.lproj/Localizable.strings",
  },
};

describe("Apple strings plugin", () => {
  test("round-trips exact keys, escapes, Unicode, and positional variables", async () => {
    const source = `/* Translator note */
"ManageSale.PricePlaceholder" = "Hello \\"world\\" %1$@";
"member.你好" = "你好";
`;
    const imported = await plugin.importFiles!({
      settings,
      files: [{ locale: "en", content: new TextEncoder().encode(source) }],
    });
    expect(imported.bundles.map((bundle) => bundle.id)).toEqual([
      "ManageSale.PricePlaceholder",
      "member.你好",
    ]);
    const messages = imported.messages.map((message, index) => ({
      ...message,
      id: `message-${index}`,
    }));
    const variants = imported.variants.map((variant, index) => ({
      ...variant,
      id: `variant-${index}`,
      messageId: `message-${imported.messages.findIndex(
        (message) =>
          message.bundleId === variant.messageBundleId &&
          message.locale === variant.messageLocale,
      )}`,
    }));
    const [file] = await plugin.exportFiles!({
      settings,
      bundles: imported.bundles as any,
      messages: messages as any,
      variants: variants as any,
    });
    const output = new TextDecoder().decode(file!.content);
    expect(output).toContain(
      '"ManageSale.PricePlaceholder" = "Hello \\"world\\" %1$@";',
    );
    expect(output).toContain('"member.你好" = "你好";');
    const roundtrip = await plugin.importFiles!({ settings, files: [file!] });
    expect(roundtrip.bundles.map((bundle) => bundle.id)).toEqual(
      imported.bundles.map((bundle) => bundle.id),
    );
  });

  test("preserves format types, positions, repetitions, literal percent, and comment-looking text", async () => {
    const source = `/* real comment */
"types/key" = "go // home /* literal */ %2$lld %1$.2f %3$@ %2$lld 100%%";
"unicode" = "\\U4F60\\U597D";
`;
    const imported = await plugin.importFiles!({
      settings,
      files: [{ locale: "en", content: new TextEncoder().encode(source) }],
    });
    expect(imported.bundles.map((bundle) => bundle.id)).toEqual([
      "types/key",
      "unicode",
    ]);
    expect(imported.variants[0]!.pattern).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          value: expect.stringContaining("go // home /* literal */"),
        }),
        expect.objectContaining({
          type: "expression",
          annotation: expect.objectContaining({ name: "apple-printf" }),
        }),
        expect.objectContaining({
          type: "text",
          value: expect.stringContaining("100%"),
        }),
      ]),
    );
    expect(imported.variants[1]!.pattern).toEqual([
      { type: "text", value: "你好" },
    ]);
    const messages = imported.messages.map((message, index) => ({
      ...message,
      id: `message-${index}`,
    }));
    const [file] = await plugin.exportFiles!({
      settings,
      bundles: imported.bundles as any,
      messages: messages as any,
      variants: imported.variants.map((variant, index) => ({
        ...variant,
        id: `variant-${index}`,
        messageId: messages.find(
          (message) =>
            message.bundleId === variant.messageBundleId &&
            message.locale === variant.messageLocale,
        )!.id,
      })) as any,
    });
    const output = new TextDecoder().decode(file!.content);
    expect(output).toContain("%2$lld %1$.2f %3$@ %2$lld 100%%");
    expect(output).toContain('"types/key"');
  });

  test("rejects duplicates and unsupported format syntax", async () => {
    for (const source of [
      '"same" = "a"; "same" = "b";',
      '"bad" = "%1$Q";',
      '"bad" = "\\a";',
    ]) {
      expect(() =>
        plugin.importFiles!({
          settings,
          files: [{ locale: "en", content: new TextEncoder().encode(source) }],
        }),
      ).toThrow();
    }
  });

  test("round-trips standalone escaped percent literals", async () => {
    const imported = await plugin.importFiles!({
      settings,
      files: [
        {
          locale: "en",
          content: new TextEncoder().encode('"literal" = "%%@ %%d %%f %%";'),
        },
      ],
    });
    expect(imported.variants[0]!.pattern).toEqual([
      { type: "text", value: "%%@ %%d %%f %%" },
    ]);
    const messages = [{ ...imported.messages[0]!, id: "message" }];
    const [file] = await plugin.exportFiles!({
      settings,
      bundles: imported.bundles as any,
      messages: messages as any,
      variants: [
        { ...imported.variants[0]!, id: "variant", messageId: "message" },
      ] as any,
    });
    expect(new TextDecoder().decode(file!.content)).toContain("%%@ %%d %%f %%");
  });

  test.each(["Save 20%", "100% complete", "100%%"])(
    "preserves plain percent text exactly: %s",
    async (value) => {
      const imported = await plugin.importFiles!({
        settings,
        files: [
          {
            locale: "en",
            content: new TextEncoder().encode(`"plain" = "${value}";`),
          },
        ],
      });
      expect(imported.variants[0]!.pattern).toEqual([{ type: "text", value }]);
      const [file] = await plugin.exportFiles!({
        settings,
        bundles: imported.bundles as any,
        messages: [{ ...imported.messages[0]!, id: "message" }] as any,
        variants: [
          { ...imported.variants[0]!, id: "variant", messageId: "message" },
        ] as any,
      });
      expect(new TextDecoder().decode(file!.content)).toContain(`"${value}"`);
    },
  );

  test("imports annotated printf expressions through the SDK lifecycle", async () => {
    const project = await loadProjectInMemory({
      blob: await newProject({ settings }),
      providePlugins: [plugin as any],
    });
    try {
      const files = [
        {
          locale: "en",
          content: new TextEncoder().encode(
            '"typed/value" = "%2$lld / %1$.2f / %3$@";\n"Cancel";',
          ),
        },
      ];
      await project.importFiles({ pluginKey: plugin.key, files });
      await project.importFiles({ pluginKey: plugin.key, files });
      const [file] = await project.exportFiles({ pluginKey: plugin.key });
      const output = new TextDecoder().decode(file!.content);
      expect(output).toContain('"typed/value" = "%2$lld / %1$.2f / %3$@";');
      expect(output).toContain('"Cancel" = "Cancel";');
      expect(
        await project.db.selectFrom("message").selectAll().execute(),
      ).toHaveLength(2);
    } finally {
      await project.close();
    }
  });

  test("rejects plurals instead of silently dropping variants", async () => {
    expect(() =>
      plugin.exportFiles!({
        settings,
        bundles: [{ id: "cart.items", declarations: [] }],
        messages: [
          {
            id: "message",
            bundleId: "cart.items",
            locale: "en",
            selectors: [{ type: "variable-reference", name: "countPlural" }],
          },
        ],
        variants: [],
      }),
    ).toThrow("cannot represent selectors or plurals");
  });
});
