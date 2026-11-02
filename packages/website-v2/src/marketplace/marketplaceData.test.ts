import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRegistry } = vi.hoisted(() => ({
  mockRegistry: [] as any[],
}));

vi.mock("@inlang/marketplace-registry", () => ({
  registry: mockRegistry,
}));

vi.mock("@tanstack/react-router", () => ({
  redirect: (input: { to?: string; href?: string; statusCode?: number }) => {
    throw input;
  },
}));

import {
  loadMarketplacePage,
  resolveHtmlAssetLinks,
  resolveRelativeUrl,
} from "./marketplaceData";
import {
  getStandaloneSiteRedirect,
  getStandaloneSiteRedirectForPath,
} from "./legacyRedirects";

describe("loadMarketplacePage redirects", () => {
  beforeEach(() => {
    mockRegistry.length = 0;
  });

  it("redirects to canonical slug for nested pages", async () => {
    mockRegistry.push({
      uniqueID: "u1",
      id: "app.example",
      slug: "my-app",
      readme: "https://example.com/readme.md",
    });

    await expect(
      loadMarketplacePage({
        uid: "u1",
        slug: "wrong-slug",
        splat: "docs/intro",
      }),
    ).rejects.toMatchObject({
      to: "/m/u1/my-app/docs/intro",
    });
  });

  it("redirects legacy uid to new paraglide sveltekit page", async () => {
    await expect(
      loadMarketplacePage({
        uid: "dxnzrydw",
        slug: "anything",
        splat: "legacy/path",
      }),
    ).rejects.toMatchObject({
      href: "https://paraglidejs.com/sveltekit",
      statusCode: 301,
    });
  });

  it("redirects osslbuzt to paraglide next-js page", async () => {
    await expect(
      loadMarketplacePage({
        uid: "osslbuzt",
        slug: "anything",
        splat: "legacy/path",
      }),
    ).rejects.toMatchObject({
      href: "https://paraglidejs.com/next-js",
      statusCode: 301,
    });
  });

  it("redirects iljlwzfs to paraglide astro page", async () => {
    await expect(
      loadMarketplacePage({
        uid: "iljlwzfs",
        slug: "anything",
        splat: "legacy/path",
      }),
    ).rejects.toMatchObject({
      href: "https://paraglidejs.com/astro",
      statusCode: 301,
    });
  });

  it("redirects paraglide marketplace root to standalone site", async () => {
    await expect(
      loadMarketplacePage({
        uid: "gerre34r",
        slug: "library-inlang-paraglideJs",
      }),
    ).rejects.toMatchObject({
      href: "https://paraglidejs.com",
      statusCode: 301,
    });
  });

  it("redirects paraglide marketplace subpages to standalone site", async () => {
    await expect(
      loadMarketplacePage({
        uid: "gerre34r",
        slug: "library-inlang-paraglideJs",
        splat: "server-side-rendering",
      }),
    ).rejects.toMatchObject({
      href: "https://paraglidejs.com/server-side-rendering",
      statusCode: 301,
    });
  });

  it("applies pageRedirects for nested docs", async () => {
    mockRegistry.push({
      uniqueID: "u1",
      id: "app.example",
      slug: "my-app",
      pageRedirects: {
        "/docs/*": "/guides/*",
      },
      readme: "https://example.com/readme.md",
    });

    await expect(
      loadMarketplacePage({
        uid: "u1",
        slug: "my-app",
        splat: "docs/old",
      }),
    ).rejects.toMatchObject({
      to: "/m/u1/my-app/guides/old",
    });
  });

  it("redirects to id-based canonical slug when slug is missing", async () => {
    mockRegistry.push({
      uniqueID: "u2",
      id: "app.inlang.cli",
      readme: "https://example.com/readme.md",
    });

    await expect(
      loadMarketplacePage({
        uid: "u2",
        slug: "wrong-slug",
      }),
    ).rejects.toMatchObject({
      to: "/m/u2/app-inlang-cli",
    });
  });
});

describe("loadMarketplacePage standalone sites", () => {
  it("redirects Fink pages to fink.inlang.com regardless of slug", async () => {
    await expect(
      loadMarketplacePage({ uid: "tdozzpar", slug: "anything" }),
    ).rejects.toMatchObject({
      href: "https://fink.inlang.com",
      statusCode: 301,
    });
  });
});

describe("Parrot standalone site", () => {
  const figmaUrl =
    "https://www.figma.com/community/plugin/1205803482754362456/parrot-localization-language-translation-no-lorem-ipsum-translator-i18n-l10n-html-global";

  it("redirects the Parrot marketplace root to its Figma page", async () => {
    await expect(
      loadMarketplacePage({ uid: "gkrpgoir", slug: "anything" }),
    ).rejects.toMatchObject({ href: figmaUrl, statusCode: 301 });
  });

  it("sends every Parrot marketplace path to the Figma page", () => {
    expect(
      getStandaloneSiteRedirectForPath("/m/gkrpgoir/app-parrot-figmaPlugin"),
    ).toEqual({ href: figmaUrl, statusCode: 301 });
    expect(
      getStandaloneSiteRedirectForPath(
        "/m/gkrpgoir/app-parrot-figmaPlugin/anything",
      ),
    ).toEqual({ href: figmaUrl, statusCode: 301 });
  });
});

