import { Command, Option } from "commander";
import type { CheckId } from "@inlang/sdk";
import {
  getInlangProject,
  ProjectLoadError,
} from "../../utilities/getInlangProject.js";
import { log } from "../../utilities/log.js";
import { exit } from "../../utilities/exit.js";
import { projectOption } from "../../utilities/globalFlags.js";
import {
  CHECKS,
  CheckUsageError,
  hasFindings,
  runCheck,
  type CheckReport,
} from "./runCheck.js";
import { formatJson, formatText } from "./format.js";

export type CheckCommandOptions = {
  project: string;
  locales?: string[];
  languageTags?: string[];
  source?: string[];
  format: "text" | "json";
  fail: boolean;
} & Record<string, unknown>;

export const check = new Command()
  .command("check")
  .description(
    "Check translations for missing, empty or inconsistent messages, and source code for unused messages.",
  )
  .requiredOption(projectOption.flags, projectOption.description)
  .option(
    "--locales <locales...>",
    "Only report findings for these locales (comma or space separated).",
  )
  .addOption(new Option("--languageTags <tags...>").hideHelp())
  .option(
    "--source <paths...>",
    "Files or directories to search for message usages (default: the project's parent directory). Directories skip git-ignored files, node_modules, Paraglide's output and build tool configs.",
  )
  .addOption(
    new Option("--format <format>", "Output format.")
      .choices(["text", "json"])
      .default("text"),
  )
  .option("--no-fail", "Exit with 0 even if there are findings.");
for (const { flag, description } of CHECKS)
  check.option(flag, `Report ${description}.`);
check
  .addHelpText(
    "after",
    `
All checks run by default. Pass check flags to run only those checks.
Project errors (settings, plugins) are always reported.
Exits with 1 if there are findings or project errors, so it can run in CI.

Examples:
  $ inlang check --project ./project.inlang
  $ inlang check --project ./project.inlang --unused-messages --source ./src
  $ inlang check --project ./project.inlang --locales de,fr --format json`,
  )
  .action(async (options: CheckCommandOptions) => {
    await exit(await checkCommandAction(options));
  });

/** Runs the checks, writes the report to stdout and returns the exit code. */
export async function checkCommandAction(
  options: CheckCommandOptions,
): Promise<number> {
  try {
    const project = await getInlangProject({ projectPath: options.project });
    const locales = [
      ...(options.locales ?? []),
      ...(options.languageTags ?? []),
    ]
      .flatMap((value) => value.split(","))
      .map((locale) => locale.trim())
      .filter(Boolean);
    const checks = CHECKS.filter(({ flag }) => options[optionKey(flag)]).map(
      ({ id }) => id as CheckId,
    );
    const report: CheckReport = await runCheck({
      project,
      projectPath: options.project,
      cwd: process.cwd(),
      checks,
      locales,
      source: options.source,
    });
    process.stdout.write(
      options.format === "json"
        ? formatJson(report)
        : formatText(report, {
            color: Boolean(process.stdout.isTTY) && !process.env.NO_COLOR,
          }),
    );
    if (hasFindings(report) && options.fail !== false) {
      if (options.format !== "json")
        log.info("Add --no-fail to exit with 0 despite findings.");
      return 1;
    }
    return 0;
  } catch (error) {
    if (error instanceof CheckUsageError || error instanceof ProjectLoadError)
      log.error(error.message);
    else log.error(error);
    return 1;
  }
}

/** Commander's option key: `--missing-translations` -> `missingTranslations`. */
function optionKey(flag: string): string {
  return flag
    .replace(/^--/, "")
    .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
