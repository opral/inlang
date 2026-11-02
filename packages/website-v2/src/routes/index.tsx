import { createFileRoute } from "@tanstack/react-router";
import { getGithubStars } from "../github-stars-cache";
import { AgentFlow } from "../components/home/AgentFlow";
import { DownloadsChart } from "../components/home/DownloadsChart";
import { Faq, faqs } from "../components/home/Faq";
import { FinalCta } from "../components/home/FinalCta";
import { Hero } from "../components/home/Hero";
import { EcosystemSection, PluginsSection } from "../components/home/Plugins";
import { Proof } from "../components/home/Proof";
import { TmsSection } from "../components/home/TmsSection";
import { TranslatorsSection } from "../components/home/TranslatorsSection";
import { WhenToUse } from "../components/home/WhenToUse";

const ogImage =
  "https://cdn.jsdelivr.net/gh/opral/inlang@latest/packages/website/public/opengraph/inlang-social-image.jpg";

const pageTitle = "inlang – the Git-based translation management system";

const siteDescription =
  "inlang is an open-source, Git-based translation management system. Translations are files in your repo. AI coding agents translate them, run inlang check and open pull requests. Nothing to host.";

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "inlang",
    url: "https://inlang.com",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Cross-platform",
    description: siteDescription,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    sameAs: [
      "https://github.com/opral/inlang",
      "https://www.npmjs.com/package/@inlang/sdk",
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: pageTitle },
      { name: "description", content: siteDescription },
      { name: "og:title", content: pageTitle },
      { name: "og:description", content: siteDescription },
      { name: "og:image", content: ogImage },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: ogImage },
      { name: "twitter:image:alt", content: "inlang" },
      { name: "twitter:title", content: pageTitle },
      { name: "twitter:description", content: siteDescription },
      { name: "twitter:site", content: "@inlanghq" },
      { name: "twitter:creator", content: "@inlanghq" },
    ],
    links: [{ rel: "alternate", type: "text/plain", href: "/llms.txt" }],
    scripts: jsonLd.map((entry) => ({
      type: "application/ld+json",
      children: JSON.stringify(entry),
    })),
  }),
  component: LandingPage,
});

const formatStars = (count: number) => {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return count.toString();
};

function LandingPage() {
  const githubStars = getGithubStars("opral/inlang");
  const stars = githubStars ? formatStars(githubStars) : "2k+";

  return (
    <div className="bg-paper text-ink">
      <Hero stars={stars} />
      <Proof />
      <TmsSection />
      <AgentFlow />
      <TranslatorsSection />
      <PluginsSection />
      <EcosystemSection />
      <DownloadsChart />
      <WhenToUse />
      <Faq />
      <FinalCta />
    </div>
  );
}
