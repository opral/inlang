import { Command } from "commander";
import { getInlangProject } from "../../utilities/getInlangProject.js";
import { log } from "../../utilities/log.js";
import { exit } from "../../utilities/exit.js";
import { projectOption } from "../../utilities/globalFlags.js";

/**
 * @deprecated Use `inlang check`. Kept, hidden from `--help`, for scripts that
 * still call it. It still only reports settings and plugin errors, so CI that
 * runs it doesn't start failing on missing translations.
 */
export const validate = new Command()
  .command("validate")
  .description("Deprecated: use `inlang check`.")
  .requiredOption(projectOption.flags, projectOption.description)
  .action(async (args: { project: string }) => {
    await exit(await validateCommandAction(args));
  });

export async function validateCommandAction(args: {
  project: string;
}): Promise<number> {
  log.warn(
    `inlang validate is deprecated. Use inlang check --project ${args.project} instead, which also reports translation problems and unused messages.`,
  );
  try {
    log.info("🔎 Validating the inlang project...");
    // if `getInlangProject` doesn't throw, the project is valid
    const project = await getInlangProject({ projectPath: args.project });

    const errors = await project.errors.get();
    if (errors.length > 0) {
      log.info("The project contains errors:");
      for (const error of errors) log.error(error);
      return 1;
    }

    log.success("The project is valid!");
    return 0;
  } catch (error) {
    log.error(error);
    return 1;
  }
}
