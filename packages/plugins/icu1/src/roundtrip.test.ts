import { expect, test } from "vitest";
import { plugin, PLUGIN_KEY } from "./plugin.js";
import { parseMessage } from "./parse.js";

const pathPattern = "./messages/{locale}.json";

const settings = {
  locales: ["en", "de"],
  baseLocale: "en",
  [PLUGIN_KEY]: {
    pathPattern,
  },
};

test("roundtrip: simple strings and variables", async () => {
  const input = {
    en: {
      hello_world: "Hello World",
      greeting: "Hello {name}",
    },
    de: {
      hello_world: "Hallo Welt",
      greeting: "Hallo {name}",
    },
  };

  const imported = await runImportFiles(input);
  const exported = await runExportFilesParsed(imported);

  expect(exported).toStrictEqual(input);
});

test("roundtrip: plural and select", async () => {
  const input = {
    en: {
      likes: "You have {count, plural, one {# like} other {# likes}}",
      gender: "{gender, select, male {He} female {She} other {They}}",
    },
    de: {
      likes: "Du hast {count, plural, one {# Like} other {# Likes}}",
      gender: "{gender, select, male {Er} female {Sie} other {Sie}}",
    },
  };

  const imported = await runImportFiles(input);
  const exported = await runExportFilesParsed(imported);

  expect(exported).toStrictEqual(input);
});

test("roundtrip: exact plural matches and offsets", async () => {
  const input = {
    en: {
      items:
        "{count, plural, offset:1 =0 {no items} one {# item} other {# items}}",
    },
  };

  const imported = await runImportFiles(input);
  const exported = await runExportFilesParsed(imported);

  expect(exported).toStrictEqual(input);
});

test("roundtrip: selectordinal", async () => {
  const input = {
    en: {
      rank: "{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}",
    },
  };

  const imported = await runImportFiles(input);
  const exported = await runExportFilesParsed(imported);

  expect(exported).toStrictEqual(input);
});

test("roundtrip: nested select and plural", async () => {
  const input = {
    en: {
      badge:
        "{gender, select, male {He has {count, plural, one {# badge} other {# badges}}} female {She has {count, plural, one {# badge} other {# badges}}} other {They have {count, plural, one {# badge} other {# badges}}}}",
    },
  };

  const imported = await runImportFiles(input);
  const exported = await runExportFilesParsed(imported);

  expect(exported).toStrictEqual(input);
});

test("roundtrip: formatter styles", async () => {
  const input = {
    en: {
      amount: "Total: {value, number, currency}",
      time: "Time: {when, time, short}",
      date: "Date: {when, date, long}",
    },
  };

  const imported = await runImportFiles(input);
  const exported = await runExportFilesParsed(imported);

  expect(exported).toStrictEqual(input);
});

test("roundtrip: escaped braces and apostrophes", async () => {
  const input = {
    en: {
      braces: "Use '{' and '}' literally.",
      apostrophe: "It''s nice to escape apostrophes.",
    },
  };

  const imported = await runImportFiles(input);
  const exported = await runExportFilesParsed(imported);

  expect(exported).toStrictEqual(input);
});

test("roundtrip: literal # outside plural and escaped # inside plural", async () => {
  const input = {
    en: {
      hash: "Ticket #123",
      escapedHash: "{count, plural, one {'#' item} other {'#' items}}",
    },
  };

  const imported = await runImportFiles(input);
  const exported = await runExportFilesParsed(imported);

  expect(exported).toStrictEqual(input);
});

test("roundtrip: shared prefix and suffix with select", async () => {
  const input = {
    en: {
      alert:
        "Warning: {level, select, low {battery} high {overheating} other {unknown}} detected!",
    },
  };

  const imported = await runImportFiles(input);
  const exported = await runExportFilesParsed(imported);

  expect(exported).toStrictEqual(input);
});

test("roundtrip: nested selectors with shared prefixes", async () => {
  const input = {
    en: {
      message:
        "{role, select, admin {Admin {count, plural, one {# task} other {# tasks}}} user {User {count, plural, one {# task} other {# tasks}}} other {Guest {count, plural, one {# task} other {# tasks}}}}",
    },
  };

  const imported = await runImportFiles(input);
  const exported = await runExportFilesParsed(imported);

  expect(exported).toStrictEqual(input);
});

test("roundtrip: shared nested plural gains exact branch later", async () => {
  const input = {
    en: {
      nested:
        "{gender, select, male {{n, plural, one {one} other {many}}} female {{n, plural, =0 {zero} other {many}}} other {fallback}}",
    },
  };

  const imported = await runImportFiles(input);
  const exported = await runExportFilesParsed(imported);

  expect(exported).toStrictEqual(input);
});

test("roundtrip: complex function params", async () => {
  const input = {
    en: {
      skeleton: "Total: {value, number, ::currency/GBP}",
      named: "Distance: {value, number, ::unit/km}",
    },
  };

  const imported = await runImportFiles(input);
  const exported = await runExportFilesParsed(imported);

  expect(exported).toStrictEqual(input);
});

test("roundtrip: strict apostrophe escaping patterns", async () => {
  const input = {
    en: {
      quoted: "I said '{'hello'}' and then left.",
      mixed:
        "''{name}'' is quoted and {count, plural, one {'#' item} other {'#' items}}",
    },
  };

  const imported = await runImportFiles(input);
  const exported = await runExportFilesParsed(imported);

  expect(exported).toStrictEqual(input);
});

