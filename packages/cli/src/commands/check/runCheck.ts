import nodePath from "node:path";
import {
  checkProject,
  type CheckDiagnostic,
  type CheckId,
  type CheckStatus,
  type InlangProject,
  type Match,
  type SourceFile,
  type UsageIssue,
} from "@inlang/sdk";
import { collectSourceFiles, displayPath } from "./sourceFiles.js";

/** Every check, in the order the report lists them. */
export const CHECKS: readonly {
  id: CheckId;
  flag: string;
  description: string;
}[] = [
  {
    id: "missing-translation",
    flag: "--missing-translations",
    description: "messages without a translation for a locale",
  },
  {
    id: "empty-translation",
    flag: "--empty-translations",
    description: "translations whose every form is empty",
  },
  {
    id: "empty-variant",
    flag: "--empty-variants",
    description: "empty forms in an otherwise non-empty translation",
  },
  {
    id: "missing-variable",
    flag: "--missing-variables",
    description: "variables of the base locale a translation lacks",
  },
  {
    id: "unknown-variable",
    flag: "--unknown-variables",
    description: "variables the base locale doesn't use, e.g. typos",
  },
  {
    id: "missing-markup",
    flag: "--missing-markup",
    description: "markup of the base locale a translation lacks",
  },
  {
    id: "missing-variant",
    flag: "--missing-variants",
    description: "plural or select forms a locale needs but lacks",
  },
  {
    id: "missing-selector",
    flag: "--missing-selectors",
    description:
      "translations that can't choose by an input the base locale chooses by",
  },
  {
    id: "unused-message",
    flag: "--unused-messages",
    description:
      "messages the source code doesn't use (needs a usage-analysis plugin)",
  },
];

const M_FUNCTION_MATCHER = "plugin.inlang.mFunctionMatcher";
export const MATCHER_UPDATE_HINT =
  "Unused-message check needs @inlang/plugin-m-function-matcher ≥ 2.3.0, update the module URL in settings.json";

/** Invalid input, such as an unknown locale. Reported without a stack trace. */
export class CheckUsageError extends Error {
  override name = "CheckUsageError";
}

export type ReportIssue = UsageIssue & {
  /** The source code at `start`, e.g. m[`${fieldName}_label`]. */
  code?: string;
};
export type ReportCheck = Omit<CheckStatus, "issues"> & {
  issues?: ReportIssue[];
  /** What to do about an unavailable or incomplete check. */
  hint?: string;
};
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;
export type ReportDiagnostic = DistributiveOmit<
  CheckDiagnostic,
  "severity" | "fixes"
> & {
  /** The form of a variant-level diagnostic, e.g. `[{ key: "countPlural", value: "one" }]`. */
  matches?: Match[];
};
export type CheckReport = {
  project: string;
  /** Locales findings are reported for. */
  locales: string[];
  baseLocale: string;
  messages: number;
  /** The source snapshot analyzed for unused messages. */
  source?: { roots: string[]; files: number };
  /** Settings and plugin errors of the project (what `inlang validate` reported). */
  errors: { name: string; message: string }[];
  checks: ReportCheck[];
  diagnostics: ReportDiagnostic[];
  summary: {
    findings: number;
    byCheck: Partial<Record<CheckId, number>>;
  };
};

