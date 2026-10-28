import type { Lix } from "@lix-js/sdk";

function escape(url: string) {
	const bytes = new TextEncoder().encode(url);

	// 64-bit FNV1a hash to make the file-names shorter
	// https://en.wikipedia.org/wiki/FNV-1a
	const hash = bytes.reduce(
		(hash, byte) =>
			BigInt.asUintN(64, (hash ^ BigInt(byte)) * 1_099_511_628_211n),
		14_695_981_039_346_656_037n
	);

	return hash.toString(36);
}

/** The directory-project cache path used by network-first plugin loading. */
export function pluginCachePath(moduleURI: string): string {
	return `/cache/plugins/${escape(moduleURI)}`;
}

async function readModuleFromCache(
	moduleURI: string,
	lix: Lix
): Promise<string | undefined> {
	const filePath = pluginCachePath(moduleURI);

	const file = await lix.queryOne<{ content: Uint8Array }>(
		"SELECT content FROM lix_file WHERE path = $1",
		[filePath]
	);

	if (file) {
		return new TextDecoder().decode(file.content);
	}
	return undefined;
}

async function writeModuleToCache(
	moduleURI: string,
	moduleContent: string,
	lix: Lix
): Promise<void> {
	const filePath = pluginCachePath(moduleURI);

	await lix.execute(
		"INSERT INTO lix_file (path, content) VALUES ($1, $2) ON CONFLICT (path) DO UPDATE SET content = excluded.content",
		[filePath, new TextEncoder().encode(moduleContent)]
	);
}

/**
 * Implements a "Network-First" caching strategy.
 */
export function withCache(
	moduleLoader: (uri: string) => Promise<string>,
	lix: Lix
): (uri: string) => Promise<string> {
	return async (uri: string) => {
		try {
			const moduleAsText = await moduleLoader(uri);
			await writeModuleToCache(uri, moduleAsText, lix);
			return moduleAsText;
		} catch (e) {
			// network fetch failed, try to read from cache
			const cacheResult = await readModuleFromCache(uri, lix);
			if (cacheResult) {
				return cacheResult;
			} else {
				throw e;
			}
		}
	};
}
