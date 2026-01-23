import { createFileRoute } from "@tanstack/react-router";
import { Link } from "../../components/RouterLink";
import { registry } from "@inlang/marketplace-registry";

const ogImage =
  "https://cdn.jsdelivr.net/gh/opral/inlang@latest/packages/website/public/opengraph/inlang-social-image.jpg";

export const Route = createFileRoute("/c/plugins")({
  head: () => ({
    meta: [
      { title: "Localization Plugins | inlang" },
      {
        name: "description",
        content:
          "Find everything localization (i18n) related to plugins - inlang",
      },
      { name: "og:image", content: ogImage },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: ogImage },
      {
        name: "twitter:image:alt",
        content: "inlang's ecosystem helps organizations to localize software.",
      },
      { name: "twitter:title", content: "Localization Plugins | inlang" },
      {
        name: "twitter:description",
        content:
          "Find everything localization (i18n) related to plugins - inlang",
      },
      { name: "twitter:site", content: "@inlanghq" },
      { name: "twitter:creator", content: "@inlanghq" },
    ],
  }),
  component: PluginsPage,
});

// Filter plugins from the registry
const plugins = registry
  .filter((item) => {
    const itemType = item.id.split(".")[0];
    return itemType === "plugin" && !item.deprecated;
  })
  .sort((a, b) => {
    const aName =
      typeof a.displayName === "object" ? a.displayName.en : a.displayName;
    const bName =
      typeof b.displayName === "object" ? b.displayName.en : b.displayName;
    return aName.localeCompare(bName);
  });

function PluginsPage() {
  return (
    <main className="bg-white text-slate-900">
      {/* Header */}
      <section className="border-b border-slate-200 bg-slate-50 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Plugins
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">
            Extend inlang with plugins for different file formats, frameworks,
            and workflows. Import and export translations in the format you
            need.
          </p>
          <div className="mt-6">
            <Link
              to="/docs/$slug"
              params={{ slug: "write-plugin" }}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
            >
              Build your own plugin
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

      {/* Plugins Grid */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {plugins.map((item) => (
              <PluginCard key={item.id} item={item} />
            ))}
            <BuildYourOwnCard />
          </div>
        </div>
      </section>
    </main>
  );
}

function PluginCard({ item }: { item: (typeof registry)[number] }) {
  const displayName =
    typeof item.displayName === "object"
      ? item.displayName.en
      : item.displayName;
  const description =
    typeof item.description === "object"
      ? item.description.en
      : item.description;
  const slug = item.id.replaceAll(".", "-");

  return (
    <Link
      to="/m/$uid/$slug"
      params={{ uid: item.uniqueID, slug }}
      className="group flex flex-col rounded-xl border border-slate-200 bg-white transition-all hover:border-slate-300 hover:shadow-md"
    >
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
        <h3 className="mb-2 text-[15px] font-bold text-slate-800 group-hover:text-slate-900">
          {displayName}
        </h3>
        <p className="line-clamp-2 flex-1 text-sm text-slate-500 group-hover:text-slate-600">
          {description}
        </p>
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
    </Link>
  );
}

function BuildYourOwnCard() {
  return (
    <Link
      to="/docs/$slug"
      params={{ slug: "write-plugin" }}
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
          Create and publish your plugin
        </p>
      </div>
    </Link>
  );
}
