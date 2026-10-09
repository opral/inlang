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
      await translateAndSave({ project, path: args.project });
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
  constructor(
    message: string,
    /** Translations that succeeded. */
    readonly translated: number,
  ) {
    super(message);
  }
}

/**
 * Translates and writes the translation files, but only if something was
 * translated: re-exporting unchanged files can reformat them and must not
 * change files in git.
 */
export async function translateAndSave(args: {
  project: InlangProject;
  path: string;
}) {
  let translated: number;
  let partialError: PartialMachineTranslateError | undefined;
  try {
    ({ translated } = await translateCommandAction({ project: args.project }));
  } catch (error) {
    if (!(error instanceof PartialMachineTranslateError)) {
      throw error;
    }
    partialError = error;
    translated = error.translated;
  }
  // Keep every translation that succeeded, even if some didn't.
  if (translated > 0) {
    await saveProjectToDirectory({
      fs,
      path: args.path,
      project: args.project,
    });
  } else if (!partialError) {
    log.info("Nothing to translate. No files were changed.");
  }
  if (partialError) {
    throw partialError;
  }
}

/** Translates missing translations into the project. Returns how many were added. */
export async function translateCommandAction(args: {
  project: InlangProject;
}): Promise<{ translated: number }> {
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
        "No message bundles found to translate. Check your project setup with `inlang check`",
      );
      return { translated: 0 };
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
    let translated = 0;
    for (const bundle of updatedBundles) {
      if (bundle.unavailable) {
        // Reported once below rather than once per affected bundle.
        unavailableError = bundle.error;
        unavailableCount += bundle.unavailableCount ?? 1;
      } else if (bundle.error) {
        errors.push(bundle.error);
        continue;
      }
      // Unchanged bundles aren't written back.
      if (bundle.data && (bundle.translated ?? 0) > 0) {
        await upsertBundleNested(args.project.db, bundle.data);
        translated += bundle.translated!;
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
        translated,
      );
    }

    log.success("Machine translate complete.");
    return { translated };
  } catch (error) {
    bar?.stop();
    throw error;
  }
}
