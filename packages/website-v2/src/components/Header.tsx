import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { getGithubStars } from "../github-stars-cache";

const ecosystemLinks = [
  { label: "Tools", to: "/c/tools" },
  { label: "Plugins", to: "/c/plugins" },
  {
    label: "Validation rules",
    to: "https://github.com/opral/lix/issues/239",
    external: true,
  },
];

const formatStars = (count: number) => {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return count.toString();
};

function GithubStars({ count }: { count: number | null }) {
  return (
    <a
      href="https://github.com/opral/inlang"
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
      aria-label={`${count ? formatStars(count) : "2k+"} GitHub stars`}
    >
      <span className="text-yellow-500" aria-hidden="true">
        ★
      </span>
      {count ? formatStars(count) : "2k+"}
      <span className="font-medium text-slate-400">GitHub</span>
    </a>
  );
}

export default function Header() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const githubStars = getGithubStars("opral/inlang");

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-[60px] max-w-[1200px] items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2.5 text-slate-900 transition-opacity hover:opacity-75"
          onClick={() => setMobileMenuOpen(false)}
        >
          <img
            src="/favicon/safari-pinned-tab.svg"
            alt=""
            className="h-[26px] w-[26px]"
          />
          <span className="text-[16.5px] font-semibold tracking-tight">
            inlang
          </span>
        </Link>

        <nav className="hidden items-center gap-[22px] text-sm font-medium md:flex">
          <Link
            to="/docs"
            className={
              location.pathname.startsWith("/docs")
                ? "text-cyan-700"
                : "text-slate-700 hover:text-cyan-700"
            }
          >
            Docs
          </Link>
          <Link
            to="/blog"
            className={
              location.pathname.startsWith("/blog")
                ? "text-cyan-700"
                : "text-slate-700 hover:text-cyan-700"
            }
          >
            Blog
          </Link>
        </nav>

        <div className="ml-auto hidden items-center gap-3 md:flex">
          <GithubStars count={githubStars} />
          <Link
            to="/c/tools"
            className="rounded-lg bg-cyan-700 px-[15px] py-2 text-[13.5px] font-semibold text-white transition-colors hover:bg-cyan-800"
          >
            Explore tools
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setMobileMenuOpen((open) => !open)}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 md:hidden"
          aria-label="Toggle navigation"
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? (
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          ) : (
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          )}
        </button>
      </div>

      <div className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto hidden max-w-[1200px] items-center gap-5 px-4 py-2 sm:px-6 md:flex lg:px-8">
          <span className="shrink-0 font-mono text-[10.5px] font-semibold tracking-[0.12em] text-slate-400">
            BUILT ON INLANG
          </span>
          <nav className="flex items-center gap-5 text-[13.5px] font-medium">
            {ecosystemLinks.map((link) =>
              link.external ? (
                <a
                  key={link.label}
                  href={link.to}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-600 hover:text-slate-900"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.label}
                  to={link.to}
                  className={
                    location.pathname === link.to
                      ? "font-semibold text-cyan-700"
                      : "text-slate-600 hover:text-slate-900"
                  }
                >
                  {link.label}
                </Link>
              ),
            )}
          </nav>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="border-t border-slate-200 bg-white px-4 py-4 md:hidden">
          <nav className="mx-auto flex max-w-[1200px] flex-col gap-1 text-sm font-medium">
            <Link
              to="/docs"
              className="rounded-md px-3 py-2 text-slate-700 hover:bg-slate-50"
              onClick={() => setMobileMenuOpen(false)}
            >
              Docs
            </Link>
            <Link
              to="/blog"
              className="rounded-md px-3 py-2 text-slate-700 hover:bg-slate-50"
              onClick={() => setMobileMenuOpen(false)}
            >
              Blog
            </Link>
            <div className="my-2 border-t border-slate-200" />
            <span className="px-3 pb-1 font-mono text-[10.5px] font-semibold tracking-[0.12em] text-slate-400">
              BUILT ON INLANG
            </span>
            {ecosystemLinks.map((link) =>
              link.external ? (
                <a
                  key={link.label}
                  href={link.to}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md px-3 py-2 text-slate-700 hover:bg-slate-50"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.label}
                  to={link.to}
                  className="rounded-md px-3 py-2 text-slate-700 hover:bg-slate-50"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ),
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3 px-3">
              <GithubStars count={githubStars} />
              <Link
                to="/c/tools"
                className="rounded-lg bg-cyan-700 px-4 py-2 text-[13.5px] font-semibold text-white"
                onClick={() => setMobileMenuOpen(false)}
              >
                Explore tools
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
