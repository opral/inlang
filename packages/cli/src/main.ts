import { Command } from "commander";
import { machine } from "./commands/machine/index.js";
import { plugin } from "./commands/plugin/index.js";
import { version } from "../package.json";
import { initErrorMonitoring } from "./services/error-monitoring/implementation.js";
import { silenceKnownShutdownNoise } from "./services/error-monitoring/silenceKnownShutdownNoise.js";
import { validate } from "./commands/validate/index.js";
import { capture } from "./telemetry/capture.js";
import { lastUsedProject } from "./utilities/getInlangProject.js";
import { lint } from "./commands/lint/index.js";
import { check } from "./commands/check/index.js";
import { cloud } from "./commands/cloud/index.js";

// --------------- INIT ---------------

initErrorMonitoring();
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
  .addCommand(lint, { hidden: true })
  // Hooks
  .hook("postAction", async (command) => {
    // name enables better grouping in the telemetry dashboard
    const name = command.args.filter(
      // shouldn't start with a flag and the previous arg shouldn't be a flag
      (arg, i) => !arg.startsWith("-") && !command.args[i - 1]?.startsWith("-"),
    );

    await capture({
      event: `CLI command executed`,
      projectId: await lastUsedProject?.id.get(),
      properties: {
        name: name.join(" "),
        args: command.args.join(" "),
        node_version: process.versions.node,
        platform: process.platform,
        version,
      },
    });
    // process should exit by itself once promises are resolved
  });
