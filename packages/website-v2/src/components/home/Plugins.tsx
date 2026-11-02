import type { ReactNode } from "react";
import {
  AndroidIcon,
  AppleIcon,
  BirdIcon,
  I18nextIcon,
  JsonIcon,
} from "./icons";
import { MonoLabel, Section, SectionHeading, SectionLead } from "./Section";

const formats: Array<{ label: string; icon?: ReactNode }> = [
  { label: "i18next", icon: <I18nextIcon /> },
  { label: "next-intl" },
  { label: "ICU MessageFormat" },
  { label: "Apple .strings, .xcstrings", icon: <AppleIcon /> },
  { label: "Android XML", icon: <AndroidIcon /> },
  { label: "JSON", icon: <JsonIcon /> },
];

type Tool = {
  tag: string;
  name: string;
  body: string;
  /** Omitted when the tool has no page to link to. */
  href?: string;
  icon: ReactNode;
};

const tools: Tool[] = [
  {
    tag: "Web app",
    name: "Fink",
    body: "A web editor for translators. It saves changes to your repo.",
    href: "https://fink.inlang.com",
    icon: <ToolImage src="/images/home/fink.png" />,
  },
  {
    tag: "VS Code extension",
    name: "Sherlock",
    body: "See and edit translations next to your code.",
    href: "/m/r7kp499g",
    icon: <ToolImage src="/images/home/sherlock.png" />,
  },
  {
    tag: "Figma plugin",
    name: "Parrot",
    body: "Translate Figma designs with your project's messages.",
    icon: (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-teal-600">
        <BirdIcon size={22} color="#ffffff" />
      </span>
    ),
  },
  {
    tag: "i18n library",
    name: "Paraglide JS",
    body: "Compiles messages into typed functions. Ships only the messages a page uses.",
    href: "https://paraglidejs.com",
    icon: <ToolImage src="/images/home/paraglide.png" />,
  },
  {
    tag: "Command line",
    name: "inlang CLI",
    body: "Runs checks in CI and adds machine translations.",
    href: "/m/2qj2w8pu",
    icon: <ToolImage src="/images/home/cli.png" />,
  },
  {
    tag: "Build your own",
    name: "SDK",
    body: "Read and write inlang projects from your own code.",
    href: "/docs/getting-started",
    icon: (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-panel font-mono text-[15px] font-semibold text-cyan-700">
        {"{ }"}
      </span>
    ),
  },
];

function ToolImage({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt=""
      width={44}
      height={44}
      className="h-11 w-11 shrink-0 rounded-[10px] object-contain"
    />
  );
}

/** File format plugins, shown as pills. */
export function PluginsSection() {
  return (
    <Section id="plugins">
      <SectionHeading>Plugins for any translation format</SectionHeading>
      <SectionLead>
        Plugins import and export your translation files. Pick the plugin for
        your format, or write your own for a format that is missing.
      </SectionLead>
      <ul className="mt-6 flex flex-wrap gap-2.5">
        {formats.map((format) => (
          <li
            key={format.label}
            className="flex items-center gap-2 rounded-full border border-line bg-white px-3.5 py-2 text-[14px] font-medium"
          >
            {format.icon}
            {format.label}
          </li>
        ))}
        <li>
          <a
            href="/c/plugins"
            className="flex items-center rounded-full border border-dashed border-[#7fa9b1] px-3.5 py-2 text-[14px] font-medium text-[#3d6670] hover:bg-panel-soft"
          >
            + your format
          </a>
        </li>
      </ul>
    </Section>
  );
}

/** The inlang tools, grouped by what each one is for. */
export function EcosystemSection() {
  return (
    <Section id="ecosystem">
      <SectionHeading>A tool for every localization need</SectionHeading>
      <SectionLead>
        The inlang ecosystem has tools for translators, developers, designers
        and CI. They all work on the same project.inlang folder in your repo.
      </SectionLead>
      <ul className="mt-6 grid gap-4 md:grid-cols-2">
        {tools.map((tool) => (
          <li key={tool.name}>
            <ToolCard tool={tool} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function ToolCard({ tool }: { tool: Tool }) {
  const className =
    "flex h-full items-start gap-4 rounded-2xl border border-line bg-white p-6 transition-colors";
  const content = (
    <>
      {tool.icon}
      <span className="flex min-w-0 flex-col gap-1.5">
        <MonoLabel className="text-ink-faint">{tool.tag}</MonoLabel>
        <span className="text-[18px] font-semibold tracking-[-0.015em]">
          {tool.name}
        </span>
        <span className="text-[14.5px] leading-[1.6] text-ink-muted">
          {tool.body}
        </span>
      </span>
    </>
  );
  return tool.href ? (
    <a href={tool.href} className={`${className} hover:border-ink-faint`}>
      {content}
    </a>
  ) : (
    <div className={className}>{content}</div>
  );
}
