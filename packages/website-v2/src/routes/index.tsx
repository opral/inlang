import { createFileRoute } from "@tanstack/react-router";
import { Link } from "../components/RouterLink";
import { createServerFn } from "@tanstack/react-start";
import { parse } from "@opral/markdown-wc";
import { useEffect } from "react";
import { registry } from "@inlang/marketplace-registry";
import { initMarkdownInteractive } from "../components/markdown-interactive";
import { getGithubStars } from "../github-stars-cache";
import markdownCss from "../markdown.css?url";
import landingMarkdown from "../content/landingpage.md?raw";

const ogImage =
  "https://cdn.jsdelivr.net/gh/opral/inlang@latest/packages/website/public/opengraph/inlang-social-image.jpg";

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
        content:
          "Inlang is an open file format for localizing software (i18n). One file format, multiple solutions, all interoperable.",
      },
      { name: "og:image", content: ogImage },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: ogImage },
      { name: "twitter:image:alt", content: "inlang" },
      { name: "twitter:title", content: "inlang" },
      {
        name: "twitter:description",
        content:
          "Inlang is an open file format for localizing software (i18n). One file format, multiple solutions, all interoperable.",
      },
      { name: "twitter:site", content: "@inlanghq" },
      { name: "twitter:creator", content: "@inlanghq" },
    ],
    links: [{ rel: "stylesheet", href: markdownCss }],
  }),
  component: App,
});

const featuredIds = [
  "library.inlang.paraglideJs",
  "app.inlang.ideExtension",
  "app.inlang.cli",
];

const toolStats: Record<
  string,
  { value: string; label: string; type: "npm" | "vscode" }
> = {
  "library.inlang.paraglideJs": {
    value: "90k",
    label: "weekly downloads",
    type: "npm",
  },
  "app.inlang.ideExtension": {
    value: "60k",
    label: "installs",
    type: "vscode",
  },
  "app.inlang.cli": { value: "40k", label: "weekly downloads", type: "npm" },
};

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
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
              The open file format for localization (i18n) tools.
            </h1>
            <p className="text-lg text-slate-600 max-w-xl">
              Build i18n libraries, translation editors, and automation. All
              interoperable.
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
                aria-label="130k+ weekly npm downloads - view package"
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
                  130k+
                </div>
                <div className="text-sm text-slate-500">weekly downloads</div>
              </a>
              <a
                href="https://github.com/opral/inlang/graphs/contributors"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="105+ contributors - view all contributors"
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
                  105+
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

      <section className="pb-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight mb-6">
            Popular tools
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {featuredIds.map((id) => {
              const manifest = registry.find((item) => item.id === id);
              if (!manifest) return null;
              const displayName =
                typeof manifest.displayName === "object"
                  ? manifest.displayName.en
                  : manifest.displayName;
              const description =
                typeof manifest.description === "object"
                  ? manifest.description.en
                  : manifest.description;
              const slug = manifest.id.replaceAll(".", "-");
              const stats = toolStats[id];
              return (
                <Link
                  key={manifest.id}
                  to="/m/$uid/$slug"
                  params={{ uid: manifest.uniqueID, slug }}
                  className="border border-slate-200 rounded-xl p-5 hover:border-slate-300 hover:shadow-sm transition-all bg-white flex flex-col"
                >
                  <div className="flex items-start gap-3">
                    {manifest.icon ? (
                      <img
                        src={manifest.icon}
                        alt={displayName}
                        className="w-10 h-10 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-slate-800 text-white flex items-center justify-center font-semibold">
                        {displayName[0]}
                      </div>
                    )}
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        {displayName}
                      </h3>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-slate-600 flex-grow">
                    {description}
                  </p>
                  {stats && (
                    <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 text-sm text-slate-600">
                      {stats.type === "npm" ? (
                        <svg
                          className="h-4 w-4 text-[#CB3837]"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z" />
                        </svg>
                      ) : (
                        <svg
                          className="h-4 w-4 text-[#007ACC]"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z" />
                        </svg>
                      )}
                      <span className="font-medium">{stats.value}</span>
                      <span>{stats.label}</span>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
          <div className="mt-4 text-center">
            <Link
              to="/docs/$slug"
              params={{ slug: "write-tool" }}
              className="text-sm font-medium text-[#3451b2] underline underline-offset-2 hover:text-[#3a5ccc] transition-colors"
            >
              Build your own tool →
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6">
        <hr className="border-slate-200" />
      </div>

      <section>
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
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
