import { Section, SectionHeading } from "./Section";

const useInlang = [
  "Your app's text lives in your repo: i18next, next-intl, Paraglide JS, JSON, iOS or Android files.",
  "Developers and AI agents do most of the translation work.",
  "You want translation changes reviewed in pull requests and checked in CI.",
];

const useHostedTms = [
  "You manage agencies or freelancers in one tool.",
  "Your translators cannot use a GitHub account.",
  "Your text lives in a CMS, not in code.",
];

/** Says plainly when inlang fits and when a hosted TMS is the better choice. */
export function WhenToUse() {
  return (
    <Section>
      <SectionHeading>When to use inlang</SectionHeading>
      <div className="mt-5 flex flex-wrap gap-4">
        <Column
          title="Use inlang if"
          items={useInlang}
          mark="✓"
          markClass="text-cyan-700"
          className="border-panel-line bg-panel-soft"
        />
        <Column
          title="Use Crowdin or Lokalise if"
          items={useHostedTms}
          mark="→"
          markClass="text-amber-700"
          className="border-line bg-white"
        />
      </div>
    </Section>
  );
}

function Column({
  title,
  items,
  mark,
  markClass,
  className,
}: {
  title: string;
  items: string[];
  mark: string;
  markClass: string;
  className: string;
}) {
  return (
    <div
      className={`flex min-w-0 flex-[1_1_420px] flex-col gap-4 rounded-[20px] border px-[30px] py-7 ${className}`}
    >
      <h3 className="text-[20px] font-bold tracking-[-0.015em]">{title}</h3>
      <ul className="flex flex-col gap-3 text-[15.5px] leading-[1.55] text-ink-secondary">
        {items.map((item) => (
          <li key={item} className="flex items-baseline gap-2.5">
            <span aria-hidden="true" className={`font-bold ${markClass}`}>
              {mark}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
