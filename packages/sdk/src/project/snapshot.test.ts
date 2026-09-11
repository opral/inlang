import { openLix } from "@lix-js/sdk";
import { expect, test } from "vitest";
import { registerInlangSchemas } from "../database/registerSchemas.js";
import { projectToBlob, restoreProjectBlob } from "./snapshot.js";

test("restoring snapshot files replaces initialized paths and preserves unrelated files", async () => {
	const source = await openLix();
	const destination = await openLix();
	try {
		await registerInlangSchemas(source);
		await registerInlangSchemas(destination);
		const snapshotContent = new Uint8Array([0, 255, 17]);
		const initializedContent = new Uint8Array([12, 34]);
		const unrelatedContent = new Uint8Array([56, 78]);
		const putFile =
			"INSERT INTO lix_file (path, content) VALUES ($1, $2) ON CONFLICT (path) DO UPDATE SET content = excluded.content";
		await source.execute(putFile, ["/.lix/README.md", snapshotContent]);
		await source.execute(putFile, ["/snapshot-only.txt", snapshotContent]);
		await destination.execute(putFile, ["/.lix/README.md", initializedContent]);
		await destination.execute(putFile, [
			"/destination-only.txt",
			unrelatedContent,
		]);
		const snapshot = await projectToBlob(source);

		await restoreProjectBlob(destination, snapshot);
		const restoredId = await destination.execute(
			"SELECT value FROM lix_key_value WHERE key = 'lix_id'"
		);
		expect(restoredId.rows[0]?.value).toBe(
			JSON.parse(await snapshot.text()).lixId
		);

		const { rows } = await destination.execute<{
			path: string;
			content: Uint8Array;
		}>(
			"SELECT path, content FROM lix_file WHERE path IN ($1, $2, $3) ORDER BY path",
			["/.lix/README.md", "/destination-only.txt", "/snapshot-only.txt"]
		);
		expect(rows).toEqual([
			{ path: "/.lix/README.md", content: snapshotContent },
			{ path: "/destination-only.txt", content: unrelatedContent },
			{ path: "/snapshot-only.txt", content: snapshotContent },
		]);
	} finally {
		await source.close();
		await destination.close();
	}
});
