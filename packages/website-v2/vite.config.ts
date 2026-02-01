import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { registry } from "@inlang/marketplace-registry";
import { cloudflare } from "@cloudflare/vite-plugin";
import { githubStarsPlugin } from "./src/ssg/github-stars-plugin";
import { viteStaticCopy } from "vite-plugin-static-copy";

const config = defineConfig(({ mode, command }) => {
  const isTest = process.env.VITEST === "true" || mode === "test";
  const env = loadEnv(mode, process.cwd(), "");
  const githubToken =
    process.env.INLANG_WEBSITE_GITHUB_TOKEN ?? env.INLANG_WEBSITE_GITHUB_TOKEN;

  return {
    plugins: [
      !isTest && cloudflare({ viteEnvironment: { name: "ssr" } }),
      // this is the plugin that enables path aliases
      viteTsConfigPaths({
        projects: ["./tsconfig.json"],
      }),
      tailwindcss(),
      !isTest &&
        viteStaticCopy({
          targets: [
            {
              src: "../../blog/**",
              dest: "../client/blog",
            },
          ],
          watch: command === "serve" ? { reloadPageOnChange: true } : undefined,
        }),
      tanstackStart({
        prerender: {
          enabled: true,
          autoSubfolderIndex: false,
          autoStaticPathsDiscovery: true,
          crawlLinks: true,
          concurrency: 8,
          retryCount: 2,
          retryDelay: 1000,
          maxRedirects: 5,
          failOnError: true,
        },
        sitemap: {
          enabled: true,
          host: "https://inlang.com",
        },
        pages: getMarketplaceStaticPages(),
      }),
      viteReact(),
      !isTest && githubStarsPlugin({ token: githubToken }),
    ].filter(Boolean),
  };
});

export default config;

function getMarketplaceStaticPages() {
  const paths = new Set<string>();

  for (const entry of registry as any[]) {
    const slug = entry.slug
      ? entry.slug.replaceAll(".", "-")
      : entry.id.replaceAll(".", "-");
    const basePath = `/m/${entry.uniqueID}/${slug}`;
    paths.add(basePath);

    if (!entry.pages) continue;
    const flatPages = flattenPages(entry.pages);

    for (const [route, path] of Object.entries(flatPages) as Array<
      [string, string]
    >) {
      if (!path || !isMarkdownPath(path)) continue;
      const normalized = route.startsWith("/") ? route : `/${route}`;
      const fullPath = `${basePath}${normalized === "/" ? "" : normalized}`;
      paths.add(fullPath);
    }
  }

  return Array.from(paths).map((path) => ({ path }));
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

function isMarkdownPath(path: string) {
  return path.endsWith(".md") || path.endsWith(".html");
}
