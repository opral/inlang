/**
 * The translation files that a project read from or wrote to a directory, by
 * absolute path: a digest of their content, and the locale and namespace
 * they were read or written as.
 *
 * `saveProjectToDirectory` passes a file to the plugin as `imported` only if
 * its content is still the one the project read or wrote, as the same locale
 * and namespace (the settings can change which locale a path belongs to), so
 * that a plugin removes deleted messages only from files whose messages the
 * project had (see `ExistingFile.imported`). Keyed by the project's Lix
 * instance, which `loadProjectFromDirectory` returns unchanged.
 */
const readFiles = new WeakMap<object, Map<string, string>>();

/** The digest of a file read or written as `as`. */
async function fingerprint(
	content: Uint8Array,
	as: { locale: string; metadata?: Record<string, any> }
): Promise<string> {
	return JSON.stringify([
		as.locale,
		as.metadata?.["namespace"] ?? null,
		content.length,
		await digest(content),
	]);
}

async function digest(content: Uint8Array): Promise<string> {
	const subtle = globalThis.crypto?.subtle;
	if (subtle !== undefined) {
		try {
			const hash = await subtle.digest("SHA-256", new Uint8Array(content));
			return Array.from(new Uint8Array(hash), (byte) =>
				byte.toString(16).padStart(2, "0")
			).join("");
		} catch {
			// e.g. not a secure context
		}
	}
	// FNV-1a, where Web Crypto isn't available
	let hash = 0x811c9dc5;
	for (const byte of content) {
		hash ^= byte;
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return `fnv1a:${hash.toString(16)}`;
}

/**
 * Remembers that the project read or wrote `content` at `absolutePath` as
 * the file of `as.locale` (and `as.metadata.namespace`).
 */
export async function rememberReadFile(
	project: { lix: object },
	absolutePath: string,
	content: Uint8Array,
	as: { locale: string; metadata?: Record<string, any> }
): Promise<void> {
	let files = readFiles.get(project.lix);
	if (files === undefined) {
		files = new Map();
		readFiles.set(project.lix, files);
	}
	files.set(absolutePath, await fingerprint(content, as));
}

/**
 * Whether `content` at `absolutePath` is what the project read or wrote, as
 * the file of the same locale and namespace.
 */
export async function wasReadFile(
	project: { lix: object },
	absolutePath: string,
	content: Uint8Array,
	as: { locale: string; metadata?: Record<string, any> }
): Promise<boolean> {
	const known = readFiles.get(project.lix)?.get(absolutePath);
	return known !== undefined && known === (await fingerprint(content, as));
}
