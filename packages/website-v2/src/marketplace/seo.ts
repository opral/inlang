type MarketplaceHeadInput = {
  displayName: string;
  pagePath: string;
  rawMarkdown: string;
  frontmatter?: Record<string, unknown>;
};

/**
 * Title of a marketplace page. A root page uses the `title` frontmatter, or the
 * display name, so the name is not repeated after the README heading. A
 * subpage is the display name followed by the subpage title.
 */
export function buildMarketplaceTitle(input: MarketplaceHeadInput) {
  if (input.pagePath === "/") {
    const title = input.frontmatter?.title;
    const rootTitle =
      typeof title === "string" && title.trim() ? title.trim() : undefined;
    return `${rootTitle ?? input.displayName} | inlang`;
  }
  const subpageTitle = getMarketplaceSubpageTitle(input);
  if (subpageTitle) {
    return `${input.displayName} - ${subpageTitle} | inlang`;
  }
  return `${input.displayName} | inlang`;
}

export function extractOgMeta(frontmatter?: Record<string, unknown>) {
  if (!frontmatter) return [];
  return Object.entries(frontmatter)
    .filter(
      ([key, value]) => key.startsWith("og:") && typeof value === "string",
    )
    .map(([key, value]) => ({
      property: key,
      content: value as string,
    }));
}

export function extractTwitterMeta(frontmatter?: Record<string, unknown>) {
  if (!frontmatter) return [];
  return Object.entries(frontmatter)
    .filter(
      ([key, value]) => key.startsWith("twitter:") && typeof value === "string",
    )
    .map(([key, value]) => ({
      name: key,
      content: value as string,
    }));
}

export function getMarketplaceSubpageTitle(input: MarketplaceHeadInput) {
  const ogTitle =
    typeof input.frontmatter?.["og:title"] === "string"
      ? input.frontmatter["og:title"]
      : undefined;
  if (ogTitle) {
    return ogTitle;
  }

  const h1 = extractMarkdownH1(input.rawMarkdown);
  if (h1) {
    return h1;
  }

  return deriveTitleFromPath(input.pagePath);
}

type JsonLdInput = MarketplaceHeadInput & {
  description: string;
  canonicalUrl: string;
  image?: string;
};

export function buildMarketplaceJsonLd(input: JsonLdInput) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: buildMarketplaceTitle(input),
    description: input.description,
    url: input.canonicalUrl,
    ...(input.image ? { image: input.image } : {}),
  };
}

type BreadcrumbInput = {
  displayName: string;
  canonicalUrl: string;
  canonicalBaseUrl: string;
  subpageTitle?: string;
};

export function buildMarketplaceBreadcrumbJsonLd(input: BreadcrumbInput) {
  const items: Array<Record<string, unknown>> = [
    {
      "@type": "ListItem",
      position: 1,
      name: input.displayName,
      item: input.canonicalBaseUrl,
    },
  ];

  if (input.subpageTitle) {
    items.push({
      "@type": "ListItem",
      position: 2,
      name: input.subpageTitle,
      item: input.canonicalUrl,
    });
  }

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items,
  };
}

type ArticleJsonLdInput = {
  headline: string;
  description: string;
  canonicalUrl: string;
  image?: string;
};

export function buildMarketplaceArticleJsonLd(input: ArticleJsonLdInput) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.headline,
    description: input.description,
    url: input.canonicalUrl,
    ...(input.image ? { image: input.image } : {}),
  };
}

type SoftwareJsonLdInput = {
  id: string;
  displayName: string;
  description: string;
  canonicalUrl: string;
  image?: string;
  publisherName: string;
  publisherLink?: string;
  publisherIcon?: string;
  license?: string;
  repository?: string;
  website?: string;
  frontmatter?: Record<string, unknown>;
};

export function buildMarketplaceSoftwareJsonLd(input: SoftwareJsonLdInput) {
  const isApp = input.id.startsWith("app.");
  const hasRepository = Boolean(input.repository);
  const publisher: Record<string, unknown> = {
    "@type": "Organization",
    name: input.publisherName,
  };

  if (input.publisherLink) {
    publisher.url = input.publisherLink;
  }
  if (input.publisherIcon) {
    publisher.logo = input.publisherIcon;
  }

  const sameAs = [input.website, input.repository].filter(
    (value): value is string => Boolean(value),
  );

  const base = {
    "@context": "https://schema.org",
    name: input.displayName,
    description: input.description,
    url: input.canonicalUrl,
    publisher,
    ...(input.image ? { image: input.image } : {}),
    ...(input.license ? { license: input.license } : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };

  if (isApp) {
    return {
      ...base,
      "@type": "SoftwareApplication",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      ...(input.frontmatter?.softwareVersion
        ? { softwareVersion: input.frontmatter.softwareVersion }
        : {}),
      ...(input.frontmatter?.downloadUrl
        ? { downloadUrl: input.frontmatter.downloadUrl }
        : {}),
    };
  }

  if (hasRepository) {
    return {
      ...base,
      "@type": "SoftwareSourceCode",
      codeRepository: input.repository,
      ...(input.frontmatter?.softwareVersion
        ? { softwareVersion: input.frontmatter.softwareVersion }
        : {}),
      ...(input.frontmatter?.downloadUrl
        ? { downloadUrl: input.frontmatter.downloadUrl }
        : {}),
    };
  }

  return undefined;
}

export function extractMarkdownH1(markdown: string) {
  if (!markdown) return undefined;
  const sanitized = stripFrontmatter(markdown);
  const lines = sanitized.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith("# ")) {
      return line.slice(2).trim() || undefined;
    }
  }
  return undefined;
}

export function extractMarkdownDescription(markdown: string) {
  if (!markdown) return undefined;
  const sanitized = stripFrontmatter(markdown);
  const lines = sanitized.split(/\r?\n/);
  let collecting = false;
  const paragraph: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (collecting) break;
      continue;
    }
    if (trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("![")) continue;
    if (trimmed.startsWith("<")) continue;
    if (
      trimmed.startsWith("- ") ||
      trimmed.startsWith("* ") ||
      /^\d+\.\s/.test(trimmed)
    ) {
      continue;
    }
    collecting = true;
    paragraph.push(trimmed);
  }

  if (!paragraph.length) return undefined;
  return stripInlineMarkdown(paragraph.join(" "));
}

/** Plain text for a meta description: no links, code ticks or bold markers. */
function stripInlineMarkdown(text: string) {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2");
}

function stripFrontmatter(markdown: string) {
  if (!markdown.startsWith("---")) return markdown;
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) return markdown;
  return markdown.slice(end + 4).trimStart();
}

export function deriveTitleFromPath(path: string) {
  if (!path || path === "/") return undefined;
  const segment = path.split("/").filter(Boolean).slice(-1)[0];
  if (!segment) return undefined;
  return segment
    .split("-")
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}