export async function runCheck(args: {
  project: InlangProject;
  /** As passed by the user, for display. */
  projectPath: string;
  cwd: string;
  /** Checks to run. Defaults to all. */
  checks?: readonly CheckId[];
  locales?: readonly string[];
  /** Files or directories to analyze for unused messages. Defaults to the project's parent directory. */
  source?: readonly string[];
}): Promise<CheckReport> {
  const { project } = args;
  const settings = await project.settings.get();
  const locales = [...new Set([settings.baseLocale, ...settings.locales])];
  const wantedLocales = args.locales?.length
    ? [...new Set(args.locales)]
    : undefined;
  const unknown = wantedLocales?.filter((locale) => !locales.includes(locale));
  if (unknown?.length)
    throw new CheckUsageError(
      `${unknown.length === 1 ? "Locale" : "Locales"} ${unknown.map((locale) => JSON.stringify(locale)).join(", ")} ${unknown.length === 1 ? "is" : "are"} not in the project's settings. Possible locales are ${locales.join(", ")}.`,
    );
  const checks = args.checks?.length
    ? CHECKS.map((check) => check.id).filter((id) => args.checks!.includes(id))
    : CHECKS.map((check) => check.id);

  const errors = (await project.errors.get()).map((error) => ({
    name: error?.name ?? "Error",
    message: String(error?.message ?? error),
  }));

  // Unused messages need source files and a plugin that analyzes them.
  let files: SourceFile[] | undefined;
  let source: CheckReport["source"];
  let usageCheck: ReportCheck | undefined;
  if (checks.includes("unused-message")) {
    const plugins = await project.plugins.get();
    const legacyMatcher = plugins.some(
      (plugin) => plugin.key === M_FUNCTION_MATCHER && !plugin.analyzeUsage,
    );
    if (!plugins.some((plugin) => plugin.analyzeUsage)) {
      usageCheck = {
        id: "unused-message",
        status: "unavailable",
        reason: legacyMatcher
          ? "The installed @inlang/plugin-m-function-matcher can't analyze usages."
          : errors.length
            ? "Plugins failed to load, see the project errors."
            : "No installed plugin analyzes message usages.",
        ...(legacyMatcher
          ? { hint: matcherHint(settings.modules) }
          : errors.length
            ? {}
            : {
                hint: "Paraglide projects can add @inlang/plugin-m-function-matcher ≥ 2.3.0 to the modules in settings.json.",
              }),
      };
    } else {
      const roots = args.source?.length
        ? [...args.source]
        : [nodePath.dirname(nodePath.resolve(args.cwd, args.projectPath))];
      let snapshot;
      try {
        snapshot = await collectSourceFiles({ roots, cwd: args.cwd });
      } catch (error) {
        throw new CheckUsageError((error as Error).message);
      }
      if (snapshot.status === "too-large")
        usageCheck = {
          id: "unused-message",
          status: "incomplete",
          reason: snapshot.reason,
        };
      else if (snapshot.files.length === 0)
        usageCheck = {
          id: "unused-message",
          status: "unavailable",
          reason: `No source files found in ${snapshot.roots.join(", ")}.`,
          hint: "Pass the directories that use messages with --source.",
        };
      else {
        files = snapshot.files;
        source = { roots: snapshot.roots, files: files.length };
      }
    }
  }

  const sdkChecks = checks.filter(
    (id) => id !== "unused-message" || files !== undefined,
  );
  const result = sdkChecks.length
    ? await checkProject({ project, files, checks: sdkChecks })
    : { diagnostics: [], checks: [] };

  const statuses: ReportCheck[] = checks.map((id) => {
    const status = result.checks.find((check) => check.id === id);
    if (id === "unused-message" && usageCheck && !status) return usageCheck;
    const { issues, ...rest } = status!;
    const reported: ReportCheck = {
      ...rest,
      id,
      ...(issues
        ? {
            issues: issues.map((issue) => ({
              ...issue,
              ...locate(issue, files),
            })),
          }
        : {}),
    };
    // A matcher without `analyzeUsage` next to another analyzer: say which plugin to update.
    if (
      id === "unused-message" &&
      reported.status !== "complete" &&
      reported.issues?.some((issue) =>
        issue.reason.includes(M_FUNCTION_MATCHER),
      )
    )
      reported.hint = matcherHint(settings.modules);
    return reported;
  });

  const variantMatches = await matchesOf(
    project,
    result.diagnostics.flatMap((diagnostic) =>
      "variantId" in diagnostic && !("matches" in diagnostic)
        ? [diagnostic.variantId]
        : [],
    ),
  );
  const diagnostics: ReportDiagnostic[] = result.diagnostics
    .filter(
      (diagnostic) =>
        !wantedLocales ||
        diagnostic.locale === undefined ||
        wantedLocales.includes(diagnostic.locale),
    )
    .map((diagnostic) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { severity, fixes, ...rest } = diagnostic;
      const matches =
        "variantId" in diagnostic && !("matches" in diagnostic)
          ? variantMatches.get(diagnostic.variantId)
          : undefined;
      return (
        matches?.length ? { ...rest, matches } : rest
      ) as ReportDiagnostic;
    });

  // Grouped by check, then by message, so output and JSON are stable.
  const order = (id: CheckId) => checks.indexOf(id);
  diagnostics.sort(
    (a, b) =>
      order(a.checkId) - order(b.checkId) ||
      (a.bundleId < b.bundleId ? -1 : a.bundleId > b.bundleId ? 1 : 0) ||
      locales.indexOf(a.locale ?? "") - locales.indexOf(b.locale ?? ""),
  );
  const byCheck: CheckReport["summary"]["byCheck"] = {};
  for (const diagnostic of diagnostics)
    byCheck[diagnostic.checkId] = (byCheck[diagnostic.checkId] ?? 0) + 1;

  const messages = await project.db
    .selectFrom("inlang_bundle")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .executeTakeFirst();

  return {
    project: displayPath(args.cwd, args.projectPath),
    locales: wantedLocales ?? locales,
    baseLocale: settings.baseLocale,
    messages: Number(messages?.count ?? 0),
    ...(source ? { source } : {}),
    errors,
    checks: statuses,
    diagnostics,
    summary: { findings: diagnostics.length, byCheck },
  };
}

/** Findings or project errors fail the check. Unavailable or incomplete checks alone don't. */
export function hasFindings(report: CheckReport): boolean {
  return report.summary.findings > 0 || report.errors.length > 0;
}

function matcherHint(modules: readonly string[] | undefined): string {
  const module = modules?.find((uri) =>
    uri.includes("plugin-m-function-matcher"),
  );
  return module
    ? `${MATCHER_UPDATE_HINT}: ${module}`
    : `${MATCHER_UPDATE_HINT}.`;
}

/** The source code an issue points at, from the snapshot the analyzer read. */
function locate(
  issue: UsageIssue,
  files: readonly SourceFile[] | undefined,
): { code?: string } {
  if (!issue.start || !issue.end || issue.path === undefined) return {};
  const file = files?.find((file) => file.path === issue.path);
  const line = file?.content.split("\n")[issue.start.line - 1];
  if (line === undefined) return {};
  const end =
    issue.end.line === issue.start.line ? issue.end.column : line.length;
  const code = line.slice(issue.start.column, end).trim();
  if (!code) return {};
  return {
    code:
      code.length > 60 || issue.end.line !== issue.start.line
        ? `${code.slice(0, 60)}…`
        : code,
  };
}

async function matchesOf(
  project: InlangProject,
  variantIds: string[],
): Promise<Map<string, Match[]>> {
  const result = new Map<string, Match[]>();
  const ids = [...new Set(variantIds)];
  for (let i = 0; i < ids.length; i += 500) {
    const rows = await project.db
      .selectFrom("inlang_variant")
      .select(["id", "matches"])
      .where("id", "in", ids.slice(i, i + 500))
      .execute();
    for (const row of rows) result.set(row.id, row.matches as Match[]);
  }
  return result;
}
