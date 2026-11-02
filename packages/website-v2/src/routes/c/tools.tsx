import { createFileRoute, Link } from "@tanstack/react-router";
import { registry } from "@inlang/marketplace-registry";
import { getStandaloneSiteRedirect } from "../../marketplace/legacyRedirects";
import {
  buildCategoryHead,
  marketplaceItemUrl,
  textOf,
} from "../../marketplace/categorySeo";
import { toolFacts } from "../../marketplace/categoryFacts";

const toolsTitle =
  "Tools for inlang: web editor, VS Code, CLI and i18n library | inlang";

const toolsDescription =
  "inlang tools work on the project.inlang folder in your Git repo: Fink, a web editor for translators; Sherlock for VS Code; the inlang CLI for checks in CI and machine translation; and Paraglide JS, an i18n library.";

type RegistryItem = (typeof registry)[number];

const prioritizedTools = new Map([
  ["paraglide js", 0],
  ["inlang cli", 1],
]);

// Filter tools and libraries from the registry
const tools = registry
  .filter((item) => {
    const itemType = item.id.split(".")[0];
    return (itemType === "app" || itemType === "library") && !item.deprecated;
  })
  .sort((a, b) => {
    const aName =
      typeof a.displayName === "object" ? a.displayName.en : a.displayName;
    const bName =
      typeof b.displayName === "object" ? b.displayName.en : b.displayName;
    const aKey = aName.toLowerCase();
    const bKey = bName.toLowerCase();
    const aPriority =
      prioritizedTools.get(aKey) ?? (aKey.startsWith("sherlock") ? 2 : 3);
    const bPriority =
      prioritizedTools.get(bKey) ?? (bKey.startsWith("sherlock") ? 2 : 3);

    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    return aName.localeCompare(bName);
  });

export const Route = createFileRoute("/c/tools")({
  head: () =>
    buildCategoryHead({
      path: "/c/tools",
      title: toolsTitle,
      description: toolsDescription,
      items: tools.map((item) => {
        // Items with their own website are listed with that address.
        const standaloneSite = getStandaloneSiteRedirect(item.uniqueID);
        return {
          name: textOf(item.displayName),
          description: textOf(item.description),
          url: standaloneSite?.href ?? marketplaceItemUrl(item),
        };
      }),
    }),
  component: ToolsPage,
});

function ToolsPage() {
  return (
    <main className="bg-white text-slate-900">
      {/* Header */}
      <section className="border-b border-slate-200 bg-slate-50 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            A tool for every localization need
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">
            Tools for translators, developers and CI. They all work on the same
            project.inlang folder in your repo.
          </p>
          <div className="mt-6">
            <Link
              to="/docs/$slug"
              params={{ slug: "write-tool" }}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
            >
              Build your own tool
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Tools Grid */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tools.map((item) => (
              <ToolCard key={item.id} item={item} />
            ))}
            <BuildYourOwnCard />
          </div>
        </div>
      </section>
    </main>
  );
}

function ToolCard({ item }: { item: RegistryItem }) {
  const facts = toolFacts[item.id];
  const displayName = textOf(item.displayName);
  const description = textOf(item.description);
  const slug = item.id.replaceAll(".", "-");
  const isExternal = item.keywords
    ?.map((k) => k.toLowerCase())
    .includes("external");
  // Items with their own website link there directly (inlang.com redirects).
  const standaloneSite = getStandaloneSiteRedirect(item.uniqueID);
  const cardClassName =
    "group flex flex-col rounded-xl border border-slate-200 bg-white transition-all hover:border-slate-300 hover:shadow-md";
  const cardContent = (
    <>
      {/* Icon */}
      <div className="p-4 pb-0">
        {item.icon ? (
          <img
            src={item.icon}
            alt={displayName}
            className="h-10 w-10 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 text-lg font-semibold text-white">
            {displayName[0]}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4 pt-3">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-[15px] font-bold text-slate-800 group-hover:text-slate-900">
            {displayName}
          </h3>
          {(isExternal || standaloneSite) && (
            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
              External
            </span>
          )}
        </div>
        <p className="line-clamp-2 text-sm text-slate-500 group-hover:text-slate-600">
          {description}
        </p>
        {facts && (
          <p className="mt-3 flex-1 text-xs leading-relaxed text-slate-500">
            <span className="font-medium text-slate-700">
              For {facts.audience}.
            </span>{" "}
            {facts.use}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">
        {item.publisherIcon ? (
          <img
            src={item.publisherIcon}
            alt={String(item.publisherName)}
            className="h-5 w-5 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">
            {String(item.publisherName)?.[0] || "?"}
          </div>
        )}
        <span className="text-sm text-slate-500">
          {String(item.publisherName)}
        </span>
      </div>
    </>
  );

  if (standaloneSite) {
    return (
      <a
        href={standaloneSite.href}
        target="_blank"
        rel="noreferrer"
        className={cardClassName}
      >
        {cardContent}
      </a>
    );
  }

  return (
    <Link
      to="/m/$uid/$slug"
      params={{ uid: item.uniqueID, slug }}
      className={cardClassName}
    >
      {cardContent}
    </Link>
  );
}

function BuildYourOwnCard() {
  return (
    <Link
      to="/docs/$slug"
      params={{ slug: "write-tool" }}
      className="group flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center transition-all hover:border-slate-400 hover:bg-slate-100"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-slate-600 transition-colors group-hover:bg-slate-300 group-hover:text-slate-700">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </div>
      <div>
        <h3 className="font-semibold text-slate-700 group-hover:text-slate-900">
          Build your own
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Create and publish your tool
        </p>
      </div>
    </Link>
  );
}