describe("getStandaloneSiteRedirectForPath", () => {
  it("redirects Paraglide marketplace paths to the standalone site", () => {
    expect(
      getStandaloneSiteRedirectForPath(
        "/m/gerre34r/library-inlang-paraglideJs",
      ),
    ).toEqual({
      href: "https://paraglidejs.com",
      statusCode: 301,
    });
    expect(
      getStandaloneSiteRedirectForPath(
        "/m/gerre34r/library-inlang-paraglideJs/comparison",
      ),
    ).toEqual({
      href: "https://paraglidejs.com/comparison",
      statusCode: 301,
    });
  });

  it("redirects Fink marketplace paths to the Fink website root", () => {
    expect(
      getStandaloneSiteRedirectForPath(
        "/m/tdozzpar/app-inlang-finkLocalizationEditor",
      ),
    ).toEqual({
      href: "https://fink.inlang.com",
      statusCode: 301,
    });
    expect(
      getStandaloneSiteRedirectForPath(
        "/m/tdozzpar/app-inlang-finkLocalizationEditor/supported-i18n-libraries",
      ),
    ).toEqual({
      href: "https://fink.inlang.com/docs/formats",
      statusCode: 301,
    });
    expect(
      getStandaloneSiteRedirectForPath(
        "/m/tdozzpar/app-inlang-finkLocalizationEditor/supported-i18n-libraries/",
      ),
    ).toEqual({
      href: "https://fink.inlang.com/docs/formats",
      statusCode: 301,
    });
    expect(
      getStandaloneSiteRedirectForPath(
        "/m/tdozzpar/app-inlang-finkLocalizationEditor/",
      ),
    ).toEqual({
      href: "https://fink.inlang.com",
      statusCode: 301,
    });
    expect(getStandaloneSiteRedirect("tdozzpar", "/x")).toEqual({
      href: "https://fink.inlang.com/docs",
      statusCode: 301,
    });
    expect(getStandaloneSiteRedirect("tdozzpar", "/")).toEqual({
      href: "https://fink.inlang.com",
      statusCode: 301,
    });
  });

  it("does not redirect other marketplace items", () => {
    expect(
      getStandaloneSiteRedirectForPath("/m/2qj2w8pu/app-inlang-cli"),
    ).toBeUndefined();
  });

  it("redirects legacy Paraglide integration paths", () => {
    expect(
      getStandaloneSiteRedirectForPath("/m/dxnzrydw/paraglide-sveltekit-i18n"),
    ).toEqual({
      href: "https://paraglidejs.com/sveltekit",
      statusCode: 301,
    });
  });
});

describe("resolveRelativeUrl", () => {
  it("appends .md for raw github markdown pages with extensionless links", () => {
    const resolved = resolveRelativeUrl(
      "./middleware-guide",
      "https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/docs/strategy.md",
      { appendMarkdownExtension: true },
    );

    expect(resolved).toBe(
      "https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/docs/middleware-guide.md",
    );
  });

  it("preserves query and hash when appending .md", () => {
    const resolved = resolveRelativeUrl(
      "./middleware-guide#setup",
      "https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/docs/strategy.md",
      { appendMarkdownExtension: true },
    );

    expect(resolved).toBe(
      "https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/docs/middleware-guide.md#setup",
    );
  });

  it("handles base URLs with query strings when appending .md", () => {
    const resolved = resolveRelativeUrl(
      "./middleware-guide",
      "https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/docs/strategy.md?token=abc",
      { appendMarkdownExtension: true },
    );

    expect(resolved).toBe(
      "https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/docs/middleware-guide.md",
    );
  });

  it("does not append .md for non-raw URLs", () => {
    const resolved = resolveRelativeUrl(
      "./middleware-guide",
      "https://example.com/docs/strategy.md",
      { appendMarkdownExtension: true },
    );

    expect(resolved).toBe("https://example.com/docs/middleware-guide");
  });
});

describe("resolveHtmlAssetLinks", () => {
  it("rewrites markdown page links to marketplace routes when known", () => {
    const baseUrl =
      "https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/docs/strategy.md";
    const html =
      '<p><a href="./middleware-guide#setup">Middleware Guide</a></p>';
    const pageLinkMap = new Map([
      [
        "https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/docs/middleware-guide.md",
        "/m/gerre34r/library-inlang-paraglideJs/middleware",
      ],
    ]);

    const resolved = resolveHtmlAssetLinks(html, baseUrl, pageLinkMap);

    expect(resolved).toContain(
      'href="/m/gerre34r/library-inlang-paraglideJs/middleware#setup"',
    );
  });

  it("keeps non-page links resolved to raw URLs", () => {
    const baseUrl =
      "https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/docs/strategy.md";
    const html = '<p><a href="./assets/og.png">Asset</a></p>';
    const pageLinkMap = new Map();

    const resolved = resolveHtmlAssetLinks(html, baseUrl, pageLinkMap);

    expect(resolved).toContain(
      'href="https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/docs/assets/og.png"',
    );
  });

  it("does not rewrite links that point to a different origin", () => {
    const baseUrl =
      "https://raw.githubusercontent.com/TanStack/router/main/examples/react/i18n-paraglide/README.md";
    const html =
      '<p><a href="https://github.com/TanStack/router/tree/main/examples/react/i18n-paraglide">TanStack Router</a></p>';
    const pageLinkMap = new Map([
      [
        "https://github.com/TanStack/router/tree/main/examples/react/i18n-paraglide",
        "/m/gerre34r/library-inlang-paraglideJs/tanstack-router",
      ],
    ]);

    const resolved = resolveHtmlAssetLinks(html, baseUrl, pageLinkMap);

    expect(resolved).toContain(
      'href="https://github.com/TanStack/router/tree/main/examples/react/i18n-paraglide"',
    );
  });
});
