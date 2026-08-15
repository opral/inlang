import { describe, expect, test } from "vitest";
import { loadProjectInMemory, newProject } from "@inlang/sdk";
import { plugin as icuPlugin } from "../../icu1/src/plugin.js";
import { plugin, PLUGIN_KEY } from "./plugin.js";

const settings = {
  baseLocale: "en",
  locales: ["en"],
  modules: [],
  [PLUGIN_KEY]: { pathPattern: "./res/values{locale}/strings.xml" },
  "plugin.inlang.icu-messageformat-1": {
    pathPattern: "./messages/{locale}.json",
  },
};

describe("Android resources plugin", () => {
  test("round-trips exact keys, escaping, variables, and plurals", async () => {
    const source = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="ManageSale.PricePlaceholder">Hello %1$s &amp; welcome</string>
  <plurals name="cart_items">
    <item quantity="one">%1$d item</item>
    <item quantity="other">%1$d items</item>
  </plurals>
</resources>`;
    const imported = await plugin.importFiles!({
      settings,
      files: [{ locale: "en", content: new TextEncoder().encode(source) }],
    });
    expect(imported.bundles.map((bundle) => bundle.id)).toEqual([
      "ManageSale.PricePlaceholder",
      "cart_items",
    ]);
    const withIds = {
      bundles: imported.bundles as any,
      messages: imported.messages.map((message, index) => ({
        ...message,
        id: `message-${index}`,
      })) as any,
      variants: imported.variants.map((variant, index) => ({
        ...variant,
        id: `variant-${index}`,
        messageId: `message-${imported.messages.findIndex(
          (message) =>
            message.bundleId === variant.messageBundleId &&
            message.locale === variant.messageLocale,
        )}`,
      })) as any,
    };
    const [file] = await plugin.exportFiles!({ ...withIds, settings });
    const output = new TextDecoder().decode(file!.content);
    expect(output).toContain('name="ManageSale.PricePlaceholder"');
    expect(output).toContain("Hello %1$s &amp; welcome");
    expect(output).toContain('<plurals name="cart_items">');
    expect(output).toContain('quantity="one"');
    expect(output).toContain("%1$d item");
    const roundtrip = await plugin.importFiles!({ settings, files: [file!] });
    expect(roundtrip.bundles.map((bundle) => bundle.id)).toEqual(
      imported.bundles.map((bundle) => bundle.id),
    );
  });

  test("preserves printf types, positions, repetition, literals, and Android escaping", async () => {
    const source = `<resources>
  <string name="types">"id=%2$d price=%1$.2f name=%3$s again=%2$d 100%% \\n @home ?query"</string>
</resources>`;
    const imported = await plugin.importFiles!({
      settings,
      files: [{ locale: "en", content: new TextEncoder().encode(source) }],
    });
    expect(imported.variants[0]!.pattern).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "expression",
          annotation: expect.objectContaining({ name: "android-printf" }),
        }),
        expect.objectContaining({
          type: "text",
          value: expect.stringContaining("100%"),
        }),
      ]),
    );
    const withIds = identify(imported);
    const [file] = await plugin.exportFiles!({ ...withIds, settings });
    const output = new TextDecoder().decode(file!.content);
    expect(output).toContain("%2$d");
    expect(output).toContain("%1$.2f");
    expect(output).toContain("%3$s");
    expect(output).toContain("100%%");
  });

  test("round-trips standalone escaped percent literals", async () => {
    const imported = await plugin.importFiles!({
      settings,
      files: [
        {
          locale: "en",
          content: new TextEncoder().encode(
            '<resources><string name="literal">%%s %%d %%f %%</string></resources>',
          ),
        },
      ],
    });
    expect(imported.variants[0]!.pattern).toEqual([
      { type: "text", value: "%%s %%d %%f %%" },
    ]);
    const [file] = await plugin.exportFiles!({
      ...identify(imported),
      settings,
    });
    expect(new TextDecoder().decode(file!.content)).toContain("%%s %%d %%f %%");
  });

  test.each(["Save 20%", "100% complete", "100%%"])(
    "preserves plain percent text exactly: %s",
    async (value) => {
      const imported = await plugin.importFiles!({
        settings,
        files: [
          {
            locale: "en",
            content: new TextEncoder().encode(
              `<resources><string name="plain_percent">${value}</string></resources>`,
            ),
          },
        ],
      });
      expect(imported.variants[0]!.pattern).toEqual([{ type: "text", value }]);
      const [file] = await plugin.exportFiles!({
        ...identify(imported),
        settings,
      });
      expect(new TextDecoder().decode(file!.content)).toContain(`"${value}"`);
    },
  );

  test("exports canonical ICU1 plurals through the SDK and preserves exact keys", async () => {
    const project = await loadProjectInMemory({
      blob: await newProject({ settings }),
      providePlugins: [icuPlugin as any, plugin as any],
    });
    try {
      await project.importFiles({
        pluginKey: icuPlugin.key,
        files: [
          {
            locale: "en",
            content: new TextEncoder().encode(
              JSON.stringify({
                cart_items_exact:
                  "{count, plural, one {{count} item} other {{count} items}}",
              }),
            ),
          },
        ],
      });
      const [file] = await project.exportFiles({ pluginKey: plugin.key });
      const output = new TextDecoder().decode(file!.content);
      expect(output).toContain('name="cart_items_exact"');
      expect(output).toContain('quantity="other"');
    } finally {
      await project.close();
    }
  });

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
            '<resources><string name="typed_value">%2$d / %1$.2f / %3$s</string></resources>',
          ),
        },
      ];
      await project.importFiles({ pluginKey: plugin.key, files });
      await project.importFiles({ pluginKey: plugin.key, files });
      const [file] = await project.exportFiles({ pluginKey: plugin.key });
      expect(new TextDecoder().decode(file!.content)).toContain(
        "%2$d / %1$.2f / %3$s",
      );
      expect(
        await project.db.selectFrom("message").selectAll().execute(),
      ).toHaveLength(1);
    } finally {
      await project.close();
    }
  });

  test("rejects malformed, unnamed, duplicate, and mixed-content XML", async () => {
    for (const source of [
      '<resources><string name="broken">oops</resources>',
      "<resources><string>missing</string></resources>",
      '<resources><string name="same">a</string><string name="same">b</string></resources>',
      '<resources><string name="rich">before <b>bold</b> after</string></resources>',
      '<resources><plurals name="dup"><item quantity="other">a</item><item quantity="other">b</item></plurals></resources>',
      '<resources><plurals name="missing"><item quantity="one">a</item></plurals></resources>',
    ]) {
      expect(() =>
        plugin.importFiles!({
          settings,
          files: [{ locale: "en", content: new TextEncoder().encode(source) }],
        }),
      ).toThrow();
    }
  });

  test("rejects selectors that Android resources cannot represent", async () => {
    expect(() =>
      plugin.exportFiles!({
        settings,
        bundles: [{ id: "greeting", declarations: [] }],
        messages: [
          {
            id: "message",
            bundleId: "greeting",
            locale: "en",
            selectors: [{ type: "variable-reference", name: "gender" }],
          },
        ],
        variants: [],
      }),
    ).toThrow("require one selector backed by a cardinal plural declaration");
  });

  test.each(["cart/items", "has space", "1leading", ".leading", "-leading"])(
    "rejects an unrepresentable key without rewriting it: %s",
    (id) => {
      expect(() =>
        plugin.exportFiles!({
          settings,
          bundles: [{ id, declarations: [] }],
          messages: [
            { id: "message", bundleId: id, locale: "en", selectors: [] },
          ],
          variants: [
            {
              id: "variant",
              messageId: "message",
              matches: [],
              pattern: [{ type: "text", value: "value" }],
            },
          ],
        }),
      ).toThrow("cannot preserve resource key");
    },
  );
});

function identify(
  imported: Awaited<ReturnType<NonNullable<typeof plugin.importFiles>>>,
) {
  const messages = imported.messages.map((message, index) => ({
    ...message,
    id: `message-${index}`,
  }));
  return {
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
  };
}
