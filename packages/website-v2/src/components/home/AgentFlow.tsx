import type { ReactNode } from "react";
import { ClaudeAppIcon, CodexAppIcon } from "./icons";
import { MonoLabel, Section, SectionHeading, SectionLead } from "./Section";

/** Shows how an agent adds a language: ask, translate, check, review. */
export function AgentFlow() {
  return (
    <Section>
      <SectionHeading>
        AI agents handle your translations, with guardrails
      </SectionHeading>
      <SectionLead>
        inlang check finds errors and the agents fix them. CI runs the same
        check on every pull request. You review and merge.
      </SectionLead>

      <div className="mt-5 grid gap-2 rounded-[22px] bg-panel p-5 sm:p-7 md:grid-cols-2 lg:flex lg:items-stretch">
        <FlowCard
          step={1}
          label="you ask"
          caption="You ask your coding agent in plain words."
        >
          <div className="flex flex-col gap-3 rounded-xl bg-ink px-3.5 py-3 text-paper">
            <div className="flex gap-1.5">
              <ClaudeAppIcon size={26} />
              <CodexAppIcon size={26} />
            </div>
            <div className="font-mono text-[15px]">
              <span className="text-[#9fd3dc]">›</span> Add German.
            </div>
          </div>
        </FlowCard>
        <FlowArrow />
        <FlowCard
          step={2}
          label="agent translates"
          caption="The agent writes the translations into your repo."
        >
          <div className="overflow-hidden rounded-[10px] border border-line bg-white font-mono text-[12px] leading-[1.75]">
            <div className="border-b border-line-soft px-2.5 py-1.5 text-ink-faint">
              messages/de.json
            </div>
            <div className="py-1.5">
              {[
                '+ "greeting": "Hallo!"',
                '+ "home": "Startseite"',
                '+ "total": "Summe"',
              ].map((line) => (
                <div
                  key={line}
                  className="bg-[#dcfce7] px-2.5 whitespace-nowrap text-[#166534]"
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
        </FlowCard>
        <FlowArrow />
        <FlowCard
          step={3}
          label="inlang check"
          caption="The check finds a missing {name}. The agent adds {name}."
        >
          <div className="flex flex-col items-start gap-2.5">
            <Pill className="bg-[#fee2e2] text-[#b91c1c]">
              ✕ missing {"{name}"}
            </Pill>
            <div className="flex items-center gap-2 pl-1">
              <span className="font-mono text-[14px] text-ink-faint">↓</span>
              <ClaudeAppIcon size={22} />
            </div>
            <Pill className="bg-[#dcfce7] text-[#166534]">✓ passes</Pill>
          </div>
        </FlowCard>
        <FlowArrow />
        <FlowCard
          step={4}
          label="you review"
          caption="CI runs inlang check on the pull request. You review and merge."
        >
          <div className="overflow-hidden rounded-[10px] border border-line bg-white text-[12.5px]">
            <div className="flex items-center gap-1.5 px-2.5 py-2">
              <span className="text-[#16a34a]" aria-hidden="true">
                ⬤
              </span>
              <b>Add German</b>
              <span className="font-mono text-[11px] text-ink-faint">#142</span>
            </div>
            <div className="flex items-center gap-1.5 border-t border-line-soft px-2.5 py-[7px]">
              <span className="text-[#166534]" aria-hidden="true">
                ✓
              </span>
              <code className="text-[12px]">inlang check</code>
              <span className="ml-auto font-mono text-[11px] text-ink-faint">
                passed
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-line-soft px-2.5 py-[7px]">
              <span className="font-mono text-[12px]">
                <span className="text-[#16a34a]">+412</span>{" "}
                <span className="text-[#b91c1c]">−3</span>
              </span>
              <span className="rounded-md bg-ink px-2.5 py-[3px] text-[12px] font-semibold text-paper">
                Merge
              </span>
            </div>
          </div>
        </FlowCard>
      </div>
    </Section>
  );
}

function FlowCard({
  step,
  label,
  caption,
  children,
}: {
  step: number;
  label: string;
  caption: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3.5 rounded-[14px] bg-white p-[18px] shadow-[0_1px_2px_rgba(21,23,27,0.06)]">
      <MonoLabel className="text-[#3d6670]">
        {step} · {label}
      </MonoLabel>
      <div className="flex-1">{children}</div>
      <p className="text-[13.5px] leading-[1.55] text-ink-muted">{caption}</p>
    </div>
  );
}

function FlowArrow() {
  return (
    <span
      aria-hidden="true"
      className="hidden w-[18px] shrink-0 self-center text-center text-[16px] text-[#7fa9b1] lg:block"
    >
      →
    </span>
  );
}

function Pill({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[12px] font-medium whitespace-nowrap ${className}`}
    >
      {children}
    </span>
  );
}
