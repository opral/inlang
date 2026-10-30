import { expect, it } from "vitest";
import type { Bundle, Message, Variant } from "@inlang/sdk";
import { plugin, PLUGIN_KEY } from "./plugin.js";
import { parseMessage } from "./parse.js";

const settings = {
  locales: ["en", "de"],
  baseLocale: "en",
  [PLUGIN_KEY]: {
    pathPattern: "./messages/{locale}.json",
  },
};

it("exports files", async () => {
  const {
    bundle: bundle1,
    message: message1,
    variants: variants1,
  } = buildMessage("sad_elephant", "Hello World", "Hallo Welt");
  const {
    bundle: bundle2,
    message: message2,
    variants: variants2,
  } = buildMessage("penjamin", "Greetings {name}", "Guten Tag {name}");

  const bundles: Bundle[] = [bundle1, bundle2];
  const messages: Message[] = [
    message1.en,
    message1.de,
    message2.en,
    message2.de,
  ];
  const variants: Variant[] = [
    ...variants1.en,
    ...variants1.de,
    ...variants2.en,
    ...variants2.de,
  ];

  const files = await plugin.exportFiles!({
    bundles,
    messages,
    variants,
    settings,
  });

  const utf8 = new TextDecoder("utf-8");
  const decoded = files.map((file) => JSON.parse(utf8.decode(file.content)));

  expect(decoded).toMatchInlineSnapshot(`
		[
		  {
		    "penjamin": "Greetings {name}",
		    "sad_elephant": "Hello World",
		  },
		  {
		    "penjamin": "Guten Tag {name}",
		    "sad_elephant": "Hallo Welt",
		  },
		]
	`);
});

it("toBeImportedFiles replaces the {locale} placeholder in every position", async () => {
  const files = await plugin.toBeImportedFiles!({
    settings: {
      baseLocale: "en",
      locales: ["en", "de"],
      [PLUGIN_KEY]: {
        pathPattern: "./messages/{locale}/{locale}.json",
      },
    },
  });
  expect(files).toEqual([
    { locale: "en", path: "./messages/en/en.json" },
    { locale: "de", path: "./messages/de/de.json" },
  ]);
});

it("toBeImportedFiles resolves the {language} placeholder to the primary language subtag", async () => {
  const files = await plugin.toBeImportedFiles!({
    settings: {
      baseLocale: "en-US",
      locales: ["en-US", "fr-FR", "zh-Hant-TW"],
      [PLUGIN_KEY]: {
        pathPattern: "./messages/{language}.json",
      },
    },
  });
  expect(files).toEqual([
    { locale: "en-US", path: "./messages/en.json" },
    { locale: "fr-FR", path: "./messages/fr.json" },
    { locale: "zh-Hant-TW", path: "./messages/zh.json" },
  ]);
});

it("exportFiles resolves the {language} placeholder in the file name", async () => {
  const { bundle, message: message1, variants: variants1 } = buildMessage(
    "sad_elephant",
    "Hello World",
    "Hallo Welt"
  );
  const files = await plugin.exportFiles!({
    bundles: [bundle],
    messages: [message1.en, message1.de],
    variants: [...variants1.en, ...variants1.de],
    settings: {
      baseLocale: "en",
      locales: ["en", "de"],
      [PLUGIN_KEY]: {
        pathPattern: "./messages/{language}.json",
      },
    },
  });
  expect(files.map((file) => file.name)).toEqual([
    "./messages/en.json",
    "./messages/de.json",
  ]);
});

function buildMessage(
  id: string,
  en: string,
  de: string,
): {
  bundle: Bundle;
  message: { en: Message; de: Message };
  variants: { en: Variant[]; de: Variant[] };
} {
  const parsedEn = parseMessage({
    bundleId: id,
    locale: "en",
    messageSource: en,
  });
  const parsedDe = parseMessage({
    bundleId: id,
    locale: "de",
    messageSource: de,
  });
  const bundle: Bundle = {
    id,
    declarations: [...parsedEn.declarations, ...parsedDe.declarations],
  };

  const enMessageId = `${id}-en`;
  const deMessageId = `${id}-de`;

  return {
    bundle,
    message: {
      en: {
        id: enMessageId,
        bundleId: id,
        locale: "en",
        selectors: parsedEn.selectors,
      },
      de: {
        id: deMessageId,
        bundleId: id,
        locale: "de",
        selectors: parsedDe.selectors,
      },
    },
    variants: {
      en: parsedEn.variants.map((variant, index) => ({
        id: `${enMessageId}-${index}`,
        messageId: enMessageId,
        matches: variant.matches ?? [],
        pattern: variant.pattern ?? [],
      })),
      de: parsedDe.variants.map((variant, index) => ({
        id: `${deMessageId}-${index}`,
        messageId: deMessageId,
        matches: variant.matches ?? [],
        pattern: variant.pattern ?? [],
      })),
    },
  };
}