test("roundtrip: deeply nested select + plural + selectordinal", async () => {
  const input = {
    en: {
      status:
        "{role, select, admin {{count, plural, one {{place, selectordinal, one {#st alert} two {#nd alert} other {#th alert}}} other {{place, selectordinal, one {#st alerts} two {#nd alerts} other {#th alerts}}}}} user {{count, plural, one {{place, selectordinal, one {#st msg} two {#nd msg} other {#th msg}}} other {{place, selectordinal, one {#st msgs} two {#nd msgs} other {#th msgs}}}}} other {No alerts}}",
    },
  };

  const imported = await runImportFiles(input);
  const exported = await runExportFilesParsed(imported);

  expect(exported).toStrictEqual(input);
});

test("roundtrip: exact matches with offsets across cases", async () => {
  const input = {
    en: {
      invite:
        "{count, plural, offset:2 =0 {No invites} =1 {One invite} one {You and one other} other {You and # others}}",
    },
  };

  const imported = await runImportFiles(input);
  const exported = await runExportFilesParsed(imported);

  expect(exported).toStrictEqual(input);
});

test("roundtrip: # keeps the plural offset", async () => {
  const input = {
    en: {
      guests:
        "{count, plural, offset:1 =0 {Nobody} =1 {You} one {You and # other} other {You and # others}}",
    },
    de: {
      guests:
        "{count, plural, offset:1 =0 {Niemand} =1 {Du} one {Du und # weitere Person} other {Du und # weitere Personen}}",
    },
  };

  const imported = await runImportFiles(input);
  const exported = await runExportFilesParsed(imported);

  expect(exported).toStrictEqual(input);
});

test("roundtrip: # inside a select nested in a plural with offset", async () => {
  const input = {
    en: {
      party:
        "{count, plural, offset:2 other {{host, select, me {You and # guests} other {{host} and # guests}}}}",
    },
  };

  const imported = await runImportFiles(input);
  const exported = await runExportFilesParsed(imported);

  // the export hoists the shared "# guests" out of the select, which is
  // equivalent; the offset on # survives
  expectParsedMessageEquality(input.en.party, exported.en!.party!);
});

test("roundtrip: plurals and selects on the same argument", async () => {
  const input = {
    en: {
      deleted:
        "{count, plural, one {# file} other {# files}} {count, plural, one {was} other {were}} deleted",
      nested:
        "{count, plural, =0 {none} other {{count, plural, one {# item} other {# items}}}}",
    },
    de: {
      deleted:
        "{count, plural, one {# Datei wurde} other {# Dateien wurden}} gelöscht",
      nested: "{count, plural, =0 {keine} other {# Elemente}}",
    },
  };

  const imported = await runImportFiles(input);
  const exported = await runExportFilesParsed(imported);

  expect(exported).toStrictEqual(input);
});

test("roundtrip: nested function params inside selectors", async () => {
  const input = {
    en: {
      report:
        "{region, select, us {Revenue {value, number, ::currency/USD}} eu {Revenue {value, number, ::currency/EUR}} other {Revenue {value, number, ::currency/GBP}}}",
    },
  };

  const imported = await runImportFiles(input);
  const exported = await runExportFilesParsed(imported);

  expectParsedMessageEquality(input.en.report, exported.en!.report!);
});

async function runImportFiles(
  messagesByLocale: Record<string, Record<string, string>>,
) {
  const encoder = new TextEncoder();
  const files = Object.entries(messagesByLocale).map(([locale, messages]) => ({
    locale,
    content: encoder.encode(JSON.stringify(messages)),
  }));

  return plugin.importFiles!({
    files,
    settings,
  });
}

async function runExportFilesParsed(imported: {
  bundles: any[];
  messages: any[];
  variants: any[];
}) {
  assignIds(imported);
  const decoder = new TextDecoder("utf-8");
  const files = await plugin.exportFiles!({
    bundles: imported.bundles,
    messages: imported.messages,
    variants: imported.variants,
    settings,
  });

  const byLocale: Record<string, Record<string, string>> = {};
  for (const file of files) {
    byLocale[file.locale] = JSON.parse(decoder.decode(file.content));
  }

  return byLocale;
}

function assignIds(imported: {
  bundles: any[];
  messages: any[];
  variants: any[];
}) {
  for (const message of imported.messages) {
    if (!message.id) {
      message.id = `${message.bundleId}-${message.locale}`;
    }
  }
  for (const variant of imported.variants) {
    if (!variant.id) {
      variant.id = `${Math.random()}`;
    }
    if (!variant.messageId) {
      variant.messageId = imported.messages.find(
        (message: any) =>
          message.bundleId === variant.messageBundleId &&
          message.locale === variant.messageLocale,
      )?.id;
    }
  }
}

function expectParsedMessageEquality(left: string, right: string) {
  const leftParsed = parseMessage({
    messageSource: left,
    bundleId: "bundle",
    locale: "en",
  });
  const rightParsed = parseMessage({
    messageSource: right,
    bundleId: "bundle",
    locale: "en",
  });

  expect(rightParsed).toStrictEqual(leftParsed);
}
