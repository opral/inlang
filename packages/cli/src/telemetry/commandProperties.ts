import type { Command } from "commander";

/**
 * Describes a command invocation for telemetry without anything the user
 * typed: the command's name (e.g. `machine translate`) and the names of the
 * flags passed on the command line (e.g. `["locales", "project"]`).
 *
 * Never includes flag values or positional arguments, which can be paths,
 * globs, locales or message keys.
 */
export function commandTelemetryProperties(actionCommand: Command): {
  name: string;
  flags: string[];
} {
  const chain: Command[] = [];
  for (
    let command: Command | null = actionCommand;
    command;
    command = command.parent
  )
    chain.unshift(command);
  const flags = new Set<string>();
  for (const command of chain)
    for (const option of command.options)
      if (command.getOptionValueSource(option.attributeName()) === "cli")
        flags.add(option.name());
  return {
    // the root command (`inlang`) is the same for every invocation
    name: chain
      .slice(1)
      .map((command) => command.name())
      .join(" "),
    flags: [...flags].sort(),
  };
}
