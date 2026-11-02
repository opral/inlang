/** Shown on the page and as FAQPage JSON-LD, so answer engines quote the same text. */
export const faqs = [
  {
    q: "Which AI agents work with inlang?",
    a: "Any coding agent that can edit files and run a command, like Claude Code, Codex or Cursor. The agent edits the translation files and runs npx @inlang/cli check --format json. No inlang account or API key.",
  },
  {
    q: "How good are agent translations?",
    a: "Agents translate with your code and a glossary file in your repo as context. Generic machine translation has no such context. inlang check catches missing and empty translations, missing variables, missing plural forms and unused messages. People review the wording in the pull request.",
  },
  {
    q: "How do I move from Crowdin or Lokalise?",
    a: "Export your translation files into your repo in a format a plugin reads, for example i18next JSON. inlang reads them directly. Copy your glossary into a file in your repo so the agent can read it.",
  },
  {
    q: "Does inlang have translation memory and glossaries?",
    a: "Your translations are the memory. Agents reuse the translations in your repo and follow a glossary file you keep there. There is no separate database to sync. inlang Cloud may add hosted versions if there is demand.",
  },
  {
    q: "Do translators need Git or a GitHub account?",
    a: "No Git. To save changes in Fink, translators need a free GitHub account. Without write access, they push to a fork and open a pull request.",
  },
  {
    q: "How is inlang different from Crowdin or Lokalise?",
    a: "Crowdin and Lokalise keep translations in their database and sync them to your repo. inlang keeps them in your repo. Use Crowdin or Lokalise if you manage agencies or freelancers in one tool.",
  },
  {
    q: "Do I have to change my files or i18n library?",
    a: "No. Plugins read your existing files. Paraglide JS is inlang's own i18n library for new projects.",
  },
  {
    q: "Is inlang free?",
    a: "Yes. inlang, the CLI, Paraglide JS and the plugins are open source. You need no inlang account. You host nothing.",
  },
];

export function Faq() {
  return (
    <section className="mx-auto max-w-[760px] px-4 pt-24 sm:px-6 md:pt-[120px]">
      <h2 className="text-[32px] font-bold tracking-[-0.03em]">FAQ</h2>
      <dl className="mt-6 flex flex-col gap-6">
        {faqs.map((faq) => (
          <div key={faq.q}>
            <dt className="text-[17px] font-semibold">{faq.q}</dt>
            <dd className="mt-1.5 text-[15.5px] leading-[1.7] text-ink-muted">
              {faq.a}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
