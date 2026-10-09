import { Command } from "commander";
import { log } from "../../utilities/log.js";

/**
 * @deprecated Use `inlang check`. Kept, hidden from `--help`, so scripts that
 * still call it don't break. It only points to `inlang check` and runs nothing.
 */
export const lint = new Command()
  .command("lint")
  .description("Deprecated: use `inlang check`.")
  .allowUnknownOption()
  .allowExcessArguments()
  .action(() => {
    log.warn(
      "inlang lint is deprecated and does nothing. Use inlang check instead, e.g. inlang check --project ./project.inlang --locales de,fr",
    );
  });
