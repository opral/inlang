/**
 * The translation files that a project read from or wrote to a directory, by
 * absolute path, with a digest of their content.
 *
 * `saveProjectToDirectory` passes a file to the plugin as `imported` only if
 * its content is still the one the project read or wrote, so that a plugin
 * removes deleted messages only from files whose messages the project had
 * (see `ExistingFile.imported`). Keyed by the project's Lix instance, which
 * `loadProjectFromDirectory` returns unchanged.
 */
const readFiles = new WeakMap<object, Map<string, string>>();

async function digest(content: Uint8Array): Promise<string> {
	const hash = await globalThis.crypto.subtle.digest(
		"SHA-256",
		new Uint8Array(content)
	);
	return Array.from(new Uint8Array(hash), (byte) =>
		byte.toString(16).padStart(2, "0")
	).join("");
}

/** Remembers that the project read or wrote `content` at `absolutePath`. */
export async function rememberReadFile(
	project: { lix: object },
	absolutePath: string,
	content: Uint8Array
): Promise<void> {
	let files = readFiles.get(project.lix);
	if (files === undefined) {
		files = new Map();
		readFiles.set(project.lix, files);
	}
	files.set(absolutePath, await digest(content));
}

/** Whether `content` at `absolutePath` is what the project read or wrote. */
export async function wasReadFile(
	project: { lix: object },
	absolutePath: string,
	content: Uint8Array
): Promise<boolean> {
	const known = readFiles.get(project.lix)?.get(absolutePath);
	return known !== undefined && known === (await digest(content));
}
