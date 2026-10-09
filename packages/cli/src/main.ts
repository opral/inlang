import { Command } from "commander";
import { machine } from "./commands/machine/index.js";
import { plugin } from "./commands/plugin/index.js";
import { version } from "../package.json";
import { silenceKnownShutdownNoise } from "./utilities/silenceKnownShutdownNoise.js";
import { validate } from "./commands/validate/index.js";
import { lint } from "./commands/lint/index.js";
import { check } from "./commands/check/index.js";
import { cloud } from "./commands/cloud/index.js";

// --------------- INIT ---------------

silenceKnownShutdownNoise();
// checks whether the gitOrigin corresponds to the pattern

// beautiful logging
// ;(consola as unknown as Consola).wrapConsole()

// --------------- CLI ---------------

export const cli = new Command()
  // Settings
  .name("inlang")
  .version(version)
  .description("CLI for inlang.")
  // Commands
  .addCommand(check)
  .addCommand(machine)
  .addCommand(plugin)
  .addCommand(cloud)
  .addHelpText(
    "after",
    "\nComing soon: hosted AI translation and handoff between design, translation and code. Run `inlang cloud`.",
  )
  // Deprecated, hidden from --help: use `check`.
  .addCommand(validate, { hidden: true })
  .addCommand(lint, { hidden: true });
