import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRegistry } = vi.hoisted(() => ({
  mockRegistry: [] as any[],
}));

vi.mock("@inlang/marketplace-registry", () => ({
  registry: mockRegistry,
}));

vi.mock("@tanstack/react-router", () => ({
  redirect: ({ to }: { to: string }) => {
    throw { to };
  },
}));

import {
  loadMarketplacePage,
  resolveHtmlAssetLinks,
  resolveRelativeUrl,
} from "./marketplaceData";

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
      to: "/m/gerre34r/library-inlang-paraglideJs/sveltekit",
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
      to: "/m/gerre34r/library-inlang-paraglideJs/next-js",
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
      to: "/m/gerre34r/library-inlang-paraglideJs/astro",
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
      to: "/m/u2/app-inlang-cli/",
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
