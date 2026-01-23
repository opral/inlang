import { createFileRoute, redirect } from "@tanstack/react-router";
import { Link } from "../../components/RouterLink";
import { createServerFn } from "@tanstack/react-start";
import { parse } from "@opral/markdown-wc";
import { useEffect, useState } from "react";
import { initMarkdownInteractive } from "../../components/markdown-interactive";
import markdownCss from "../../markdown.css?url";
import {
  getDocDescription,
  getDocTitle,
} from "../../documentation/docsMetadata";

type DocHeading = {
  id: string;
  text: string;
  level: number;
};

type TocEntry = {
  path: string;
  slug: string;
  title?: string;
};

type TocSection = {
  title: string;
  pages: TocEntry[];
};

const docsMarkdownFiles = import.meta.glob<string>(
  "../../../../../docs/**/*.md",
  {
    query: "?raw",
    import: "default",
  },
);
const docsJsonFiles = import.meta.glob<string>("../../../../../docs/*.json", {
  query: "?raw",
  import: "default",
});
const docsRootPrefix = "../../../../../docs/";

const loadDoc = createServerFn({ method: "GET" }).handler(async (ctx) => {
  const data = ctx.data as { slug?: string } | undefined;
  const slug = data?.slug;
  if (!slug) {
    throw new Error("Missing docs slug");
  }

  const tocContent = await getDocsJson("table_of_contents.json");
  const toc = JSON.parse(tocContent) as Array<TocSection>;

  const sections = await Promise.all(
    toc.map(async (section) => {
      const pages = await Promise.all(
        section.pages.map(async (item) => {
          const relativePath = item.path.startsWith("./")
            ? item.path.slice(2)
            : item.path;
          const rawMarkdown = await getDocsMarkdown(relativePath);
          const parsed = await parse(rawMarkdown);
          const title = getDocTitle({
            rawMarkdown,
            frontmatter: parsed.frontmatter,
          });
          return {
            slug: item.slug,
            title,
            path: item.path,
          };
        }),
      );

      return {
        title: section.title,
        pages,
      };
    }),
  );

  const entry = sections
    .flatMap((section) => section.pages)
    .find((item) => item.slug === slug);
  if (!entry) {
    throw new Error(`Documentation entry not found: ${slug}`);
  }

  const relativePath = entry.path.startsWith("./")
    ? entry.path.slice(2)
    : entry.path;
  const rawMarkdown = await getDocsMarkdown(relativePath);
  const parsed = await parse(rawMarkdown, {
    assetBaseUrl: `/docs/${slug}/`,
  });
  const title = getDocTitle({
    rawMarkdown,
    frontmatter: parsed.frontmatter,
  });
  const description = getDocDescription({
    rawMarkdown,
    frontmatter: parsed.frontmatter,
  });

  const { html: markdownWithIds, headings } = extractHeadingsAndInjectIds(
    parsed.html,
  );

  const imports = parsed.frontmatter?.imports as string[] | undefined;

  return {
    doc: {
      slug: entry.slug,
      title,
      description,
      imports,
      path: relativePath,
    },
    markdown: markdownWithIds,
    rawMarkdown,
    headings,
    toc: sections,
  };
});

export const Route = createFileRoute("/docs/$slug")({
  loader: async ({ params }) => {
    try {
      // @ts-expect-error - TanStack Start server function type inference
      return await loadDoc({ data: { slug: params.slug } });
    } catch {
      throw redirect({ to: "/docs" });
    }
  },
  head: ({ loaderData }) => {
    const title = loaderData?.doc.title;
    const description = loaderData?.doc.description;
    const slug = loaderData?.doc.slug;
    const canonicalUrl = slug
      ? `https://inlang.com/docs/${slug}`
      : "https://inlang.com/docs";

    const meta: Array<
      | { title: string }
      | { name: string; content: string }
      | { property: string; content: string }
    > = [
      {
        title: title ? `${title} | inlang Documentation` : "Documentation",
      },
      { property: "og:url", content: canonicalUrl },
      { property: "og:type", content: "article" },
      { property: "og:site_name", content: "inlang" },
      { property: "og:locale", content: "en_US" },
    ];

    if (description) {
      meta.push(
        { name: "description", content: description },
        { property: "og:description", content: description },
        { name: "twitter:description", content: description },
      );
    }

    if (title) {
      meta.push(
        { property: "og:title", content: `${title} | inlang Documentation` },
        { name: "twitter:title", content: `${title} | inlang Documentation` },
      );
    }

    return {
      meta,
      links: [
        { rel: "stylesheet", href: markdownCss },
        { rel: "canonical", href: canonicalUrl },
      ],
    };
  },
  component: DocumentationPage,
});

