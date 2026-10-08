import { randomUUID } from "node:crypto";
import {
  Text,
  type BundleNested,
  type NewBundleNested,
  type VariantRow,
} from "@inlang/sdk";
import {
  deserializePattern,
  findMatchingVariant,
  serializePattern,
} from "./patternSerialization.js";
import type { MachineTranslateProvider } from "./providers/types.js";

type MachineTranslateArgs = {
  bundle: BundleNested;
  sourceLocale: string;
  targetLocales: string[];
  provider: MachineTranslateProvider;
};

export type MachineTranslateResult = {
  data?: NewBundleNested;
  error?: string;
  /** Set when `error` means the translation provider itself is unavailable. */
  unavailable?: boolean;
  /**
   * Number of translations skipped because the provider was unavailable. The
   * rest of the bundle is still translated and returned in `data`.
   */
  unavailableCount?: number;
};

/**
 * Machine translates the given bundle using the configured translation provider.
 *
 * The translation updates or creates variants only for missing translations in
 * the requested target locales. Existing non-empty variants are preserved.
 *
 * @example
 *   const provider = resolveMachineTranslateProvider();
 *   const result = await machineTranslateBundle({
 *     bundle,
 *     sourceLocale: "en",
 *     targetLocales: ["de"],
 *     provider,
 *   });
 *   if (result.data) {
 *     await upsertBundleNested(project, result.data);
 *   }
 */
export async function machineTranslateBundle(
  args: MachineTranslateArgs,
): Promise<MachineTranslateResult> {
  try {
    const copy = structuredClone(args.bundle);
    let unavailableError: string | undefined;
    let unavailableCount = 0;

    const sourceMessage = copy.messages.find(
      (message) => message.locale === args.sourceLocale,
    );

    if (!sourceMessage) {
      return {
        error: `Source locale not found in the bundle: ${args.bundle.id}`,
      };
    }

    for (const sourceVariant of sourceMessage.variants) {
      const sourcePattern = serializePattern(sourceVariant.pattern, {});

      for (const targetLocale of args.targetLocales) {
        if (targetLocale === args.sourceLocale) {
          continue;
        }

        const targetMessage = copy.messages.find(
          (message) => message.locale === targetLocale,
        );

        if (targetMessage) {
          const existingVariant = findMatchingVariant(
            targetMessage.variants,
            sourceVariant.matches,
          );

          if (
            existingVariant &&
            !(
              existingVariant.pattern.length === 0 ||
              (existingVariant.pattern.length === 1 &&
                existingVariant.pattern[0]?.type === "text" &&
                (existingVariant.pattern[0] as Text).value === "")
            )
          ) {
            continue;
          }
        }

        const translation = await args.provider.translateText({
          text: sourcePattern,
          sourceLocale: args.sourceLocale,
          targetLocale,
        });

        if (!translation.ok && translation.unavailable) {
          // Skip only this translation so one throttled or failed request
          // doesn't discard every other translation in the run.
          unavailableError = translation.error;
          unavailableCount++;
          continue;
        }

        if (!translation.ok) {
          return {
            error: translation.error,
            unavailable: translation.unavailable,
          };
        }

        const pattern = deserializePattern(translation.translatedText);

        if (targetMessage) {
          const existingVariant = findMatchingVariant(
            targetMessage.variants,
            sourceVariant.matches,
          );

          if (
            existingVariant &&
            (existingVariant.pattern.length === 0 ||
              (existingVariant.pattern.length === 1 &&
                existingVariant.pattern[0]?.type === "text" &&
                (existingVariant.pattern[0] as Text).value === ""))
          ) {
            existingVariant.pattern = pattern;
          } else {
            targetMessage.variants.push({
              id: randomUUID(),
              message_id: targetMessage.id,
              matches: sourceVariant.matches,
              pattern,
            } satisfies VariantRow);
          }
        } else {
          const newMessageId = randomUUID();
          copy.messages.push({
            ...sourceMessage,
            id: newMessageId,
            locale: targetLocale,
            variants: [
              {
                id: randomUUID(),
                message_id: newMessageId,
                matches: sourceVariant.matches,
                pattern,
              } satisfies VariantRow,
            ],
          });
        }
      }
    }

    if (unavailableError) {
      return {
        data: copy,
        error: unavailableError,
        unavailable: true,
        unavailableCount,
      };
    }

    return { data: copy };
  } catch (error) {
    return { error: error?.toString() ?? "unknown error" };
  }
}
