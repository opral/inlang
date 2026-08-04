import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { parse } from "@opral/markdown-wc";
import { useEffect, useState } from "react";
import { initMarkdownInteractive } from "../components/markdown-interactive";
import { getGithubStars } from "../github-stars-cache";
import markdownCss from "../markdown.css?url";
import landingMarkdown from "../../../../README.md?raw";
import kraftHeinzLogo from "../../../../assets/used-by/kraft-heinz.png";
import boseLogo from "../../../../assets/used-by/bose.svg";
import disneyLogo from "../../../../assets/used-by/disney.svg";
import ethZurichLogo from "../../../../assets/used-by/eth-zurich.svg";
import braveLogo from "../../../../assets/used-by/brave.svg";
import michelinLogo from "../../../../assets/used-by/michelin.svg";
import idealistaLogo from "../../../../assets/used-by/idealista.svg";

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
  loader: async () => await loadLandingContent(),
  head: () => ({
    meta: [
      { title: "inlang" },
      { name: "description", content: siteDescription },
      { name: "og:image", content: ogImage },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: ogImage },
      { name: "twitter:image:alt", content: "inlang" },
      { name: "twitter:title", content: "inlang" },
      { name: "twitter:description", content: siteDescription },
      { name: "twitter:site", content: "@inlanghq" },
      { name: "twitter:creator", content: "@inlanghq" },
    ],
    links: [{ rel: "stylesheet", href: markdownCss }],
  }),
  component: LandingPage,
});

const formatStars = (count: number) => {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return count.toString();
};