function DocumentationPage() {
  const { doc, markdown, headings, toc, rawMarkdown } = Route.useLoaderData();
  const [activeId, setActiveId] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileOnThisPageOpen, setMobileOnThisPageOpen] = useState(false);

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(rawMarkdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy markdown:", err);
    }
  };

  useEffect(() => {
    if (!doc.imports || doc.imports.length === 0) return;
    doc.imports.forEach((url) => {
      import(/* @vite-ignore */ url).catch((err) => {
        console.error(`Failed to load web component from ${url}:`, err);
      });
    });
  }, [doc.imports]);

  useEffect(() => {
    initMarkdownInteractive();
  }, []);

  useEffect(() => {
    if (headings.length === 0) return;

    const handleScroll = () => {
      const headingElements = headings
        .map((h) => ({ id: h.id, el: document.getElementById(h.id) }))
        .filter((h) => h.el !== null) as { id: string; el: HTMLElement }[];

      if (headingElements.length === 0) return;

      const viewportHeight = window.innerHeight;
      const offset = 100;

      let currentId = headingElements[0].id;

      for (const { id, el } of headingElements) {
        const rect = el.getBoundingClientRect();
        const elementTop = rect.top;

        if (elementTop <= offset + viewportHeight * 0.3) {
          currentId = id;
        } else {
          break;
        }
      }

      setActiveId(currentId);
    };

    handleScroll();

    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [headings]);

  return (
    <main className="bg-white text-slate-900">
      {/* Mobile navigation bar - visible below lg breakpoint */}
      <div className="sticky top-[62px] z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 lg:hidden">
        <button
          type="button"
          onClick={() => {
            setMobileMenuOpen(!mobileMenuOpen);
            setMobileOnThisPageOpen(false);
          }}
          className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
          Menu
        </button>
        <button
          type="button"
          onClick={() => {
            setMobileOnThisPageOpen(!mobileOnThisPageOpen);
            setMobileMenuOpen(false);
          }}
          className="flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          On this page
          <svg
            className={`h-4 w-4 transition-transform ${
              mobileOnThisPageOpen ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div className="fixed left-0 right-0 bottom-0 top-[106px] z-50 bg-white lg:hidden overflow-y-auto">
          <div className="px-4 pb-8 pt-4">
            <DocsNav
              sections={toc}
              currentSlug={doc.slug}
              onNavigate={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Mobile "On this page" Drawer */}
      {mobileOnThisPageOpen && (
        <div className="fixed left-0 right-0 bottom-0 top-[106px] z-50 bg-white lg:hidden overflow-y-auto">
          <div className="px-4 pb-8 pt-4">
            <MobileOnThisPage
              headings={headings}
              activeId={activeId}
              onClose={() => setMobileOnThisPageOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex gap-6">
            <aside className="sticky top-[97px] hidden h-[calc(100vh-97px)] w-56 shrink-0 lg:block">
              <div className="h-full overflow-y-auto pb-8 pr-2 pt-4">
                <DocsNav sections={toc} currentSlug={doc.slug} />
              </div>
            </aside>

            <section className="min-w-0 flex-1 pb-16 min-h-[calc(100vh-97px)]">
              {(() => {
                const copyButton = (
                  <button
                    type="button"
                    onClick={copyMarkdown}
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                  >
                    {copied ? (
                      <>
                        <svg
                          className="h-4 w-4 text-green-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                        Copy markdown
                      </>
                    )}
                  </button>
                );

                const hasH1 = /^<h1[\s>]/i.test(markdown.trim());

                if (hasH1) {
                  const h1Match = markdown.match(/^(<h1[^>]*>.*?<\/h1>)/is);
                  const h1Html = h1Match ? h1Match[1] : "";
                  const restHtml = h1Match
                    ? markdown.slice(h1Match[0].length)
                    : markdown;

                  return (
                    <>
                      <div className="flex items-start justify-between gap-4 pt-4">
                        <div
                          className="marketplace-markdown flex-1 min-w-0 [&>h1]:!mt-0 [&>h1]:!pt-0"
                          dangerouslySetInnerHTML={{ __html: h1Html }}
                        />
                        {copyButton}
                      </div>
                      <div
                        className="marketplace-markdown pb-2.5"
                        onMouseDown={(event) => {
                          const anchor = (event.target as HTMLElement).closest(
                            "a",
                          );
                          if (anchor?.getAttribute("href")?.startsWith("#")) {
                            event.preventDefault();
                          }
                        }}
                        dangerouslySetInnerHTML={{ __html: restHtml }}
                      />
                    </>
                  );
                }

                return (
                  <>
                    <div className="flex justify-end pt-4 pb-2">
                      {copyButton}
                    </div>
                    <div
                      className="marketplace-markdown pb-2.5"
                      onMouseDown={(event) => {
                        const anchor = (event.target as HTMLElement).closest(
                          "a",
                        );
                        if (anchor?.getAttribute("href")?.startsWith("#")) {
                          event.preventDefault();
                        }
                      }}
                      dangerouslySetInnerHTML={{ __html: markdown }}
                    />
                  </>
                );
              })()}

              {/* Edit on GitHub link */}
              {doc.path && (
                <div className="mt-12">
                  <a
                    href={getDocsGithubLink(doc.path)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    Edit this page on GitHub
                  </a>
                </div>
              )}

              <DocsPageNavigation sections={toc} currentSlug={doc.slug} />
            </section>

            <aside className="sticky top-[97px] hidden h-[calc(100vh-97px)] w-56 flex-shrink-0 xl:block">
              <div className="h-full overflow-y-auto pb-8 pl-2 pt-4">
                <OnThisPage headings={headings} activeId={activeId} />
              </div>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}

function DocsNav({
  sections,
  currentSlug,
  onNavigate,
}: {
  sections: Array<{
    title: string;
    pages: Array<{ slug: string; title?: string }>;
  }>;
  currentSlug: string;
  onNavigate?: () => void;
}) {
  return (
    <div>
      <div className="flex flex-col gap-1 text-sm text-slate-700">
        {sections.map((section, index) => (
          <div key={section.title} className={index === 0 ? "pt-4" : "pt-8"}>
            <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {section.title}
            </p>
            <div className="flex flex-col gap-1">
              {section.pages.map((entry) => {
                const isActive = entry.slug === currentSlug;
                return (
                  <Link
                    key={entry.slug}
                    to="/docs/$slug"
                    params={{ slug: entry.slug }}
                    className={`rounded-md px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? "bg-slate-200 font-semibold text-slate-900"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                    onClick={onNavigate}
                  >
                    {entry.title ?? entry.slug}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OnThisPage({
  headings,
  activeId,
}: {
  headings: DocHeading[];
  activeId: string;
}) {
  if (headings.length === 0) return null;

  return (
    <div className="text-sm text-slate-700">
      <p className="pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        On this page
      </p>
      <div className="flex flex-col">
        {headings.map((heading) => {
          const isActive = heading.id === activeId;
          const indent =
            heading.level === 3 ? "pl-3" : heading.level === 2 ? "pl-1" : "";
          return (
            <button
              key={heading.id}
              type="button"
              className={`text-left text-sm py-1 border-l-2 pl-3 transition-colors ${indent} ${
                isActive
                  ? "border-blue-500 text-slate-900 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
              }`}
              onClick={() => scrollToAnchor(heading.id)}
            >
              {heading.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MobileOnThisPage({
  headings,
  activeId,
  onClose,
}: {
  headings: DocHeading[];
  activeId: string;
  onClose: () => void;
}) {
  if (headings.length === 0) return null;

  return (
    <div className="text-sm text-slate-700">
      <p className="pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        On this page
      </p>
      <div className="flex flex-col">
        {headings.map((heading) => {
          const isActive = heading.id === activeId;
          const indent =
            heading.level === 3 ? "pl-3" : heading.level === 2 ? "pl-1" : "";
          return (
            <button
              key={heading.id}
              type="button"
              className={`text-left text-sm py-2 border-l-2 pl-3 transition-colors ${indent} ${
                isActive
                  ? "border-blue-500 text-slate-900 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
              }`}
              onClick={() => {
                scrollToAnchor(heading.id);
                onClose();
              }}
            >
              {heading.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DocsPageNavigation({
  sections,
  currentSlug,
}: {
  sections: Array<{
    title: string;
    pages: Array<{ slug: string; title?: string }>;
  }>;
  currentSlug: string;
}) {
  const allPages = sections.flatMap((section) => section.pages);
  const currentIndex = allPages.findIndex((page) => page.slug === currentSlug);

  if (currentIndex === -1 || allPages.length <= 1) return null;

  const prevPage = currentIndex > 0 ? allPages[currentIndex - 1] : null;
  const nextPage =
    currentIndex < allPages.length - 1 ? allPages[currentIndex + 1] : null;

  if (!prevPage && !nextPage) return null;

  return (
    <nav className="mt-8 grid grid-cols-2 gap-4 border-t border-slate-200 pt-8">
      <div>
        {prevPage && (
          <Link
            to="/docs/$slug"
            params={{ slug: prevPage.slug }}
            className="group block rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition-colors"
          >
            <span className="text-sm text-slate-400">Previous</span>
            <span className="mt-1 block font-medium text-[#3451b2] group-hover:text-[#3a5ccc]">
              {prevPage.title ?? prevPage.slug}
            </span>
          </Link>
        )}
      </div>
      <div>
        {nextPage && (
          <Link
            to="/docs/$slug"
            params={{ slug: nextPage.slug }}
            className="group block rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition-colors text-right"
          >
            <span className="text-sm text-slate-400">Next</span>
            <span className="mt-1 block font-medium text-[#3451b2] group-hover:text-[#3a5ccc]">
              {nextPage.title ?? nextPage.slug}
            </span>
          </Link>
        )}
      </div>
    </nav>
  );
}

function scrollToAnchor(anchor: string) {
  const element = document.getElementById(anchor);
  if (element && window) {
    window.scrollTo({
      top: element.offsetTop - 120,
      behavior: "smooth",
    });
  }
}

function getDocsGithubLink(relativePath: string) {
  const sanitized = relativePath.replace(/^[./]+/, "");
  return `https://github.com/opral/inlang/blob/main/docs/${sanitized}`;
}

function getDocsJson(filename: string): Promise<string> {
  const loader = docsJsonFiles[`${docsRootPrefix}${filename}`];
  if (!loader) {
    throw new Error(`Missing docs file: ${filename}`);
  }
  return loader();
}

function getDocsMarkdown(relativePath: string): Promise<string> {
  const normalized = relativePath.replace(/^[./]+/, "");
  const loader = docsMarkdownFiles[`${docsRootPrefix}${normalized}`];
  if (!loader) {
    throw new Error(`Missing docs markdown: ${relativePath}`);
  }
  return loader();
}

function extractHeadingsAndInjectIds(html: string): {
  html: string;
  headings: DocHeading[];
} {
  const headings: DocHeading[] = [];
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
