import type { ReactNode } from "react";
import { ClaudeAppIcon, CodexAppIcon } from "./icons";
import { Section, SectionHeading } from "./Section";

type Person = { initial: string; label: string; color: string };

const hostedTeam: Person[] = [
  { initial: "D", label: "Developer", color: "bg-sky-200" },
  { initial: "T", label: "Translator", color: "bg-amber-200" },
  { initial: "R", label: "Reviewer", color: "bg-pink-200" },
];

export function TmsSection() {
  return (
    <Section>
      <SectionHeading>What is a translation management system?</SectionHeading>
      <p className="mt-4 max-w-[680px] text-[19px] leading-[1.6]">
        A translation management system (TMS) stores an app&apos;s translations
        and manages how they are edited and reviewed.
      </p>
      <p className="mt-4 max-w-[680px] text-[17px] leading-[1.7] text-ink-faint">
        Most TMSs are hosted web apps. inlang keeps translations as files in
        your repo, where AI agents can read, edit and check them.
      </p>

      <div className="mt-6 overflow-hidden rounded-[20px] border border-line bg-white">
        <div className="hidden text-[14px] font-semibold md:grid md:grid-cols-[190px_1fr_1fr]">
          <div />
          <div className="px-6 py-5 text-ink-faint">Hosted TMS</div>
          <div className="bg-panel-soft px-6 py-5 text-cyan-700">inlang</div>
        </div>

        <Row
          label="Who does the work"
          hosted={
            <>
              <div className="mb-3.5 grid max-w-[300px] grid-cols-3 gap-2">
                {hostedTeam.map((person) => (
                  <div key={person.label} className="flex flex-col gap-2">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-[12px] font-bold ${person.color}`}
                    >
                      {person.initial}
                    </span>
                    <Tag>{person.label}</Tag>
                  </div>
                ))}
              </div>
              People work in the vendor&apos;s app. Agents use the vendor&apos;s
              API.
            </>
          }
          inlang={
            <>
              <div className="mb-3.5 grid max-w-[300px] grid-cols-3 gap-2">
                <div className="flex flex-col gap-2">
                  <ClaudeAppIcon size={36} />
                  <Tag>Claude Code</Tag>
                </div>
                <div className="flex flex-col gap-2">
                  <CodexAppIcon size={36} />
                  <Tag>Codex</Tag>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-pink-200 text-[12px] font-bold">
                    R
                  </span>
                  <Tag>You review</Tag>
                </div>
              </div>
              AI agents do the work. You review it.
            </>
          }
        />
        <Row
          label="Where translations live"
          hosted={
            <>
              <Big>In a vendor&apos;s database</Big>
              The vendor keeps the main copy and syncs it to your repo.
            </>
          }
          inlang={
            <>
              <Big>In your Git repo</Big>
              Plain files. Nothing to host.
            </>
          }
        />
        <Row
          label="How mistakes are caught"
          hosted={
            <>
              <Big>Reviewers proofread</Big>
              In the vendor app.
            </>
          }
          inlang={
            <>
              <Big>
                <code className="text-[15px]">inlang check</code> finds errors
              </Big>
              AI agents fix the errors.
            </>
          }
        />
        <Row
          label="How changes are reviewed"
          hosted={
            <>
              <Big>In a separate vendor app</Big>
              Separate from code review.
            </>
          }
          inlang={
            <>
              <Big>In a pull request</Big>
              Your existing Git workflow.
            </>
          }
        />
      </div>
    </Section>
  );
}

function Row({
  label,
  hosted,
  inlang,
}: {
  label: string;
  hosted: ReactNode;
  inlang: ReactNode;
}) {
  return (
    <div className="grid border-t border-line-soft md:grid-cols-[190px_1fr_1fr] md:border-t-0">
      <div className="px-6 pt-5 font-mono text-[11px] font-medium tracking-[0.08em] text-ink-faint uppercase md:border-t md:border-line-soft md:pt-[26px]">
        {label}
      </div>
      <div className="px-6 py-4 text-[14.5px] leading-[1.55] text-ink-faint md:border-t md:border-line-soft md:py-[22px]">
        <span className="mb-2 block text-[12px] font-semibold md:hidden">
          Hosted TMS
        </span>
        {hosted}
      </div>
      <div className="bg-panel-soft px-6 py-4 text-[14.5px] leading-[1.55] text-ink md:border-t md:border-panel-line md:py-[22px]">
        <span className="mb-2 block text-[12px] font-semibold text-cyan-700 md:hidden">
          inlang
        </span>
        {inlang}
      </div>
    </div>
  );
}

function Big({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1 text-base font-semibold text-ink">{children}</div>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[11px] font-medium text-ink-faint">
      {children}
    </span>
  );
}
