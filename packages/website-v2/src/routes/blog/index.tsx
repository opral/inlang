import { createFileRoute } from "@tanstack/react-router";
import { Link } from "../../components/RouterLink";
import { createServerFn } from "@tanstack/react-start";
import { parse } from "@opral/markdown-wc";
import { getBlogDescription, getBlogTitle } from "../../blog/blogMetadata";

type Author = {
  name: string;
  avatar?: string | null;
};

const ogImage =
  "https://cdn.jsdelivr.net/gh/opral/inlang@latest/packages/website/public/opengraph/inlang-social-image.jpg";

const blogMarkdownFiles = import.meta.glob<string>(
  "../../../../../blog/**/*.md",
  {
    query: "?raw",
    import: "default",
  },
);
const blogJsonFiles = import.meta.glob<string>("../../../../../blog/*.json", {
  query: "?raw",
  import: "default",
});
const blogRootPrefix = "../../../../../blog/";

const loadBlogIndex = createServerFn({ method: "GET" }).handler(async () => {
  // Load authors
  const authorsContent = await getBlogJson("authors.json");
  const authorsMap = JSON.parse(authorsContent) as Record<
    string,
    { name: string; avatar?: string | null }
  >;

  // Load table of contents
  const tocContent = await getBlogJson("table_of_contents.json");
  const toc = JSON.parse(tocContent) as Array<{
    path: string;
    slug: string;
    date?: string;
    authors?: string[];
  }>;

  const posts = await Promise.all(
    toc.map(async (item) => {
      const relativePath = item.path.startsWith("./")
        ? item.path.slice(2)
        : item.path;
      const rawMarkdown = await getBlogMarkdown(relativePath);
      const parsed = await parse(rawMarkdown);
      const title = getBlogTitle({
        rawMarkdown,
        frontmatter: parsed.frontmatter,
      });
      const description = getBlogDescription({
        rawMarkdown,
        frontmatter: parsed.frontmatter,
      });

      // Resolve author IDs to author objects
      const authors = item.authors
        ?.map((authorId) => authorsMap[authorId])
        .filter(Boolean) as Author[] | undefined;

      // Extract og:image from frontmatter - use relative paths for local assets
      const ogImageRaw =
        typeof parsed.frontmatter?.["og:image"] === "string"
          ? parsed.frontmatter["og:image"]
          : undefined;
      const ogImage = ogImageRaw
        ? resolveLocalBlogAsset(ogImageRaw, item.slug)
        : undefined;

      return {
        slug: item.slug,
        title,
        description,
        date: item.date,
        authors,
        ogImage,
      };
    }),
  );

  posts.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return { posts };
});

export const Route = createFileRoute("/blog/")({
  loader: async () => {
    return await loadBlogIndex();
  },
  head: () => ({
    links: [{ rel: "canonical", href: "https://inlang.com/blog" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Blog",
          name: "Blog | inlang",
          description:
            "Insights on localization (i18n) and building the inlang ecosystem.",
          url: "https://inlang.com/blog",
        }),
      },
    ],
    meta: [
      { title: "Blog | inlang" },
      {
        name: "description",
        content:
          "Insights on localization (i18n) and building the inlang ecosystem.",
      },
      { property: "og:title", content: "Blog | inlang" },
      {
        property: "og:description",
        content:
          "Insights on localization (i18n) and building the inlang ecosystem.",
      },
      { property: "og:url", content: "https://inlang.com/blog" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "inlang" },
      { property: "og:locale", content: "en_US" },
      { property: "og:image", content: ogImage },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: ogImage },
      { name: "twitter:image:alt", content: "inlang blog" },
      { name: "twitter:title", content: "Blog | inlang" },
      {
        name: "twitter:description",
        content:
          "Insights on localization (i18n) and building the inlang ecosystem.",
      },
      { name: "twitter:site", content: "@inlanghq" },
    ],
  }),
  component: BlogIndexPage,
});

function BlogIndexPage() {
  const { posts } = Route.useLoaderData();

  return (
    <main className="bg-white text-slate-900">
      <div className="mx-auto max-w-3xl px-6 py-16">
        {/* Header */}
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 mb-6">
          Blog
        </h1>

        {/* Subscribe CTA */}
        <form
          action="https://buttondown.com/api/emails/embed-subscribe/inlangs-blog"
          method="post"
          target="_blank"
          className="mb-12"
        >
          <p className="text-sm text-slate-500 mb-3">
            Get notified about new blog posts
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              name="email"
              placeholder="your@email.com"
              required
              className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
            />
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-slate-900 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
            >
              Subscribe
            </button>
          </div>
        </form>

        {/* Blog post list */}
        <div className="flex flex-col gap-6">
          {posts.map((post) => (
            <Link
              key={post.slug}
              to="/blog/$slug"
              params={{ slug: post.slug }}
              className="group block rounded-xl p-6 -mx-6 hover:bg-slate-50 transition-colors"
            >
              <article className="flex gap-6">
                {/* OG Image */}
                {post.ogImage && (
                  <div className="flex-shrink-0 w-40 h-24 rounded-lg overflow-hidden bg-slate-100">
                    <img
                      src={post.ogImage}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-semibold text-slate-900 group-hover:text-slate-700 transition-colors">
                    {post.title ?? post.slug}
                  </h2>
                  <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                    {post.authors && post.authors.length > 0 && (
                      <>
                        {post.authors.map((author, index) => (
                          <div key={index} className="flex items-center gap-2">
                            {author.avatar ? (
                              <img
                                src={author.avatar}
                                alt={author.name}
                                className="w-5 h-5 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-slate-300 flex items-center justify-center text-xs text-slate-600 font-medium">
                                {author.name.charAt(0)}
                              </div>
                            )}
                            <span>{author.name}</span>
                          </div>
                        ))}
                        {post.date && <span className="text-slate-300">·</span>}
                      </>
                    )}
                    {post.date && <time>{formatDate(post.date)}</time>}
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

function getBlogJson(filename: string): Promise<string> {
  const loader = blogJsonFiles[`${blogRootPrefix}${filename}`];
  if (!loader) {
    throw new Error(`Missing blog file: ${filename}`);
  }
  return loader();
}

function getBlogMarkdown(relativePath: string): Promise<string> {
  const normalized = relativePath.replace(/^[./]+/, "");
  const loader = blogMarkdownFiles[`${blogRootPrefix}${normalized}`];
  if (!loader) {
    throw new Error(`Missing blog markdown: ${relativePath}`);
  }
  return loader();
}

function resolveLocalBlogAsset(value: string, slug: string): string {
  // If it's already an absolute URL, return as-is
  if (/^[a-z][a-z0-9+.-]*:/.test(value)) return value;
  // Convert relative paths (like ./assets/image.png) to /blog/slug/assets/image.png
  const normalized = value.replace(/^\.\//, "");
  return `/blog/${slug}/${normalized}`;
}
