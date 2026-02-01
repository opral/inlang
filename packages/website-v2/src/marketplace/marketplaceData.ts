import { parse } from "@opral/markdown-wc";
import { registry } from "@inlang/marketplace-registry";
import type { MarketplaceManifest } from "@inlang/marketplace-manifest";
import { redirect } from "@tanstack/react-router";
import { getLegacyRedirect } from "./legacyRedirects";

const localMarketplaceFiles = import.meta.glob<string>(
  "../../../../packages/**/*.{md,html}",
  {
    query: "?raw",
    import: "default",
  },
);
const marketplaceRootPrefix = "../../../../";

export type MarketplaceHeading = {
  id: string;
  text: string;
  level: number;
};

export type MarketplacePageData = {
  markdown: string;
  rawMarkdown: string;
  frontmatter?: Record<string, {}>;
  pagePath: string;
  manifest: MarketplaceManifest & { uniqueID: string };
  recommends?: MarketplaceManifest[];
  imports?: string[];
  headings: MarketplaceHeading[];
  prevPagePath?: string;
  nextPagePath?: string;
};

type MarketplaceMirrorSpec = {
  rawUrl: string;
  sourceUrl: string;
  sourceLabel: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  heroImage: string;
  heroImageAlt: string;
  ciImage: string;
  ciImageAlt: string;
  pitch: string;
};

const marketplaceMirrors: Record<
  string,
  Record<string, MarketplaceMirrorSpec>
> = {
  "library.inlang.paraglideJs": {
    "/tanstack-router": {
      rawUrl:
        "https://raw.githubusercontent.com/TanStack/router/main/examples/react/i18n-paraglide/README.md",
      sourceUrl:
        "https://github.com/TanStack/router/tree/main/examples/react/i18n-paraglide",
      sourceLabel: "TanStack/router",
      ogTitle: "The recommended i18n for TanStack Router",
      ogDescription:
        "Type-safe i18n with tiny bundles. Fully integrated with TanStack Router and tested in TanStack's CI/CD pipeline.",
      ogImage: "https://inlang.com/tanstack-router-banner.svg",
      heroImage: "https://inlang.com/tanstack-router-banner.svg",
      heroImageAlt: "Paraglide JS for TanStack Router overview",
      ciImage: "https://inlang.com/images/tanstack-ci-paraglide.svg",
      ciImageAlt: "Paraglide JS tested in TanStack CI/CD",
      pitch: [
        "- Fully type-safe with IDE autocomplete",
        "- SEO-friendly localized URLs",
        "- Works with CSR, SSR, and SSG",
        "- Tested as part of [TanStack's CI/CD pipeline](https://inlang.com/blog/tanstack-ci)",
      ].join("\n"),
    },
    "/tanstack-start": {
      rawUrl:
        "https://raw.githubusercontent.com/TanStack/router/main/examples/react/start-i18n-paraglide/README.md",
      sourceUrl:
        "https://github.com/TanStack/router/tree/main/examples/react/start-i18n-paraglide",
      sourceLabel: "TanStack/router",
      ogTitle: "The recommended i18n for TanStack Start",
      ogDescription:
        "Type-safe i18n with tiny bundles. Fully integrated with TanStack Start and tested in TanStack's CI/CD pipeline.",
      ogImage: "https://inlang.com/tanstack-start-banner.svg",
      heroImage: "https://inlang.com/tanstack-start-banner.svg",
      heroImageAlt: "Paraglide JS for TanStack Start overview",
      ciImage: "https://inlang.com/images/tanstack-ci-paraglide.svg",
      ciImageAlt: "Paraglide JS tested in TanStack CI/CD",
      pitch: [
        "- Fully type-safe with IDE autocomplete",
        "- SEO-friendly localized URLs",
        "- Works with CSR, SSR, and SSG",
        "- Tested as part of [TanStack's CI/CD pipeline](https://inlang.com/blog/tanstack-ci)",
      ].join("\n"),
    },
  },
};

export function getMarketplaceMirrorSpec(
  manifestId: string,
  pagePath: string,
): MarketplaceMirrorSpec | undefined {
  return marketplaceMirrors[manifestId]?.[pagePath];
}

