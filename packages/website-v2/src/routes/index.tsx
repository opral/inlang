import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { parse } from "@opral/markdown-wc";
import { useEffect } from "react";
import { initMarkdownInteractive } from "../components/markdown-interactive";
import { getGithubStars } from "../github-stars-cache";
import markdownCss from "../markdown.css?url";
import landingMarkdown from "../../../../README.md?raw";

const ogImage =
  "https://cdn.jsdelivr.net/gh/opral/inlang@latest/packages/website/public/opengraph/inlang-social-image.jpg";

const siteDescription =
  "Inlang is the open-format TMS for software teams. Store translations in your repo as a vendor-neutral file format.";

const loadLandingContent = createServerFn({ method: "GET" }).handler(
  async () => {
    const parsed = await parse(landingMarkdown);
    return { html: parsed.html };
  },
);

export const Route = createFileRoute("/")({
  loader: async () => {
    return await loadLandingContent();
  },
  head: () => ({
    meta: [
      { title: "inlang" },
      {
        name: "description",
        content: siteDescription,
      },
      { name: "og:image", content: ogImage },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: ogImage },
      { name: "twitter:image:alt", content: "inlang" },
      { name: "twitter:title", content: "inlang" },
      {
        name: "twitter:description",
        content: siteDescription,
      },
      { name: "twitter:site", content: "@inlanghq" },
      { name: "twitter:creator", content: "@inlanghq" },
    ],
    links: [{ rel: "stylesheet", href: markdownCss }],
  }),
  component: App,
});

const formatStars = (count: number) => {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return count.toString();
};

function App() {
  const { html } = Route.useLoaderData();
  const githubStars = getGithubStars("opral/inlang");

  useEffect(() => {
    initMarkdownInteractive();
  }, []);

  return (
    <main className="bg-white text-slate-900">
      <section className="pt-10 pb-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6 flex flex-col gap-6">
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight md:text-5xl">
              The open-format TMS for software teams.
            </h1>
            <p className="max-w-xl text-lg leading-8 text-slate-600">
              Store translations in your repo as a vendor-neutral file format,
              so developers, translators, CI, translation tools, and AI agents
              can read and update the same localization source of truth.
            </p>
            <div className="flex gap-12 pt-2">
              <a
                href="https://github.com/opral/inlang"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${githubStars ? formatStars(githubStars) : "2k+"} GitHub stars - view repository`}
                className="group"
              >
                <div className="flex items-center gap-2 text-2xl font-semibold text-slate-900 group-hover:text-slate-700">
                  <svg
                    className="h-5 w-5 text-yellow-500"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z" />
                  </svg>
                  {githubStars ? formatStars(githubStars) : "2k+"}
                </div>
                <div className="text-sm text-slate-500">GitHub stars</div>
              </a>
              <a
                href="https://www.npmjs.com/package/@inlang/sdk"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="500k+ weekly npm downloads - view package"
                className="group"
              >
                <div className="flex items-center gap-2 text-2xl font-semibold text-slate-900 group-hover:text-slate-700">
                  <svg
                    className="h-5 w-5 text-[#CB3837]"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z" />
                  </svg>
                  500k+
                </div>
                <div className="text-sm text-slate-500">weekly downloads</div>
              </a>
              <a
                href="https://github.com/opral/inlang/graphs/contributors"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="115+ contributors - view all contributors"
                className="group"
              >
                <div className="flex items-center gap-2 text-2xl font-semibold text-slate-900 group-hover:text-slate-700">
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                  115+
                </div>
                <div className="text-sm text-slate-500">contributors</div>
              </a>
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                to="/c/tools"
                className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-semibold hover:bg-slate-800 transition-colors"
              >
                Explore tools
              </Link>
              <Link
                to="/docs"
                className="rounded-lg bg-slate-200 text-slate-900 px-4 py-2 text-sm font-semibold hover:bg-slate-300 transition-colors"
              >
                Documentation
              </Link>
            </div>
          </div>
          <div className="lg:col-span-6 flex justify-center lg:justify-end">
            <pre className="text-xs sm:text-sm font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-6 overflow-x-auto">
              {`┌──────────┐      ┌───────────┐      ┌────────────┐
│ i18n lib │      │Translation│      │    CI/CD   │
│          │      │   Tool    │      │ Automation │
└────┬─────┘      └─────┬─────┘      └─────┬──────┘
     │                  │                  │
     └────────┐         │         ┌────────┘
              ▼         ▼         ▼
        ┌────────────────────────────────┐
        │         .inlang file           │
        └────────────────────────────────┘`}
            </pre>
          </div>
        </div>
      </section>

      {/* Tools that read/write the inlang file format section commented out
      <section className="pb-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="border-t border-slate-200 pt-10">
          <SectionHeading title="Tools that read/write the inlang file format" className="max-w-2xl" />
          <p>These are independent tools that read and write .inlang; they are not inlang itself.</p>
          ...
          </div>
        </div>
      </section>
      */}

      <section className="pt-6">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <a
            href="https://github.com/opral/inlang"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between mb-10 px-4 py-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <svg
                className="w-5 h-5 text-slate-700"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.48 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.645.35-1.087.636-1.337-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.268 2.75 1.026A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.026 2.747-1.026.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z" />
              </svg>
              <div>
                <span className="text-sm font-medium text-slate-900">
                  README.md
                </span>
                <span className="text-sm text-slate-500 ml-2">
                  from opral/inlang
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-slate-600 group-hover:text-slate-900">
              View on GitHub
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </div>
          </a>
          <article
            className="marketplace-markdown"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <hr className="border-slate-200 mb-16" />
          <div className="text-center">
            <h2 className="text-2xl font-semibold tracking-tight mb-6">
              Ready to get started?
            </h2>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                to="/c/tools"
                className="rounded-lg bg-slate-900 text-white px-6 py-3 text-sm font-semibold hover:bg-slate-800 transition-colors"
              >
                Explore tools
              </Link>
              <a
                href="https://github.com/opral/inlang"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-slate-300 text-slate-900 px-6 py-3 text-sm font-semibold hover:border-slate-400 hover:bg-slate-50 transition-colors flex items-center gap-2"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                {githubStars ? formatStars(githubStars) : "2k+"} stars
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
