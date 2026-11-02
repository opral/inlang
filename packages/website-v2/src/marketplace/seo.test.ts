import { describe, it, expect } from "vitest";
import {
  buildMarketplaceTitle,
  deriveTitleFromPath,
  extractOgMeta,
  extractTwitterMeta,
  extractMarkdownH1,
  extractMarkdownDescription,
  getMarketplaceSubpageTitle,
  buildMarketplaceJsonLd,
  buildMarketplaceBreadcrumbJsonLd,
  buildMarketplaceSoftwareJsonLd,
  buildMarketplaceArticleJsonLd,
} from "./seo";

describe("marketplace seo helpers", () => {
  it("uses og:title first", () => {
    const title = getMarketplaceSubpageTitle({
      displayName: "Paraglide JS",
      pagePath: "/react-router",
      rawMarkdown: "# React Router",
      frontmatter: { "og:title": "Message Keys" },
    });

    expect(title).toBe("Message Keys");
  });

  it("uses h1 when frontmatter title is missing", () => {
    const title = getMarketplaceSubpageTitle({
      displayName: "Paraglide JS",
      pagePath: "/react-router",
      rawMarkdown: "# React Router\n\nContent",
    });

    expect(title).toBe("React Router");
  });

  it("uses path-derived title when no h1 is present", () => {
    const title = getMarketplaceSubpageTitle({
      displayName: "Paraglide JS",
      pagePath: "/react-router",
      rawMarkdown: "Content",
    });

    expect(title).toBe("React Router");
  });

  it("builds a nested page title with hyphen", () => {
    const title = buildMarketplaceTitle({
      displayName: "Paraglide JS",
      pagePath: "/message-keys",
      rawMarkdown: "Content",
      frontmatter: { "og:title": "Message Keys" },
    });

    expect(title).toBe("Paraglide JS - Message Keys | inlang");
  });

  it("builds a root page title without subpage", () => {
    const title = buildMarketplaceTitle({
      displayName: "Paraglide JS",
      pagePath: "/",
      rawMarkdown: "Content",
    });

    expect(title).toBe("Paraglide JS | inlang");
  });

  it("uses the title frontmatter for a root page title", () => {
    const title = buildMarketplaceTitle({
      displayName: "i18next",
      pagePath: "/",
      rawMarkdown: "# i18next Plugin for Inlang",
      frontmatter: { title: "i18next plugin: import and export i18next JSON" },
    });

    expect(title).toBe(
      "i18next plugin: import and export i18next JSON | inlang",
    );
  });

  it("does not repeat the README heading in a root page title", () => {
    const title = buildMarketplaceTitle({
      displayName: "Android Resources",
      pagePath: "/",
      rawMarkdown: "# Android Resources plugin for Inlang",
    });

    expect(title).toBe("Android Resources | inlang");
  });

  it("extracts first h1 after frontmatter", () => {
    const h1 = extractMarkdownH1(`---
title: Hello
---

# React Router

## Subhead
`);

    expect(h1).toBe("React Router");
  });

  it("derives title from path segments", () => {
    expect(deriveTitleFromPath("/next-js")).toBe("Next Js");
    expect(deriveTitleFromPath("/docs/react-router")).toBe("React Router");
  });

  it("extracts first paragraph as description", () => {
    const description = extractMarkdownDescription(`# Title

First paragraph line one.
Second line of the same paragraph.

## Next
Later content.
`);

    expect(description).toBe(
      "First paragraph line one. Second line of the same paragraph.",
    );
  });

  it("strips markdown links and code from the description", () => {
    const description = extractMarkdownDescription(`# Title

Reads and writes [i18next](https://inlang.com/m/kl95463j) files with \`strings.xml\` and **plurals**.
`);

    expect(description).toBe(
      "Reads and writes i18next files with strings.xml and plurals.",
    );
  });

  it("skips HTML blocks when extracting the description", () => {
    const description = extractMarkdownDescription(`# Title

<p><a href="https://example.com"><img src="badge.svg" /></a></p>

VS Code extension for i18n.
`);

    expect(description).toBe("VS Code extension for i18n.");
  });

  it("prefers frontmatter description over markdown and fallback", () => {
    const frontmatterDescription = "Frontmatter description";
    const markdownDescription = extractMarkdownDescription(`# Title

Markdown paragraph.
`);
    const manifestDescription = "Manifest description";
    const resolved =
      frontmatterDescription || markdownDescription || manifestDescription;

    expect(resolved).toBe("Frontmatter description");
  });

  it("falls back to markdown description when frontmatter is missing", () => {
    const frontmatterDescription = undefined;
    const markdownDescription = extractMarkdownDescription(`# Title

Markdown paragraph.
`);
    const manifestDescription = "Manifest description";
    const resolved =
      frontmatterDescription || markdownDescription || manifestDescription;

    expect(resolved).toBe("Markdown paragraph.");
  });

  it("falls back to manifest description when markdown is missing", () => {
    const frontmatterDescription = undefined;
    const markdownDescription = extractMarkdownDescription(`# Title

## Only headings
`);
    const manifestDescription = "Manifest description";
    const resolved =
      frontmatterDescription || markdownDescription || manifestDescription;

    expect(resolved).toBe("Manifest description");
  });

  it("extracts og meta entries from frontmatter", () => {
    const og = extractOgMeta({
      "og:title": "OG Title",
      "og:image": "https://example.com/og.png",
      title: "Ignored",
    });

    expect(og).toEqual([
      { property: "og:title", content: "OG Title" },
      { property: "og:image", content: "https://example.com/og.png" },
    ]);
  });

  it("extracts twitter meta entries from frontmatter", () => {
    const twitter = extractTwitterMeta({
      "twitter:title": "Twitter Title",
      "twitter:image": "https://example.com/twitter.png",
      title: "Ignored",
    });

    expect(twitter).toEqual([
      { name: "twitter:title", content: "Twitter Title" },
      { name: "twitter:image", content: "https://example.com/twitter.png" },
    ]);
  });

  it("builds WebPage JSON-LD", () => {
    const jsonLd = buildMarketplaceJsonLd({
      displayName: "Paraglide JS",
      description: "Fast i18n for the web",
      canonicalUrl: "https://inlang.com/m/gerre34r/library-inlang-paraglideJs",
      image: "https://example.com/og.png",
      pagePath: "/",
      rawMarkdown: "",
    });

    expect(jsonLd).toEqual({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Paraglide JS | inlang",
      description: "Fast i18n for the web",
      url: "https://inlang.com/m/gerre34r/library-inlang-paraglideJs",
      image: "https://example.com/og.png",
    });
  });

  it("builds BreadcrumbList JSON-LD", () => {
    const jsonLd = buildMarketplaceBreadcrumbJsonLd({
      displayName: "Paraglide JS",
      canonicalBaseUrl:
        "https://inlang.com/m/gerre34r/library-inlang-paraglideJs",
      canonicalUrl:
        "https://inlang.com/m/gerre34r/library-inlang-paraglideJs/react-router",
      subpageTitle: "React Router",
    });

    expect(jsonLd).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Paraglide JS",
          item: "https://inlang.com/m/gerre34r/library-inlang-paraglideJs",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "React Router",
          item: "https://inlang.com/m/gerre34r/library-inlang-paraglideJs/react-router",
        },
      ],
    });
  });

  it("builds SoftwareApplication JSON-LD for apps", () => {
    const jsonLd = buildMarketplaceSoftwareJsonLd({
      id: "app.inlang.editor",
      displayName: "Editor",
      description: "Inlang editor",
      canonicalUrl: "https://inlang.com/m/app",
      image: "https://example.com/og.png",
      publisherName: "inlang",
      publisherLink: "https://inlang.com",
      publisherIcon: "https://example.com/icon.png",
      license: "Apache-2.0",
      repository: "https://github.com/opral/inlang",
      website: "https://inlang.com",
    });

    expect(jsonLd).toEqual({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Editor",
      description: "Inlang editor",
      url: "https://inlang.com/m/app",
      publisher: {
        "@type": "Organization",
        name: "inlang",
        url: "https://inlang.com",
        logo: "https://example.com/icon.png",
      },
      image: "https://example.com/og.png",
      license: "Apache-2.0",
      sameAs: ["https://inlang.com", "https://github.com/opral/inlang"],
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
    });
  });

  it("builds SoftwareSourceCode JSON-LD when repository exists", () => {
    const jsonLd = buildMarketplaceSoftwareJsonLd({
      id: "library.inlang.paraglideJs",
      displayName: "Paraglide JS",
      description: "i18n runtime",
      canonicalUrl: "https://inlang.com/m/paraglide",
      publisherName: "inlang",
      repository: "https://github.com/opral/paraglide-js",
    });

    expect(jsonLd).toEqual({
      "@context": "https://schema.org",
      "@type": "SoftwareSourceCode",
      name: "Paraglide JS",
      description: "i18n runtime",
      url: "https://inlang.com/m/paraglide",
      publisher: {
        "@type": "Organization",
        name: "inlang",
      },
      codeRepository: "https://github.com/opral/paraglide-js",
      sameAs: ["https://github.com/opral/paraglide-js"],
    });
  });

  it("returns undefined when no software metadata is available", () => {
    const jsonLd = buildMarketplaceSoftwareJsonLd({
      id: "guide.inlang.docs",
      displayName: "Guide",
      description: "Guide",
      canonicalUrl: "https://inlang.com/m/guide",
      publisherName: "inlang",
    });

    expect(jsonLd).toBeUndefined();
  });

  it("builds Article JSON-LD", () => {
    const jsonLd = buildMarketplaceArticleJsonLd({
      headline: "React Router",
      description: "How to use Paraglide with React Router.",
      canonicalUrl: "https://inlang.com/m/paraglide/react-router",
      image: "https://example.com/og.png",
    });

    expect(jsonLd).toEqual({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "React Router",
      description: "How to use Paraglide with React Router.",
      url: "https://inlang.com/m/paraglide/react-router",
      image: "https://example.com/og.png",
    });
  });
});
