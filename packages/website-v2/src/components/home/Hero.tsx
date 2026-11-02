import type { ReactNode } from "react";
import {
  CheckCircleIcon,
  ClaudeAppIcon,
  CodexAppIcon,
  PullRequestIcon,
  TranslateIcon,
  WrenchIcon,
} from "./icons";
import { MonoLabel } from "./Section";

const agentSteps = [
  { icon: <TranslateIcon color="#9fd3dc" />, label: "translate" },
  { icon: <CheckCircleIcon color="#9fd3dc" />, label: "check" },
  { icon: <WrenchIcon color="#9fd3dc" />, label: "fix" },
  { icon: <PullRequestIcon color="#9fd3dc" />, label: "open a pull request" },
];

const leftTools = [
  { role: "Translators", name: "Fink, web editor" },
  { role: "Developers", name: "Sherlock, VS Code" },
  { role: "Designers", name: "Parrot, Figma" },
];

const rightTools = [
  { role: "Your app", name: "Paraglide JS" },
  { role: "CI", name: "inlang CLI" },
  { role: "Custom tools", name: "+ Build your own", dashed: true },
];

const badges = [
  "Open source",
  "Nothing to host",
  "Agents need no account or API key",
];

export function Hero({ stars }: { stars: string }) {
  return (
    <section className="mx-auto max-w-[1120px] px-4 pt-16 sm:px-6 md:pt-20">
      <h1 className="max-w-[760px] text-[40px] leading-[1.04] font-bold tracking-[-0.04em] text-balance sm:text-[56px] md:text-[60px]">
        The Git-based translation management system
      </h1>
      <p className="mt-5 max-w-[640px] text-[18px] leading-[1.6] text-ink-muted">
        Translations are files in your repo. Your coding agent translates them
        with your code as context. It runs inlang check, fixes failures and
        opens a pull request. Translators edit in Fink, a web editor. Open
        source. Nothing to host.
      </p>
      <div className="mt-7 flex flex-wrap items-center gap-4">
        <a
          href="/m/2qj2w8pu/app-inlang-cli"
          className="rounded-[10px] bg-ink px-6 py-3 text-[15px] font-semibold text-paper transition-opacity hover:opacity-85"
        >
          Get started
        </a>
        <a
          href="https://github.com/opral/inlang"
          className="rounded-[10px] border border-[#d9d5cc] bg-white px-5 py-[11px] text-[15px] font-semibold transition-colors hover:border-ink-faint"
        >
          ★ Star on GitHub{" "}
          <span className="font-medium text-ink-faint">{stars}</span>
        </a>
      </div>
      <HeroDiagram />
    </section>
  );
}

function HeroDiagram() {
  return (
    <div className="mt-9 rounded-[22px] bg-panel px-5 pt-10 pb-8 sm:px-10 md:px-12 md:pt-14 md:pb-10">
      <div className="mx-auto max-w-[920px]">
        <AgentCard />
        <div className="mx-auto h-9 w-0 border-l-2 border-ink" />
        <div className="flex flex-col gap-4 md:flex-row md:items-stretch md:gap-0">
          <div className="flex flex-col gap-4 md:flex-1 md:justify-between md:gap-[18px]">
            {leftTools.map((tool) => (
              <div key={tool.name} className="flex items-center">
                <ToolChip {...tool} />
                <Wire />
              </div>
            ))}
          </div>
          <RepoBox />
          <div className="flex flex-col gap-4 md:flex-1 md:justify-between md:gap-[18px]">
            {rightTools.map((tool) => (
              <div key={tool.name} className="flex items-center">
                <Wire dashed={tool.dashed} />
                <ToolChip {...tool} />
              </div>
            ))}
          </div>
        </div>
        <ul className="mt-7 flex flex-wrap justify-center gap-x-7 gap-y-2">
          {badges.map((badge) => (
            <li
              key={badge}
              className="flex items-center gap-2 text-[14px] text-ink-secondary"
            >
              <span
                aria-hidden="true"
                className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-ink text-[10px] text-paper"
              >
                ✓
              </span>
              {badge}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AgentCard() {
  return (
    <div className="mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-x-[18px] gap-y-3 rounded-2xl bg-ink px-4 py-3.5 text-paper sm:flex-nowrap sm:pr-[22px]">
      <div className="flex gap-1.5">
        <ClaudeAppIcon size={32} />
        <CodexAppIcon size={32} />
      </div>
      <div
        aria-hidden="true"
        className="hidden w-px self-stretch bg-[#3a3f46] sm:block"
      />
      <ul className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1">
        {agentSteps.map((step, index) => (
          <li key={step.label} className="flex items-center gap-3.5">
            {index > 0 && (
              <span
                aria-hidden="true"
                className="hidden text-[#5f6b70] sm:inline"
              >
                ·
              </span>
            )}
            <span className="flex items-center gap-[7px] text-[16.5px] font-semibold tracking-[-0.01em] whitespace-nowrap">
              {step.icon}
              {step.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ToolChip({
  role,
  name,
  dashed,
}: {
  role: string;
  name: ReactNode;
  dashed?: boolean;
}) {
  return (
    <div
      className={`min-w-0 flex-1 rounded-xl px-4 py-3 ${
        dashed
          ? "border-[1.5px] border-dashed border-[#7fa9b1]"
          : "bg-white shadow-[0_1px_2px_rgba(21,23,27,0.06)]"
      }`}
    >
      <MonoLabel className="block text-[#3d6670]">{role}</MonoLabel>
      <span className="text-[15px] font-semibold">{name}</span>
    </div>
  );
}

function Wire({ dashed }: { dashed?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`hidden h-0 w-14 shrink-0 border-t-[1.5px] border-[#7fa9b1] md:block ${
        dashed ? "border-dashed" : ""
      }`}
    />
  );
}

function RepoBox() {
  return (
    <div className="order-first flex min-w-[220px] flex-col items-center gap-3 rounded-2xl border-[1.5px] border-ink bg-white px-7 py-6 md:order-none md:justify-center">
      <span className="font-mono text-[12px] font-semibold text-cyan-700">
        your Git repo
      </span>
      <div
        aria-hidden="true"
        className="h-20 w-16 rounded-md border-[1.5px] border-ink bg-panel"
        style={{
          clipPath:
            "polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%)",
        }}
      />
      <span className="font-mono text-[15px] font-semibold">
        project.inlang
      </span>
      <span className="text-[12.5px] text-ink-faint">open file format</span>
    </div>
  );
}
