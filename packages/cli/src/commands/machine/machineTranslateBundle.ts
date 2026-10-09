// uuid v7: variants are ordered by id, so the translated variants keep the
// order of the source message
import { v7 as randomUUID } from "uuid";
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
  /** Number of translations added to `data`. `0` means `data` equals the input. */
  translated?: number;
  /**
   * Ids of variants of `bundle` that `data` has with a new id, to take the
   * order of the source message (see `orderLikeSource`). Delete them after
   * writing `data`.
   */
  replacedVariantIds?: string[];
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
    let translated = 0;
    /** variants added to messages that existed, by message */
    const addedVariants = new Map<
      BundleNested["messages"][number],
      Set<VariantRow>
    >();

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
        translated++;

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
            const variant = {
              id: randomUUID(),
              message_id: targetMessage.id,
              matches: sourceVariant.matches,
              pattern,
            } satisfies VariantRow;
            targetMessage.variants.push(variant);
            const added = addedVariants.get(targetMessage) ?? new Set();
            added.add(variant);
            addedVariants.set(targetMessage, added);
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

    const replacedVariantIds: string[] = [];
    for (const [message, added] of addedVariants) {
      replacedVariantIds.push(
        ...orderLikeSource(message, sourceMessage.variants, added),
      );
    }
    const replaced =
      replacedVariantIds.length > 0 ? { replacedVariantIds } : {};

    if (unavailableError) {
      return {
        data: copy,
        error: unavailableError,
        unavailable: true,
        unavailableCount,
        translated,
        ...replaced,
      };
    }

    return { data: copy, translated, ...replaced };
  } catch (error) {
    return { error: error?.toString() ?? "unknown error" };
  }
}

const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Puts the variants of a message that existed in the order of the source
 * message, after `added` were appended to it.
 *
 * Runtimes like Paraglide JS select the first variant that matches, so a
 * translated `one` must not end up after an existing catch-all. Variants are
 * ordered by id (uuid v7) in the project, so the variants from the first one
 * whose place changes on get new ids in the new order; the ids they had are
 * returned, to be deleted. Existing variants keep their matches and pattern.
 * A variant the source doesn't have (e.g. a plural category of the target
 * language) stays after the variant it followed. Messages whose order doesn't
 * change keep every id.
 */
export function orderLikeSource(
  message: { variants: VariantRow[] },
  sourceVariants: VariantRow[],
  added: Set<VariantRow>,
): string[] {
  const sourceIndex = (variant: VariantRow) =>
    sourceVariants.findIndex(
      (source) => findMatchingVariant([variant], source.matches) !== undefined,
    );
  let previous = -1;
  const keyed = message.variants.map((variant, position) => {
    let key = sourceIndex(variant);
    if (key === -1) key = previous;
    if (!added.has(variant)) previous = key;
    return { variant, key, position };
  });
  const ordered = [...keyed]
    .sort((a, b) => a.key - b.key || a.position - b.position)
    .map(({ variant }) => variant);
  let start = ordered.findIndex(
    (variant, index) => variant !== message.variants[index],
  );
  if (start === -1) return [];
  // the variants before keep their ids: a new id must sort after them
  const newId = randomUUID();
  while (
    start > 0 &&
    !(UUID_V7.test(ordered[start - 1]!.id) && ordered[start - 1]!.id < newId)
  ) {
    start--;
  }
  const replaced: string[] = [];
  for (const variant of ordered.slice(start)) {
    if (!added.has(variant)) replaced.push(variant.id);
    variant.id = randomUUID();
  }
  message.variants = ordered;
  return replaced;
}