export function isMarketplaceMirrorPage(
  manifestId: string,
  pagePath: string,
): boolean {
  return Boolean(getMarketplaceMirrorSpec(manifestId, pagePath));
}

export async function loadMarketplacePage({
  uid,
  slug,
  splat,
}: {
  uid: string;
  slug: string;
  splat?: string;
}): Promise<MarketplacePageData> {
  const legacyRedirect = getLegacyRedirect(uid);
  if (legacyRedirect) {
    throw redirect({
      to: legacyRedirect.to,
      statusCode: legacyRedirect.statusCode,
    });
  }
  const item = registry.find((entry: any) => entry.uniqueID === uid) as
    | (MarketplaceManifest & { uniqueID: string })
    | undefined;

  if (!item) {
    throw redirect({ to: "/not-found" });
  }

  const canonicalSlug = item.slug
    ? item.slug.replaceAll(".", "-")
    : item.id.replaceAll(".", "-");
  const itemPath = `/m/${item.uniqueID}/${canonicalSlug}`;
  const pagePath = splat ? `/${splat}` : "/";
  const resolveItemPageUrl = (path: string) =>
    path === "/" ? itemPath : `${itemPath}${path}`;

  if (item.pageRedirects) {
    for (const [from, to] of Object.entries(item.pageRedirects)) {
      const newPagePath = getRedirectPath(pagePath, from, to);
      if (newPagePath) {
        throw redirect({ to: resolveItemPageUrl(newPagePath) });
      }
    }
  }

  if (item.slug) {
    if (item.slug !== slug) {
      throw redirect({ to: resolveItemPageUrl(pagePath) });
    }
  } else if (item.id.replaceAll(".", "-") !== slug) {
    throw redirect({ to: resolveItemPageUrl(pagePath) });
  }

  const flatPages = item.pages ? flattenPages(item.pages) : undefined;
  let renderedMarkdown: string | undefined;
  let rawMarkdownContent: string | undefined;
  let frontmatter: Record<string, {}> | undefined;
  let imports: string[] | undefined;
  let sourceUrl: string | undefined;
  const pageLinkMap = flatPages
    ? buildMarketplacePageLinkMap(flatPages, itemPath)
    : undefined;

  if (flatPages) {
    const pageEntry = Object.entries(flatPages).find(
      ([route]) => route === pagePath,
    );

    if (!pageEntry) {
      if (pagePath !== "/") {
        throw redirect({ to: itemPath });
      }
      throw redirect({ to: "/not-found" });
    }

    const [, page] = pageEntry;
    const mirrorSpec = getMarketplaceMirrorSpec(item.id, pagePath);
    if (!page || (!mirrorSpec && !(await fileExists(page)))) {
      throw redirect({ to: itemPath });
    }

    if (mirrorSpec) {
      sourceUrl = mirrorSpec.rawUrl;
      const response = await fetch(mirrorSpec.rawUrl);
      if (!response.ok) {
        throw redirect({ to: itemPath });
      }
      const exampleContent = await response.text();
      const mirrorMarkdown = buildMirrorMarkdown(mirrorSpec, exampleContent);
      rawMarkdownContent = mirrorMarkdown;
      const markdown = await parse(mirrorMarkdown);
      renderedMarkdown = resolveHtmlAssetLinks(
        markdown.html,
        sourceUrl,
        pageLinkMap,
      );
      frontmatter = resolveFrontmatterLinks(
        markdown.frontmatter as Record<string, {}> | undefined,
        sourceUrl,
      );
      imports = frontmatter?.imports as string[] | undefined;
    } else {
      sourceUrl = page;
      const content = await getContentString(page);
      rawMarkdownContent = content;
      const markdown = await parse(content);
      renderedMarkdown = resolveHtmlAssetLinks(
        markdown.html,
        sourceUrl,
        pageLinkMap,
      );
      frontmatter = resolveFrontmatterLinks(
        markdown.frontmatter as Record<string, {}> | undefined,
        sourceUrl,
      );
      imports = frontmatter?.imports as string[] | undefined;
    }
  } else if (item.readme) {
    const readme =
      typeof item.readme === "object" ? item.readme.en : item.readme;

    try {
      sourceUrl = readme;
      const content = await getContentString(readme);
      rawMarkdownContent = content;
      const markdown = await parse(content);
      renderedMarkdown = resolveHtmlAssetLinks(
        markdown.html,
        sourceUrl,
        pageLinkMap,
      );
      frontmatter = resolveFrontmatterLinks(
        markdown.frontmatter as Record<string, {}> | undefined,
        sourceUrl,
      );
      imports = frontmatter?.imports as string[] | undefined;
    } catch {
      throw redirect({ to: "/not-found" });
    }
  } else {
    throw redirect({ to: "/not-found" });
  }

  if (!renderedMarkdown) {
    throw redirect({ to: "/not-found" });
  }

  const { html: markdownWithIds, headings } =
    extractHeadingsAndInjectIds(renderedMarkdown);
  const { prevRoute, nextRoute } = getMarketplacePageNeighbors(item, pagePath);
  const basePath = itemPath;
  const buildNeighborPath = (route?: string) => {
    if (!route) return undefined;
    return route === "/" ? basePath : `${basePath}${route}`;
  };

  const recommends = item.recommends
    ? registry.filter((entry: any) =>
        item.recommends!.some((recommend) => {
          const normalized = recommend.replace(/^m\//, "").replace(/^g\//, "");
          return normalized === entry.uniqueID;
        }),
      )
    : undefined;

  return {
    markdown: markdownWithIds,
    rawMarkdown: rawMarkdownContent || "",
    frontmatter,
    pagePath,
    manifest: item,
    recommends,
    imports,
    headings,
    prevPagePath: buildNeighborPath(prevRoute),
    nextPagePath: buildNeighborPath(nextRoute),
  };
}

function flattenPages(
  pages: Record<string, string> | Record<string, Record<string, string>>,
) {
  const flatPages: Record<string, string> = {};
  for (const [key, value] of Object.entries(pages) as Array<
    [string, string | Record<string, string>]
  >) {
    if (typeof value === "string") {
      flatPages[key] = value;
    } else {
      for (const [subKey, subValue] of Object.entries(value) as Array<
        [string, string]
      >) {
        flatPages[subKey] = subValue;
      }
    }
  }
  return flatPages;
}

function resolveFrontmatterLinks(
  frontmatter: Record<string, {}> | undefined,
  baseUrl?: string,
) {
  if (!frontmatter || !baseUrl || !baseUrl.startsWith("http")) {
    return frontmatter;
  }

  const resolved = { ...frontmatter };
  const urlKeys = ["og:image", "og:image:secure_url", "twitter:image"];

  for (const key of urlKeys) {
    const value = resolved[key];
    if (typeof value === "string") {
      resolved[key] = resolveRelativeUrl(value, baseUrl, {
        appendMarkdownExtension: false,
      });
    }
  }

  if (Array.isArray(resolved.imports)) {
    resolved.imports = resolved.imports.map((value) =>
      typeof value === "string"
        ? resolveRelativeUrl(value, baseUrl, { appendMarkdownExtension: false })
        : value,
    );
  }

  return resolved;
}

type PageLinkMap = Map<string, string>;

function buildMarketplacePageLinkMap(
  pages: Record<string, string>,
  itemPath: string,
): PageLinkMap {
  const map: PageLinkMap = new Map();
  for (const [route, page] of Object.entries(pages)) {
    if (!page.startsWith("http")) continue;
    const target = route === "/" ? itemPath : `${itemPath}${route}`;
    map.set(normalizePageLinkKey(page), target);
  }
  return map;
}

export function resolveHtmlAssetLinks(
  html: string,
  baseUrl?: string,
  pageLinkMap?: PageLinkMap,
) {
  if (!baseUrl || !baseUrl.startsWith("http")) return html;
  const baseOrigin = getUrlOrigin(baseUrl);
  return html.replace(
    /(src|href)=(["'])([^"']+)\2/gi,
    (_match, attr, quote, value) => {
      const resolved = resolveRelativeUrl(String(value), baseUrl, {
        appendMarkdownExtension: attr.toLowerCase() === "href",
      });
      if (attr.toLowerCase() === "href" && pageLinkMap) {
        const target = pageLinkMap.get(normalizePageLinkKey(resolved));
        if (target) {
          const targetOrigin = getUrlOrigin(resolved);
          if (baseOrigin && targetOrigin && baseOrigin !== targetOrigin) {
            return `${attr}=${quote}${resolved}${quote}`;
          }
          const suffix = extractSearchAndHash(resolved);
          return `${attr}=${quote}${target}${suffix}${quote}`;
        }
      }
      return `${attr}=${quote}${resolved}${quote}`;
    },
  );
}

function normalizePageLinkKey(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return value;
  }
}

function extractSearchAndHash(value: string) {
  try {
    const url = new URL(value);
    return `${url.search}${url.hash}`;
  } catch {
    return "";
  }
}

function getUrlOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function resolveRelativeUrl(
  value: string,
  baseUrl: string,
  options: { appendMarkdownExtension?: boolean } = {},
) {
  if (!isRelativeUrl(value)) return value;
  const normalizedValue =
    options.appendMarkdownExtension &&
    shouldAppendMarkdownExtension(value, baseUrl)
      ? appendMarkdownExtension(value, baseUrl)
      : value;
  try {
    return new URL(normalizedValue, baseUrl).toString();
  } catch {
    return value;
  }
}

function shouldAppendMarkdownExtension(value: string, baseUrl: string) {
  if (!isRawGithubUrl(baseUrl)) return false;
  const baseExtension = getMarkdownExtension(baseUrl);
  if (!baseExtension) return false;
  const { path } = splitPathAndSuffix(value);
  if (!path || path.endsWith("/")) return false;
  return !hasPathExtension(path);
}

function appendMarkdownExtension(value: string, baseUrl: string) {
  const extension = getMarkdownExtension(baseUrl);
  if (!extension) return value;
  const { path, suffix } = splitPathAndSuffix(value);
  if (!path) return value;
  return `${path}${extension}${suffix}`;
}

function splitPathAndSuffix(value: string) {
  const match = value.match(/^([^?#]*)([?#].*)?$/);
  return { path: match?.[1] ?? "", suffix: match?.[2] ?? "" };
}

function hasPathExtension(path: string) {
  const lastSegment = path.split("/").pop() ?? "";
  return Boolean(lastSegment && lastSegment.includes("."));
}

function isRawGithubUrl(baseUrl: string) {
  try {
    return new URL(baseUrl).hostname === "raw.githubusercontent.com";
  } catch {
    return baseUrl.includes("raw.githubusercontent.com");
  }
}

function getMarkdownExtension(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    if (url.pathname.endsWith(".md")) return ".md";
    if (url.pathname.endsWith(".markdown")) return ".markdown";
  } catch {
    if (baseUrl.endsWith(".md")) return ".md";
    if (baseUrl.endsWith(".markdown")) return ".markdown";
  }
  return null;
}

function isRelativeUrl(value: string) {
  if (!value) return false;
  if (value.startsWith("#")) return false;
  if (value.startsWith("/")) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return false;
  return true;
}

function getRedirectPath(path: string, from: string, to: string) {
  const regex = new RegExp("^" + from.replace("*", "(.*)") + "$");
  if (regex.test(path)) {
    return path.replace(regex, to.replace("*", "$1"));
  }
  return undefined;
}

const getContentString = (path: string): Promise<string> =>
  path.includes("http")
    ? fetch(path).then((res) => res.text())
    : loadLocalMarketplaceFile(path);

async function fileExists(path: string): Promise<boolean> {
  try {
    if (path.startsWith("http")) {
      const response = await fetch(path, { method: "HEAD" });
      return response.ok;
    }
    return Boolean(getMarketplaceFileLoader(path));
  } catch {
    return false;
  }
}

function getMarketplaceFileLoader(
  path: string,
): (() => Promise<string>) | undefined {
  const normalized = path.replace(/^[./]+/, "");
  const key = `${marketplaceRootPrefix}${normalized}`;
  return localMarketplaceFiles[key];
}

async function loadLocalMarketplaceFile(path: string): Promise<string> {
  const loader = getMarketplaceFileLoader(path);
  if (!loader) {
    throw new Error(`Missing marketplace file: ${path}`);
  }
  return await loader();
}

function extractHeadingsAndInjectIds(html: string): {
  html: string;
  headings: MarketplaceHeading[];
} {
  const headings: MarketplaceHeading[] = [];
  const headingRegex = /<h([1-2])([^>]*)>(.*?)<\/h\1>/gis;
  const updatedHtml = html.replace(
    headingRegex,
    (_match, level, attrs, inner) => {
      const text = decodeHtmlEntities(stripHtml(String(inner))).trim();
      const id = slugifyHeading(text);
      headings.push({ id, text, level: Number(level) });
      const cleanAttrs = String(attrs).replace(/\s+id=(["']).*?\1/i, "");
      return `<h${level}${cleanAttrs} id="${id}">${inner}</h${level}>`;
    },
  );
  return { html: updatedHtml, headings };
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, "");
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function slugifyHeading(value: string) {
  return value
    .toLowerCase()
    .replaceAll(" ", "-")
    .replaceAll("/", "")
    .replace("#", "")
    .replaceAll("(", "")
    .replaceAll(")", "")
    .replaceAll("?", "")
    .replaceAll(".", "")
    .replaceAll("@", "")
    .replaceAll(
      /([\uE000-\uF8FF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDDFF])/g,
      "",
    )
    .replaceAll("✂", "")
    .replaceAll(":", "")
    .replaceAll("'", "");
}

function getMarketplacePageNeighbors(
  manifest: MarketplaceManifest & { uniqueID: string },
  currentRoute: string,
) {
  if (!manifest.pages) {
    return { prevRoute: undefined, nextRoute: undefined };
  }

  const allPages: Array<{ route: string; isExternal: boolean }> = [];
  const entries = Object.entries(manifest.pages);

  for (const [key, value] of entries) {
    if (typeof value === "string") {
      const isExternal =
        !value.endsWith(".md") &&
        !value.endsWith(".html") &&
        !isMarketplaceMirrorPage(manifest.id, key);
      if (!isExternal) {
        allPages.push({ route: key, isExternal });
      }
    } else {
      for (const [route, path] of Object.entries(
        value as Record<string, string>,
      )) {
        const isExternal =
          !path.endsWith(".md") &&
          !path.endsWith(".html") &&
          !isMarketplaceMirrorPage(manifest.id, route);
        if (!isExternal) {
          allPages.push({ route, isExternal });
        }
      }
    }
  }

  const currentIndex = allPages.findIndex((p) => p.route === currentRoute);
  if (currentIndex === -1 || allPages.length <= 1) {
    return { prevRoute: undefined, nextRoute: undefined };
  }

  const prevRoute = currentIndex > 0 ? allPages[currentIndex - 1].route : null;
  const nextRoute =
    currentIndex < allPages.length - 1
      ? allPages[currentIndex + 1].route
      : null;

  return {
    prevRoute: prevRoute || undefined,
    nextRoute: nextRoute || undefined,
  };
}

function buildMirrorMarkdown(
  spec: MarketplaceMirrorSpec,
  exampleMarkdown: string,
) {
  const cleaned = stripLeadingMarkdownH1(
    stripFrontmatterBlock(exampleMarkdown),
  );
  return [
    "---",
    `og:title: ${spec.ogTitle}`,
    `og:description: ${spec.ogDescription}`,
    `og:image: ${spec.ogImage}`,
    `twitter:image: ${spec.ogImage}`,
    `description: ${spec.ogDescription}`,
    "---",
    "",
    `![${spec.heroImageAlt}](${spec.heroImage})`,
    "",
    spec.pitch,
    "",
    "---",
    "",
    "> [!NOTE]",
    `> This example is mirrored from the official TanStack example in the [${spec.sourceLabel}](${spec.sourceUrl}) repository.`,
    "",
    cleaned,
    "",
  ].join("\n");
}

function stripFrontmatterBlock(markdown: string) {
  if (!markdown.startsWith("---")) return markdown;
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) return markdown;
  return markdown.slice(end + 4).trimStart();
}

function stripLeadingMarkdownH1(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  let index = 0;
  while (index < lines.length && lines[index].trim() === "") {
    index += 1;
  }
  if (index < lines.length && lines[index].startsWith("# ")) {
    lines.splice(index, 1);
  }
  return lines.join("\n").trimStart();
}
