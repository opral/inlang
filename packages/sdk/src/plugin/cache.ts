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

async function readModuleFromCache(
	moduleURI: string,
	lix: Lix
): Promise<string | undefined> {
	const moduleHash = escape(moduleURI);
	const filePath = `/cache/plugins/${moduleHash}`;

	const result = await lix.execute(
		"SELECT content FROM lix_file WHERE path = $1",
		[filePath]
	);
	const file = result.rows[0];

	if (file) {
		return new TextDecoder().decode(file.value("content").asBytes());
	}
	return undefined;
}

async function writeModuleToCache(
	moduleURI: string,
	moduleContent: string,
	lix: Lix
): Promise<void> {
	const moduleHash = escape(moduleURI);
	const filePath = `/cache/plugins/${moduleHash}`;

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
