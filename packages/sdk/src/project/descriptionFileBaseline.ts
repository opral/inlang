/** The companion file observed by a directory-backed project, including absence. */
const baselines = new WeakMap<object, Map<string, Uint8Array | undefined>>();

export function rememberDescriptionFile(
	lix: object,
	path: string,
	content: Uint8Array | undefined
): void {
	let files = baselines.get(lix);
	if (!files) baselines.set(lix, (files = new Map()));
	files.set(path, content?.slice());
}

export async function assertDescriptionFileUnchanged(
	lix: object,
	path: string,
	readFile: (path: string) => Promise<Uint8Array>
): Promise<void> {
	const files = baselines.get(lix);
	// A project exported to a different directory has no baseline there.
	if (!files?.has(path)) return;
	let current: Uint8Array | undefined;
	try {
		current = await readFile(path);
	} catch (error) {
		if ((error as { code?: string }).code !== "ENOENT") throw error;
	}
	const previous = files.get(path);
	if (
		previous === undefined
			? current === undefined
			: current !== undefined &&
				previous.length === current.length &&
				previous.every((byte, index) => byte === current[index])
	)
		return;
	throw new Error(
		`Cannot overwrite ${path}: descriptions.json changed since the project was loaded or saved. Reload the project before saving.`
	);
}
