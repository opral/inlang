import npmDownloads from "../../npm-downloads.json";

const logos = [
  {
    src: "/images/used-by/starbucks.svg",
    alt: "Starbucks",
    height: 28,
    maxWidth: 180,
  },
  { src: "/images/used-by/kraft-heinz.png", alt: "Kraft Heinz", height: 20 },
  { src: "/images/used-by/bose.svg", alt: "Bose", height: 16 },
  { src: "/images/used-by/disney.svg", alt: "Disney", height: 24 },
  { src: "/images/used-by/eth-zurich.svg", alt: "ETH Zurich", height: 16 },
  { src: "/images/used-by/brave.svg", alt: "Brave", height: 22 },
  { src: "/images/used-by/michelin.svg", alt: "Michelin", height: 22 },
  { src: "/images/used-by/idealista.svg", alt: "idealista", height: 18 },
];

/** Downloads of the last 52 full weeks, for example "17.8M". */
function yearlyDownloads(): string {
  const total = npmDownloads.weeks
    .slice(-52)
    .reduce((sum, week) => sum + week.downloads, 0);
  return `${(total / 1_000_000).toFixed(1)}M`;
}

/** Customer logos and the yearly npm download count. */
export function Proof() {
  return (
    <section className="mx-auto max-w-[1120px] px-4 pt-12 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-5 border-y border-line py-6">
        <ul className="flex flex-wrap items-center gap-x-7 gap-y-4">
          {logos.map((logo) => (
            <li key={logo.alt}>
              <img
                src={logo.src}
                alt={logo.alt}
                style={{ height: logo.height, maxWidth: logo.maxWidth ?? 120 }}
                className="object-contain"
              />
            </li>
          ))}
          <li className="flex items-center gap-[7px] text-[19px] font-bold tracking-[-0.02em]">
            <img
              src="/images/used-by/lovable.svg"
              alt=""
              className="h-5 w-auto"
            />
            Lovable
          </li>
        </ul>
        <p className="text-[14px] text-ink-muted">
          <span className="font-bold text-ink">{yearlyDownloads()}</span> npm
          downloads of @inlang/sdk in 12 months
        </p>
      </div>
    </section>
  );
}
