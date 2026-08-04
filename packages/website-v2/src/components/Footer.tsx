import { Link } from "@tanstack/react-router";

const socialMediaLinks = [
  {
    name: "X",
    href: "https://x.com/inlangHQ",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 23"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M18.8782 0.660156H22.5582L14.4782 9.86016L23.9182 22.3402H16.5102L10.7102 14.7562L4.07016 22.3402H0.390156L8.95016 12.5002L-0.0898438 0.660156H7.50216L12.7422 7.58816L18.8782 0.660156ZM17.5902 20.1802H19.6302L6.43016 2.74016H4.23816L17.5902 20.1802Z"
          fill="currentColor"
        />
      </svg>
    ),
  },
  {
    name: "GitHub",
    href: "https://github.com/opral/inlang",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
      </svg>
    ),
  },
  {
    name: "Discord",
    href: "https://discord.gg/gdMPPWy57R",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
      </svg>
    ),
  },
];

const resourceLinks = [
  { name: "Documentation", href: "/docs" },
  { name: "Blog", href: "/blog" },
];

const categoriesLinks = [
  { name: "Tools", href: "/c/tools" },
  { name: "Plugins", href: "/c/plugins" },
  {
    name: "Validation Rules",
    href: "https://github.com/opral/lix/issues/239",
  },
];

const contactLinks = [
  { name: "Get in Touch", href: "mailto:hello@inlang.com" },
];

export default function Footer() {
  return (
    <footer className="w-full border-t border-slate-200 bg-slate-50">
      <div className="mx-auto flex max-w-7xl flex-row flex-wrap-reverse gap-10 px-6 py-16 sm:gap-x-0 md:gap-y-10 xl:gap-0">
        {/* Brand column */}
        <div className="flex w-full flex-col gap-4 md:w-1/4">
          <Link to="/" className="flex w-fit items-center">
            <img
              className="h-9 w-9"
              src="/favicon/safari-pinned-tab.svg"
              alt="inlang logo"
            />
            <span className="self-center pl-2 text-left font-semibold text-slate-900">
              inlang
            </span>
          </Link>
          <p className="pt-0.5 text-sm text-slate-600">
            The open format TMS for software products.
          </p>
          <div className="flex flex-wrap gap-6 pt-1">
            {socialMediaLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center space-x-2 text-slate-600 transition-colors hover:text-slate-900"
              >
                {link.icon}
                <span className="sr-only">{link.name}</span>
              </a>
            ))}
          </div>
        </div>

        {/* Resources column */}
        <div className="flex w-full flex-col pt-2 sm:w-1/3 md:w-1/4">
          <p className="pb-3 font-semibold text-slate-900">Resources</p>
          {resourceLinks.map((link) =>
            link.href.startsWith("/") ? (
              <div key={link.name} className="w-fit opacity-80">
                <Link
                  to={link.href}
                  className="block py-1.5 text-sm text-slate-700 hover:text-slate-900"
                >
                  {link.name}
                </Link>
              </div>
            ) : (
              <div key={link.name} className="w-fit opacity-80">
                <a
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="block py-1.5 text-sm text-slate-700 hover:text-slate-900"
                >
                  {link.name}
                </a>
              </div>
            ),
          )}
        </div>

        {/* Ecosystem column */}
        <div className="flex w-full flex-col pt-2 sm:w-1/3 md:w-1/4">
          <p className="pb-3 font-semibold text-slate-900">Ecosystem</p>
          {categoriesLinks.map((link) =>
            link.href.startsWith("/") ? (
              <div key={link.name} className="w-fit opacity-80">
                <Link
                  to={link.href}
                  className="block py-1.5 text-sm text-slate-700 hover:text-slate-900"
                >
                  {link.name}
                </Link>
              </div>
            ) : (
              <div key={link.name} className="w-fit opacity-80">
                <a
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="block py-1.5 text-sm text-slate-700 hover:text-slate-900"
                >
                  {link.name}
                </a>
              </div>
            ),
          )}
        </div>

        {/* Contact column */}
        <div className="flex w-full flex-col pt-2 sm:w-1/3 md:w-1/4">
          <p className="pb-3 font-semibold text-slate-900">Let's talk</p>
          {contactLinks.map((link) => (
            <div key={link.name} className="w-fit opacity-80">
              <a
                href={link.href}
                target={link.href.startsWith("/") ? undefined : "_blank"}
                rel={link.href.startsWith("/") ? undefined : "noreferrer"}
                className="block py-1.5 text-sm text-slate-700 hover:text-slate-900"
              >
                {link.name}
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom section */}
      <div className="mx-auto flex max-w-7xl items-center justify-end px-6 pb-16">
        <a
          href="https://opral.com"
          target="_blank"
          rel="noreferrer"
          className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          Copyright 2026 Opral
        </a>
      </div>
    </footer>
  );
}
