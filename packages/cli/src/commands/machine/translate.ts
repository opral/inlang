/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Command } from "commander";
import { getInlangProject } from "../../utilities/getInlangProject.js";
import { log, logError } from "../../utilities/log.js";
import {
  saveProjectToDirectory,
  selectBundleNested,
  upsertBundleNested,
  type InlangProject,
} from "@inlang/sdk";
import { projectOption } from "../../utilities/globalFlags.js";
import progessBar from "cli-progress";
import fs from "node:fs/promises";
import {
  machineTranslateBundle,
  type MachineTranslateResult,
} from "./machineTranslateBundle.js";
import { resolveMachineTranslateProvider } from "./providers/resolveProvider.js";

export const translate = new Command()
  .command("translate")
  .requiredOption(projectOption.flags, projectOption.description)
  .option("-q, --quiet", "don't log every tranlation.", false)
  .option("--locale <source>", "Locales for translation.")
  .option(
    "--targetLocales <targets...>",
    "Comma separated list of target locales for translation.",
  )
  .option("-n, --nobar", "disable progress bar", false)
  .description("Machine translate bundles.")
  .action(async (args: { force: boolean; project: string }) => {
    let exitCode = 0;
    try {
      const project = await getInlangProject({ projectPath: args.project });
      let partialError: PartialMachineTranslateError | undefined;
      try {
        await translateCommandAction({ project });
      } catch (error) {
        if (!(error instanceof PartialMachineTranslateError)) {
          throw error;
        }
        partialError = error;
      }
      // Keep every translation that succeeded, even if some didn't.
      await saveProjectToDirectory({ fs, path: args.project, project });
      if (partialError) {
        throw partialError;
      }
    } catch (error) {
      logError(error);
      exitCode = 1;
    } finally {
      process.exit(exitCode);
    }
  });

/**
 * Thrown when the translation provider was unavailable for some translations.
 * Every translation that did succeed has already been written to the project.
 */
export class PartialMachineTranslateError extends Error {
  override name = "PartialMachineTranslateError";
}

export async function translateCommandAction(args: { project: InlangProject }) {
  const options = translate.opts();
  const provider = resolveMachineTranslateProvider();

  const bar = options.nobar
    ? undefined
    : new progessBar.SingleBar(
        {
          clearOnComplete: true,
          format: `🤖 Machine translating bundles | {bar} | {percentage}% | {value}/{total} Bundles`,
        },
        progessBar.Presets.shades_grey,
      );
  try {
    const settings = await args.project.settings.get();

    const targetLocales: string[] = options.targetLocales
      ? options.targetLocales[0]?.split(",")
      : settings.locales;

    const bundles = await selectBundleNested(args.project.db)
      .selectAll()
      .execute();

    if (bundles.length === 0) {
      log.warn(
        "No message bundles found to translate. Check your project setup with `inlang validate`",
      );
      return;
    }

    bar?.start(bundles.length, 0);

    const promises: Promise<MachineTranslateResult>[] = [];
    const errors: string[] = [];

    for (const bundle of bundles) {
      const translationPromise = machineTranslateBundle({
        bundle,
        sourceLocale: settings.baseLocale,
        targetLocales: targetLocales,
        provider,
      });

      const trackedPromise = (
        translationPromise as Promise<MachineTranslateResult>
      ).then((result) => {
        bar?.increment();
        return result;
      });

      promises.push(trackedPromise);
    }

    const updatedBundles = await Promise.all(promises);

    let unavailableError: string | undefined;
    let unavailableCount = 0;
    for (const bundle of updatedBundles) {
      if (bundle.unavailable) {
        // Reported once below rather than once per affected bundle.
        unavailableError = bundle.error;
        unavailableCount += bundle.unavailableCount ?? 1;
      } else if (bundle.error) {
        errors.push(bundle.error);
        continue;
      }
      if (bundle.data) {
        await upsertBundleNested(args.project.db, bundle.data);
      }
    }
    bar?.stop();

    if (errors.length > 0) {
      log.warn("Some bundles could not be translated.");
      log.warn(errors.join("\n"));
    }

    // The provider itself was unavailable for some translations: keep the ones
    // that succeeded, but still fail the command with a single summary error.
    if (unavailableError) {
      throw new PartialMachineTranslateError(
        `${unavailableCount} ${unavailableCount === 1 ? "translation" : "translations"} could not be completed.\n${unavailableError}`,
      );
    }

    log.success("Machine translate complete.");
  } catch (error) {
    bar?.stop();
    throw error;
  }
}
