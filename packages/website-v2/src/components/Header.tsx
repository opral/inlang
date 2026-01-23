import { useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Link } from "./RouterLink";
import { getGithubStars } from "../github-stars-cache";

const ecosystemLinks = [
  {
    label: "Tools",
    to: "/c/tools",
    icon: (
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.3 7 8.7 5 8.7-5" />
        <path d="M12 22V12" />
      </svg>
    ),
  },
  {
    label: "Plugins",
    to: "/c/plugins",
    icon: (
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect width="7" height="7" x="14" y="3" rx="1" />
        <path d="M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3" />
      </svg>
    ),
  },
  {
    label: "Validation Rules",
    to: "https://github.com/opral/lix/issues/239",
    external: true,
    icon: (
      <span
        className="text-sm"
        style={{
          textDecoration: "underline",
          textDecorationStyle: "wavy",
          textUnderlineOffset: "2px",
        }}
      >
        Aa
      </span>
    ),
  },
];

export default function Header() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const githubStars = getGithubStars("opral/inlang");

  const formatStars = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
    }
    return count.toString();
  };

  return (
    <header className="sticky top-0 z-50 w-full">
      {/* Top header: Site-level navigation */}
      <div className="bg-white border-b border-slate-200">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4">
          {/* Left side: Logo */}
          <Link to="/" className="flex items-center gap-2 hover:opacity-80">
            <img
              src="/favicon/safari-pinned-tab.svg"
              alt="inlang"
              className="h-8 w-8"
            />
            <span className="text-lg font-semibold text-slate-900">inlang</span>
          </Link>

          {/* Right side: Blog + Documentation | X Discord | GitHub Stars */}
          <nav className="hidden items-center gap-4 text-sm font-medium text-slate-600 sm:flex">
            <Link
              to="/docs"
              className={`hover:text-[color:var(--vp-c-brand-2)] ${
                location.pathname.startsWith("/docs")
                  ? "text-[color:var(--vp-c-brand-2)]"
                  : ""
              }`}
            >
              Documentation
            </Link>
            <Link
              to="/blog"
              className={`hover:text-[color:var(--vp-c-brand-2)] ${
                location.pathname.startsWith("/blog")
                  ? "text-[color:var(--vp-c-brand-2)]"
                  : ""
              }`}
            >
              Blog
            </Link>

            {/* Divider */}
            <div className="h-4 w-px bg-slate-300" />

            {/* Social icons: X and Discord */}
            <div className="flex items-center gap-3">
              {/* X (Twitter) */}
              <a
                href="https://x.com/inlangHQ"
                target="_blank"
                rel="noreferrer"
                className="text-slate-900 hover:text-slate-600 transition-colors"
                aria-label="Follow on X"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>

              {/* Discord */}
              <a
                href="https://discord.gg/Dcs6MMJUzF"
                target="_blank"
                rel="noreferrer"
                className="text-slate-900 hover:text-slate-600 transition-colors"
                aria-label="Join Discord"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
              </a>
            </div>

            {/* Divider */}
            <div className="h-4 w-px bg-slate-300" />

            {/* GitHub with stars */}
            <a
              href="https://github.com/opral/inlang"
              target="_blank"
              rel="noreferrer"
              className="group inline-flex items-center gap-1.5 text-sm font-medium text-slate-900 hover:text-slate-600 transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              GitHub
              {githubStars !== null && (
                <span
                  className="inline-flex items-center gap-1"
                  title={`${githubStars.toLocaleString()} GitHub stars`}
                >
                  <span className="relative h-3.5 w-3.5" aria-hidden="true">
                    {/* Outlined star - visible by default, hidden on hover */}
                    <svg
                      className="absolute inset-0 h-3.5 w-3.5 text-slate-400 group-hover:opacity-0 transition-opacity"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    {/* Filled star - hidden by default, visible on hover */}
                    <svg
                      className="absolute inset-0 h-3.5 w-3.5 text-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                    >
                      <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z" />
                    </svg>
                  </span>
                  <span
                    aria-label={`${githubStars.toLocaleString()} GitHub stars`}
                  >
                    {formatStars(githubStars)}
                  </span>
                </span>
              )}
            </a>
          </nav>

          {/* Mobile hamburger button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 sm:hidden"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Subheader: Ecosystem categories */}
      <div className="bg-slate-50 border-b border-slate-200">
        <div className="mx-auto hidden max-w-7xl items-center gap-1 px-4 py-2 sm:flex sm:px-6">
          <span className="mr-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Ecosystem
          </span>
          <nav className="flex items-center gap-5 text-sm font-medium text-slate-600">
            {ecosystemLinks.map((link) => {
              const isCurrentCategory =
                !link.external && location.pathname === link.to;

              return link.external ? (
                <a
                  key={link.label}
                  href={link.to}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 hover:text-slate-900"
                >
                  {link.icon}
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.label}
                  to={link.to}
                  className={`flex items-center gap-1.5 transition-colors ${
                    isCurrentCategory
                      ? "text-cyan-600 font-semibold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {link.icon}
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="bg-slate-50 border-b border-slate-200 px-4 pb-4 sm:hidden">
          <nav className="flex flex-col">
            <span className="pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Ecosystem
            </span>
            {ecosystemLinks.map((link) => {
              const isActive = !link.external && location.pathname === link.to;

              return link.external ? (
                <a
                  key={link.label}
                  href={link.to}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.icon}
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.label}
                  to={link.to}
                  className={`flex items-center gap-1.5 py-2.5 text-sm font-medium ${
                    isActive
                      ? "text-cyan-600"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.icon}
                  {link.label}
                </Link>
              );
            })}

            <div className="my-2 h-px bg-slate-200" />

            <Link
              to="/docs"
              className="py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900"
              onClick={() => setMobileMenuOpen(false)}
            >
              Documentation
            </Link>
            <Link
              to="/blog"
              className="py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900"
              onClick={() => setMobileMenuOpen(false)}
            >
              Blog
            </Link>

            <div className="my-2 h-px bg-slate-200" />

            {/* Social links */}
            <div className="flex items-center gap-4 py-2.5">
              <a
                href="https://github.com/opral/inlang"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
                onClick={() => setMobileMenuOpen(false)}
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                GitHub
                {githubStars !== null && (
                  <span
                    className="inline-flex items-center gap-0.5 pr-1 text-slate-500"
                    title={`${githubStars.toLocaleString()} GitHub stars`}
                  >
                    <svg
                      className="h-3 w-3 text-yellow-500"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z" />
                    </svg>
                    <span
                      aria-label={`${githubStars.toLocaleString()} GitHub stars`}
                    >
                      {formatStars(githubStars)}
                    </span>
                  </span>
                )}
              </a>
              <a
                href="https://x.com/inlangHQ"
                target="_blank"
                rel="noreferrer"
                className="text-slate-900 hover:text-slate-600"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Follow on X"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="https://discord.gg/Dcs6MMJUzF"
                target="_blank"
                rel="noreferrer"
                className="text-slate-900 hover:text-slate-600"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Join Discord"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
