const siteUrl = "https://inlang.com";

const ogImage =
  "https://cdn.jsdelivr.net/gh/opral/inlang@latest/packages/website/public/opengraph/inlang-social-image.jpg";

/** English text of a registry field that is a string or a translation map. */
export const textOf = (value: unknown) =>
  typeof value === "object" && value !== null
    ? String((value as { en?: string }).en ?? "")
    : String(value ?? "");

/** Absolute URL of a marketplace item page, as the category cards link to it. */
export const marketplaceItemUrl = (item: { uniqueID: string; id: string }) =>
  `${siteUrl}/m/${item.uniqueID}/${item.id.replaceAll(".", "-")}`;

export type CategoryItem = {
  name: string;
  description: string;
  /** Absolute URL of the page the card links to. */
  url: string;
};

type CategoryHeadInput = {
  /** Path of the category page, for example `/c/plugins`. */
  path: string;
  title: string;
  description: string;
  items: CategoryItem[];
};

/** CollectionPage with an ItemList of the cards on a category page. */
export function buildCategoryJsonLd(input: CategoryHeadInput) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: input.title,
    description: input.description,
    url: `${siteUrl}${input.path}`,
    isPartOf: { "@type": "WebSite", name: "inlang", url: siteUrl },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: input.items.length,
      itemListElement: input.items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "SoftwareApplication",
          name: item.name,
          description: item.description,
          url: item.url,
          applicationCategory: "DeveloperApplication",
        },
      })),
    },
  };
}

/** Head tags for a category page: meta, canonical link and JSON-LD. */
export function buildCategoryHead(input: CategoryHeadInput) {
  const url = `${siteUrl}${input.path}`;
  return {
    meta: [
      { title: input.title },
      { name: "description", content: input.description },
      { property: "og:title", content: input.title },
      { property: "og:description", content: input.description },
      { property: "og:url", content: url },
      { property: "og:type", content: "website" },
      { property: "og:image", content: ogImage },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: input.title },
      { name: "twitter:description", content: input.description },
      { name: "twitter:image", content: ogImage },
      { name: "twitter:site", content: "@inlanghq" },
      { name: "twitter:creator", content: "@inlanghq" },
    ],
    links: [{ rel: "canonical", href: url }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(buildCategoryJsonLd(input)),
      },
    ],
  };
}
