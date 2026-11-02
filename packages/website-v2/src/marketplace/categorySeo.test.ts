import { describe, expect, it } from "vitest";
import {
  buildCategoryHead,
  buildCategoryJsonLd,
  marketplaceItemUrl,
  textOf,
} from "./categorySeo";

const input = {
  path: "/c/plugins",
  title: "Plugins for any translation format | inlang",
  description: "inlang plugins import and export translation files.",
  items: [
    {
      name: "i18next",
      description: "Reads and writes i18next JSON.",
      url: "https://inlang.com/m/3i8bor92/plugin-inlang-i18next",
    },
    {
      name: "Android Resources",
      description: "Reads and writes strings.xml.",
      url: "https://inlang.com/m/andr0id2/plugin-inlang-android",
    },
  ],
};

describe("category seo helpers", () => {
  it("reads english text from a string or a translation map", () => {
    expect(textOf("Plain")).toBe("Plain");
    expect(textOf({ en: "English", de: "Deutsch" })).toBe("English");
    expect(textOf(undefined)).toBe("");
  });

  it("builds the absolute item url from the id", () => {
    expect(
      marketplaceItemUrl({
        uniqueID: "3i8bor92",
        id: "plugin.inlang.i18next",
      }),
    ).toBe("https://inlang.com/m/3i8bor92/plugin-inlang-i18next");
  });

  it("lists every card in an ItemList inside a CollectionPage", () => {
    const jsonLd = buildCategoryJsonLd(input);

    expect(jsonLd["@type"]).toBe("CollectionPage");
    expect(jsonLd.url).toBe("https://inlang.com/c/plugins");
    expect(jsonLd.mainEntity.numberOfItems).toBe(2);
    expect(jsonLd.mainEntity.itemListElement[1]).toMatchObject({
      position: 2,
      item: { name: "Android Resources", url: input.items[1].url },
    });
  });

  it("sets title, description, canonical link and JSON-LD", () => {
    const head = buildCategoryHead(input);

    expect(head.meta[0]).toEqual({ title: input.title });
    expect(head.meta).toContainEqual({
      name: "description",
      content: input.description,
    });
    expect(head.meta).toContainEqual({
      property: "og:url",
      content: "https://inlang.com/c/plugins",
    });
    expect(head.links).toEqual([
      { rel: "canonical", href: "https://inlang.com/c/plugins" },
    ]);
    expect(JSON.parse(head.scripts[0].children)["@type"]).toBe(
      "CollectionPage",
    );
  });
});
