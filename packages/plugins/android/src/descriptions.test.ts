import { expect, test } from "vitest";
import { plugin, PLUGIN_KEY } from "./plugin.js";
const settings = {
  baseLocale: "en",
  locales: ["en", "de"],
  modules: [],
  [PLUGIN_KEY]: { pathPattern: "./res/values{locale}/strings.xml" },
};
const sdkCapabilities = ["bundle-description"];
const encode = (value: string) => new TextEncoder().encode(value);
const decode = (value: Uint8Array) => new TextDecoder().decode(value);
const source =
  '<!-- License -->\n<resources>\n  <!-- Button guidance -->\n  <string name="save">Save</string>\n</resources>\n';
const target =
  '<resources>\n  <!-- Target-only note -->\n  <string name="save">Speichern</string>\n</resources>\n';

test("descriptions import from source, survive description-only edits, clear, and preserve target notes", async () => {
  const files = [
    { locale: "en", content: encode(source), path: "en.xml", imported: true },
    { locale: "de", content: encode(target), path: "de.xml", imported: true },
  ];
  for (const ordered of [files, [...files].reverse()]) {
    const imported = await plugin.importFiles!({
      settings,
      sdkCapabilities,
      files: ordered,
    });
    expect(imported.bundles[0]?.description).toBe("Button guidance");
    const rows = concrete(imported);
    rows.bundles[0]!.description = "New guidance";
    const exported = await plugin.exportFiles!({
      settings,
      sdkCapabilities,
      files,
      ...rows,
    });
    const en = exported.find((file) => file.locale === "en")!;
    expect(decode(en.content)).toContain("<!-- New guidance -->");
    expect(decode(en.content)).toContain("License");
    expect(decode(exported.find((file) => file.locale === "de")!.content)).toBe(
      target,
    );
    const reopened = await plugin.importFiles!({
      settings,
      sdkCapabilities,
      files: exported,
    });
    expect(reopened.bundles[0]?.description).toBe("New guidance");
    rows.bundles[0]!.description = null;
    const cleared = await plugin.exportFiles!({
      settings,
      sdkCapabilities,
      files: exported.map((file) => ({
        ...file,
        path: file.name,
        imported: true,
      })),
      ...rows,
    });
    const reimported = await plugin.importFiles!({
      settings,
      sdkCapabilities,
      files: cleared,
    });
    expect(reimported.bundles[0]?.description).toBe(null);
    expect(
      decode(cleared.find((file) => file.locale === "en")!.content),
    ).not.toContain("New guidance");
  }
});

test("older hosts and target-only imports do not receive description patches", async () => {
  const legacy = await plugin.importFiles!({
    settings,
    files: [{ locale: "en", content: encode(source) }],
  });
  expect(legacy.bundles[0]).not.toHaveProperty("description");
  const partial = await plugin.importFiles!({
    settings,
    sdkCapabilities,
    files: [{ locale: "de", content: encode(target) }],
  });
  expect(partial.bundles[0]).not.toHaveProperty("description");
});

function concrete(
  imported: Awaited<ReturnType<NonNullable<typeof plugin.importFiles>>>,
) {
  const messages = imported.messages.map((message, index) => ({
    ...message,
    id: `m${index}`,
    selectors: message.selectors ?? [],
  }));
  return {
    bundles: imported.bundles.map((bundle) => ({
      ...bundle,
      id: bundle.id!,
      declarations: bundle.declarations ?? [],
    })),
    messages,
    variants: imported.variants.map((variant, index) => ({
      ...variant,
      id: `v${index}`,
      matches: variant.matches ?? [],
      pattern: variant.pattern ?? [],
      messageId: messages.find(
        (message) =>
          message.bundleId === variant.messageBundleId &&
          message.locale === variant.messageLocale,
      )!.id,
    })),
  };
}

test("group headings stay metadata and a new description attaches to exactly one entry", async () => {
  const files = [
    {
      locale: "en",
      path: "en",
      imported: true,
      content: encode(
        '<resources>\n<!-- Group heading -->\n<string name="first">First</string>\n<string name="second">Second</string>\n</resources>',
      ),
    },
  ];
  const imported = await plugin.importFiles!({
    settings,
    sdkCapabilities,
    files,
  });
  expect(imported.bundles.every((bundle) => bundle.description === null)).toBe(
    true,
  );
  const rows = concrete(imported);
  rows.bundles.find((bundle) => bundle.id === "first")!.description =
    "Only first";
  const exported = await plugin.exportFiles!({
    settings,
    sdkCapabilities,
    files,
    ...rows,
  });
  const reopened = await plugin.importFiles!({
    settings,
    sdkCapabilities,
    files: exported,
  });
  expect(
    reopened.bundles.find((bundle) => bundle.id === "first")!.description,
  ).toBe("Only first");
  expect(
    reopened.bundles.find((bundle) => bundle.id === "second")!.description,
  ).toBe(null);
  expect(decode(exported[0]!.content)).toContain("Group heading");
});

test("description-aware no-op export preserves a UTF-8 BOM and CRLF", async () => {
  const text = "\uFEFF" + source.replace(/\n/g, "\r\n");
  const files = [
    { locale: "en", path: "en", imported: true, content: encode(text) },
  ];
  const imported = await plugin.importFiles!({
    settings,
    sdkCapabilities,
    files,
  });
  expect(imported.bundles[0]?.description).toBe("Button guidance");
  const exported = await plugin.exportFiles!({
    settings,
    sdkCapabilities,
    files,
    ...concrete(imported),
  });
  expect(exported[0]!.content).toEqual(files[0]!.content);
});

test("target-only descriptions do not modify excluded source resources", async () => {
  const text =
    '<resources>\n<!-- Keep native metadata -->\n<string name="save" translatable="false">Save</string>\n\n<string name="other">Other</string>\n</resources>';
  const files = [
    { locale: "en", path: "en", imported: true, content: encode(text) },
    { locale: "de", path: "de", imported: true, content: encode(target) },
  ];
  const imported = await plugin.importFiles!({
    settings,
    sdkCapabilities,
    files,
  });
  const rows = concrete(imported);
  rows.bundles.find((bundle) => bundle.id === "save")!.description =
    "Target-only shared guidance";
  const exported = await plugin.exportFiles!({
    settings,
    sdkCapabilities,
    files,
    ...rows,
  });
  expect(decode(exported.find((file) => file.locale === "en")!.content)).toBe(
    text,
  );
});
