import { Command } from "commander";
import { log } from "../../utilities/log.js";
import { exit } from "../../utilities/exit.js";
import { projectOption } from "../../utilities/globalFlags.js";
import { checkCommandAction } from "../check/index.js";

/**
 * @deprecated Use `inlang check`. Kept, hidden from `--help`, for scripts that
 * still call it. Accepts the v1 lint flags and runs `inlang check`.
 */
export const lint = new Command()
  .command("lint")
  .description("Deprecated: use `inlang check`.")
  .requiredOption(projectOption.flags, projectOption.description)
  .option("--languageTags <tags...>", "Comma separated list of locales.")
  .option("--no-fail", "Exit with 0 even if there are findings.")
  .action(
    async (args: {
      project: string;
      languageTags?: string[];
      fail: boolean;
    }) => {
      const command = [
        `inlang check --project ${args.project}`,
        ...(args.languageTags
          ? [`--locales ${args.languageTags.join(",")}`]
          : []),
        ...(args.fail ? [] : ["--no-fail"]),
      ].join(" ");
      log.warn(`inlang lint is deprecated. Use ${command} instead.`);
      await exit(
        await checkCommandAction({
          project: args.project,
          languageTags: args.languageTags,
          format: "text",
          fail: args.fail,
        }),
      );
    },
  );
