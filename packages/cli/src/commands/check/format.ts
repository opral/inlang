import type { Match } from "@inlang/sdk";
import {
  CHECKS,
  type CheckReport,
  type ReportCheck,
  type ReportDiagnostic,
} from "./runCheck.js";

/** Incomplete-analysis locations shown in text output; JSON lists all. */
const MAX_ISSUES = 20;

type Style = (text: string) => string;
export function styles(color: boolean) {
  const ansi =
    (open: number, close: number): Style =>
    (text) =>
      color ? `\u001b[${open}m${text}\u001b[${close}m` : text;
  return {
    bold: ansi(1, 22),
    dim: ansi(2, 22),
    red: ansi(31, 39),
    green: ansi(32, 39),
    yellow: ansi(33, 39),
    cyan: ansi(36, 39),
  };
}

export function formatJson(report: CheckReport): string {
  return JSON.stringify(report, undefined, 2) + "\n";
}

/** Human-readable report: project errors, findings grouped by check, analysis notes, summary. */
export function formatText(
  report: CheckReport,
  options: { color: boolean },
): string {
  const s = styles(options.color);
  const lines: string[] = [];
  const header = [
    report.project,
    `${report.messages} ${report.messages === 1 ? "message" : "messages"}`,
    `${report.locales.length === 1 ? "locale" : "locales"} ${report.locales.join(", ")}`,
    ...(report.source
      ? [
          `${report.source.files} source ${report.source.files === 1 ? "file" : "files"} in ${report.source.roots.join(", ")}`,
        ]
      : []),
  ];
  lines.push(s.dim(`Checked ${header.join(" · ")}`), "");

  if (report.errors.length) {
    lines.push(s.bold(s.red(`Project errors (${report.errors.length})`)));
    for (const error of report.errors)
      lines.push(indent(`${error.name}: ${error.message}`.trim(), "  "));
    lines.push("");
  }

  for (const { id } of CHECKS) {
    const diagnostics = report.diagnostics.filter((d) => d.checkId === id);
    if (!diagnostics.length) continue;
    lines.push(`${s.bold(s.yellow(id))} ${s.dim(`(${diagnostics.length})`)}`);
    const width = Math.min(
      40,
      Math.max(...diagnostics.map((d) => d.bundleId.length)),
    );
    const localeWidth = Math.max(
      0,
      ...diagnostics.map((d) => d.locale?.length ?? 0),
    );
    for (const diagnostic of diagnostics) {
      const detail = describe(diagnostic, report.baseLocale);
      lines.push(
        [
          "  " + diagnostic.bundleId.padEnd(width),
          ...(localeWidth
            ? [s.cyan((diagnostic.locale ?? "").padEnd(localeWidth))]
            : []),
          ...(detail ? [s.dim(detail)] : []),
        ]
          .join("  ")
          .trimEnd(),
      );
    }
    lines.push("");
  }

  for (const check of report.checks) {
    if (check.status === "complete") continue;
    lines.push(...describeStatus(check, s), "");
  }

  if (report.summary.findings === 0 && report.errors.length === 0) {
    lines.push(s.green("✔ No findings."));
  } else {
    const rows: [string, number][] = [
      ...(report.errors.length
        ? [["project errors", report.errors.length] as [string, number]]
        : []),
      ...CHECKS.flatMap(({ id }) =>
        report.summary.byCheck[id]
          ? [[id, report.summary.byCheck[id]!] as [string, number]]
          : [],
      ),
    ];
    const width = Math.max(...rows.map(([name]) => name.length));
    const countWidth = Math.max(
      ...rows.map(([, count]) => String(count).length),
    );
    const total = report.summary.findings + report.errors.length;
    lines.push(s.bold(`${total} ${total === 1 ? "finding" : "findings"}`));
    for (const [name, count] of rows)
      lines.push(
        `  ${name.padEnd(width)}  ${String(count).padStart(countWidth)}`,
      );
  }
  return lines.join("\n") + "\n";
}

function describeStatus(
  check: ReportCheck,
  s: ReturnType<typeof styles>,
): string[] {
  const lines: string[] = [];
  const unused = check.id === "unused-message";
  if (check.status === "unavailable")
    lines.push(
      `${s.bold(check.id)} ${s.dim("not checked:")} ${check.reason ?? ""}`.trimEnd(),
    );
  else if (unused && check.issues?.length)
    lines.push(
      `${s.bold(check.id)} ${s.dim("incomplete:")} unused messages can't be determined because:`,
    );
  else
    lines.push(
      `${s.bold(check.id)} ${s.dim("incomplete:")} ${check.reason ?? ""}`.trimEnd(),
    );
  const issues = check.issues ?? [];
  const located = issues.filter((issue) => issue.path !== undefined);
  for (const issue of issues.slice(0, MAX_ISSUES)) {
    const where =
      issue.path === undefined
        ? undefined
        : issue.start
          ? `${issue.path}:${issue.start.line}:${issue.start.column + 1}`
          : issue.path;
    lines.push(
      "  " +
        [
          ...(where ? [s.cyan(where)] : []),
          ...(issue.code ? [issue.code] : []),
          s.dim(issue.reason),
        ].join("  "),
    );
  }
  if (issues.length > MAX_ISSUES)
    lines.push(
      s.dim(
        `  …and ${issues.length - MAX_ISSUES} more. Use --format json to list all.`,
      ),
    );
  if (unused && located.length)
    lines.push(
      s.dim(
        "  Unused messages are only reported when every usage can be resolved, e.g. m.some_key().",
      ),
    );
  if (check.hint) lines.push(`  ${check.hint}`);
  return lines;
}

/** What is wrong, without repeating the bundle and locale columns. */
function describe(diagnostic: ReportDiagnostic, baseLocale: string): string {
  const form = diagnostic.matches?.length
    ? ` (${formatMatches(diagnostic.matches)})`
    : "";
  switch (diagnostic.checkId) {
    case "missing-translation":
      return "no translation";
    case "empty-translation":
      return "empty translation";
    case "empty-variant":
      return `empty form${form}`;
    case "missing-variable":
      return `missing {${diagnostic.name}}${form}`;
    case "unknown-variable":
      return `uses {${diagnostic.name}}, which ${baseLocale} doesn't use${diagnostic.suggestion ? `; did you mean {${diagnostic.suggestion}}?` : ""}${form}`;
    case "missing-markup":
      return `missing <${diagnostic.name}> markup${form}`;
    case "missing-variant":
      return `no form for ${formatMatches(diagnostic.matches)}`;
    case "missing-selector":
      return `doesn't choose by {${diagnostic.name}}${diagnostic.values.length ? ` (${diagnostic.values.join(", ")})` : ""} like ${baseLocale} does`;
    case "unused-message":
      return "";
  }
}

function formatMatches(matches: readonly Match[]): string {
  return matches
    .map(
      (match) =>
        `${match.key}=${match.type === "literal-match" ? match.value : "*"}`,
    )
    .join(", ");
}

function indent(text: string, prefix: string): string {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => prefix + line)
    .join("\n");
}
