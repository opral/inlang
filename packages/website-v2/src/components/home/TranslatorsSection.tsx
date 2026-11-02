import { Section, SectionHeading, SectionLead } from "./Section";

/** Fink, the web editor for translators, shown with a real screenshot. */
export function TranslatorsSection() {
  return (
    <Section>
      <SectionHeading>Translators edit in the browser</SectionHeading>
      <SectionLead>
        Fink is a web editor for translators. They need a free GitHub account,
        not Git. They edit all languages side by side. Fink pushes the changes
        to a branch. You review them in a pull request. Only edited messages
        change.
      </SectionLead>
      <a
        href="https://fink.inlang.com"
        className="mt-5 flex justify-center overflow-hidden rounded-[22px] bg-[#f1eee7] px-5 pt-10 sm:px-12 sm:pt-12"
      >
        <img
          src="/images/home/fink-editor.webp"
          width={700}
          height={578}
          alt="Fink showing the plural message files_remaining in English and German, with a warning that the German text is missing {count}"
          className="block h-auto w-full max-w-[760px] rounded-t-xl shadow-[0_12px_32px_rgba(21,23,27,0.1)]"
          loading="lazy"
        />
      </a>
    </Section>
  );
}
