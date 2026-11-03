import { parse } from "yaml";

export type TranslationDescriptors = ReadonlyMap<string, string>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		(Object.getPrototypeOf(value) === Object.prototype ||
			Object.getPrototypeOf(value) === null)
	);
}

/**
 * Parses message descriptions used as context during machine translation.
 *
 * Accepts both a flat bundle-ID mapping and the i18n-ally `reviews` mapping.
 */
export function parseTranslationDescriptors(
	source: string,
	filePath = "translation descriptors"
): TranslationDescriptors {
	const parsed: unknown = parse(source);
	if (!isRecord(parsed)) {
		throw new Error(`${filePath} must contain a YAML mapping of bundle IDs.`);
	}

	let entries: Record<string, unknown> = parsed;
	let isReviewsFormat = false;
	if (isRecord(parsed.reviews) && !("description" in parsed.reviews)) {
		entries = parsed.reviews;
		isReviewsFormat = true;
	}

	const descriptors = new Map<string, string>();
	for (const [key, descriptor] of Object.entries(entries)) {
		if (!isRecord(descriptor) || typeof descriptor.description !== "string") {
			throw new Error(`${filePath}: "${key}" must have a string description.`);
		}

		let bundleId = key;
		if (isReviewsFormat) {
			const separator = key.indexOf(".");
			if (separator <= 0 || separator === key.length - 1) {
				throw new Error(
					`${filePath}: i18n-ally review key "${key}" must use the "<namespace>.<key>" format.`
				);
			}
			bundleId = `${key.slice(0, separator)}:${key.slice(separator + 1)}`;
		}

		if (descriptors.has(bundleId)) {
			throw new Error(
				`${filePath}: multiple descriptors resolve to bundle "${bundleId}".`
			);
		}
		descriptors.set(bundleId, descriptor.description);
	}

	return descriptors;
}

/** Returns the description for an exact inlang bundle ID, if configured. */
export function getTranslationDescription(
	bundleId: string,
	descriptors: TranslationDescriptors
): string | undefined {
	return descriptors.get(bundleId);
}