function ProjectDiagram() {
  const inputs = ["i18n library", "IDE extension", "CI automation", "your own"];

  return (
    <div className="flex w-full max-w-[520px] flex-col items-center py-3">
      <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
        {inputs.map((input, index) => (
          <div className="flex justify-center" key={input}>
            <span
              className={`whitespace-nowrap rounded-[9px] px-2.5 py-1.5 text-xs font-semibold sm:px-2 ${
                index === inputs.length - 1
                  ? "border border-dashed border-slate-300 text-slate-400"
                  : "border border-slate-200 bg-white text-slate-800 shadow-sm"
              }`}
            >
              {input}
            </span>
          </div>
        ))}
      </div>

      <svg
        viewBox="0 0 500 64"
        className="hidden h-16 w-full sm:block"
        aria-hidden="true"
      >
        <path
          d="M62 0V18Q62 26 70 26H180"
          fill="none"
          stroke="#94a3b8"
          strokeWidth="1.5"
        />
        <path d="M188 0V26" fill="none" stroke="#94a3b8" strokeWidth="1.5" />
        <path
          d="M313 0V18Q313 26 305 26H188"
          fill="none"
          stroke="#94a3b8"
          strokeWidth="1.5"
        />
        <path
          d="M438 0V18Q438 26 430 26H313"
          fill="none"
          stroke="#94a3b8"
          strokeWidth="1.5"
        />
        <path d="M250 26V54" fill="none" stroke="#94a3b8" strokeWidth="1.5" />
        <path d="M70 26H430" fill="none" stroke="#94a3b8" strokeWidth="1.5" />
        <polygon points="244,54 256,54 250,63" fill="#94a3b8" />
      </svg>
      <div className="my-5 h-9 w-px bg-slate-300 sm:hidden" />

      <div className="relative w-[280px] max-w-[85vw]">
        <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl border border-slate-200 bg-slate-50" />
        <div className="project-file-card relative overflow-hidden rounded-xl border-[1.5px] border-slate-300 bg-white">
          <div className="absolute right-0 top-0 h-7 w-7 rounded-bl-[10px] bg-slate-200" />
          <div className="border-b border-slate-100 px-5 py-3.5 font-mono text-sm font-semibold text-slate-900">
            project.inlang
          </div>
          <div className="flex flex-col gap-2 px-5 pb-[18px] pt-[13px] font-mono text-xs font-medium">
            {[
              ["en", "Hello world"],
              ["de", "Hallo Welt"],
              ["ja", "こんにちは世界"],
            ].map(([locale, message]) => (
              <div className="flex gap-3.5" key={locale}>
                <span className="w-[17px] text-cyan-700">{locale}</span>
                <span className="text-slate-600">{message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const customerLogos = [
  { src: kraftHeinzLogo, alt: "Kraft Heinz", className: "h-5" },
  { src: boseLogo, alt: "Bose", className: "h-4" },
  { src: disneyLogo, alt: "Disney", className: "h-6" },
  { src: ethZurichLogo, alt: "ETH Zurich", className: "h-4" },
  { src: braveLogo, alt: "Brave", className: "h-[22px]" },
  { src: michelinLogo, alt: "Michelin", className: "h-[22px]" },
  { src: idealistaLogo, alt: "idealista", className: "h-[18px]" },
];

function LandingPage() {
  const { html } = Route.useLoaderData();
  const githubStars = getGithubStars("opral/inlang");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    initMarkdownInteractive();
  }, []);

  const copyInstallCommand = async () => {
    await navigator.clipboard?.writeText("npm i @inlang/sdk");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="bg-white text-slate-900">
      <section className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 px-4 py-14 sm:px-6 md:py-[68px] lg:grid-cols-[1fr_520px] lg:gap-14 lg:px-8">
        <div className="flex flex-col gap-5">
          <h1 className="max-w-2xl text-[40px] font-semibold leading-[1.14] tracking-[-0.025em] text-balance sm:text-5xl">
            The open format TMS for software products.
          </h1>
          <p className="max-w-xl text-[17px] leading-[1.7] text-slate-600 text-pretty">
            Store translations in your repo as a vendor-neutral file format, so
            developers, translators, CI, translation tools, and AI agents can
            read and update the same localization source of truth.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              to="/c/tools"
              className="whitespace-nowrap rounded-[9px] bg-cyan-700 px-[22px] py-3 text-[14.5px] font-semibold text-white transition-colors hover:bg-cyan-800"
            >
              Explore tools
            </Link>
            <Link
              to="/docs"
              className="whitespace-nowrap rounded-[9px] border border-slate-300 bg-white px-[22px] py-3 text-[14.5px] font-semibold text-slate-900 transition-colors hover:border-slate-400"
            >
              Documentation
            </Link>
          </div>
          <div className="flex w-fit max-w-full items-center gap-3 rounded-[9px] border border-slate-200 bg-slate-50 px-4 py-[11px] font-mono text-[13px] font-medium text-slate-600">
            <span className="text-slate-400">$</span>
            <code className="overflow-x-auto whitespace-nowrap">
              npm i @inlang/sdk
            </code>
            <button
              type="button"
              onClick={copyInstallCommand}
              className="border-l border-slate-200 pl-3 text-slate-400 transition-colors hover:text-slate-700"
            >
              {copied ? "copied!" : "copy"}
            </button>
          </div>
        </div>

        <ProjectDiagram />
      </section>

      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start gap-5 px-4 py-[22px] sm:px-6 md:flex-row md:items-center md:gap-9 lg:px-8">
          <span className="shrink-0 font-mono text-[10.5px] font-semibold tracking-[0.12em] text-slate-400">
            USED BY TEAMS AT
          </span>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4 opacity-[0.58] grayscale">
            {customerLogos.map((logo) => (
              <img
                key={logo.alt}
                src={logo.src}
                alt={logo.alt}
                className={`${logo.className} max-w-[112px] object-contain`}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[880px] px-4 pb-6 pt-12 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 px-1 pb-3">
          <div className="flex flex-wrap items-center gap-x-2.5 text-[13.5px]">
            <span className="font-semibold">README.md</span>
            <span className="text-slate-500">from opral/inlang</span>
          </div>
          <a
            href="https://github.com/opral/inlang"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-[13px] font-medium text-slate-600 hover:text-cyan-800"
          >
            View on GitHub →
          </a>
        </div>
        <article
          className="marketplace-markdown rounded-xl border border-slate-200 bg-white px-5 py-8 sm:px-12 sm:py-11"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </section>

      <section className="mx-auto max-w-[880px] px-4 pb-[72px] pt-12 text-center sm:px-6 lg:px-8">
        <hr className="mb-12 border-slate-200" />
        <h2 className="mb-[18px] text-[22px] font-semibold tracking-tight">
          Ready to get started?
        </h2>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            to="/c/tools"
            className="rounded-[9px] bg-cyan-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-cyan-800"
          >
            Explore tools
          </Link>
          <a
            href="https://github.com/opral/inlang"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-[9px] border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-900 transition-colors hover:border-slate-400"
          >
            ★ {githubStars ? formatStars(githubStars) : "2k+"} stars
          </a>
        </div>
      </section>
    </div>
  );
}
