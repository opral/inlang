import {
  HeadContent,
  Scripts,
  createRootRoute,
  useRouter,
} from "@tanstack/react-router";
import React from "react";
import appCss from "../styles.css?url";
import Header from "../components/Header";
import Footer from "../components/Footer";

const GA_MEASUREMENT_ID = "G-5H3SDF7TVZ";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "inlang" },
      { name: "theme-color", content: "#ffffff" },
      { name: "robots", content: "index, follow" },
    ],
    links: [
      { rel: "preconnect", href: "https://rsms.me/" },
      { rel: "stylesheet", href: "https://rsms.me/inter/inter.css" },
      { rel: "stylesheet", href: appCss },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/favicon/apple-touch-icon.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon/favicon-32x32.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        href: "/favicon/favicon-16x16.png",
      },
      { rel: "manifest", href: "/favicon/site.webmanifest" },
      {
        rel: "mask-icon",
        href: "/favicon/safari-pinned-tab.svg",
        color: "#5bbad5",
      },
    ],
    scripts: [],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFoundPage,
});

function GoogleAnalytics() {
  const router = useRouter();

  React.useEffect(() => {
    if (!import.meta.env.PROD) return;
    if ((window as any).__gaInitialized) return;
    (window as any).__gaInitialized = true;

    (window as any).dataLayer = (window as any).dataLayer || [];
    function gtag(...args: unknown[]) {
      (window as any).dataLayer.push(args);
    }
    (window as any).gtag = gtag;

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(script);

    gtag("js", new Date());
    gtag("config", GA_MEASUREMENT_ID);

    const sendPageView = (location: {
      href: string;
      pathname: string;
      search: string;
      hash: string;
    }) => {
      const pageLocation = new URL(location.href, window.location.origin).href;
      gtag("config", GA_MEASUREMENT_ID, {
        page_location: pageLocation,
        page_path: `${location.pathname}${location.search}${location.hash}`,
        page_title: document.title,
      });
    };

    const unsubscribe = router.history.subscribe(({ location }) => {
      sendPageView(location);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return null;
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="flex min-h-screen flex-col">
        <GoogleAnalytics />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <Scripts />
      </body>
    </html>
  );
}

function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="text-center">
        <p className="text-6xl font-semibold tracking-tight text-slate-900">
          404
        </p>
        <p className="mt-3 text-xl text-slate-600">Not found</p>
        <a
          className="mt-4 inline-block text-sm font-medium text-[#3451b2] transition-colors hover:text-[#3a5ccc]"
          href="/"
        >
          &lt;- Back to homepage
        </a>
      </div>
    </div>
  );
}
