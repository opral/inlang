import { openLix } from "@lix-js/sdk";
import type { NewKeyValue } from "../lix/compat.js";
import { registerInlangSchemas } from "../database/registerSchemas.js";
import { loadProject } from "./loadProject.js";
import { restoreProjectBlob } from "./snapshot.js";

/**
 * Load a project from a blob in memory.
 */
export async function loadProjectInMemory(
	args: {
		blob: Blob;
		lixKeyValues?: NewKeyValue[];
	} & Omit<Parameters<typeof loadProject>[0], "lix">
) {
	const lix = await openLix();
	await registerInlangSchemas(lix);
	await restoreProjectBlob(lix, args.blob);
	const projectId = args.lixKeyValues?.find((entry) => entry.key === "lix_id");
	if (typeof projectId?.value === "string") {
		await lix.execute(
			"UPDATE lix_file SET content = $1 WHERE path = '/project_id'",
			[new TextEncoder().encode(projectId.value)]
		);
	}

	return await loadProject({
		// pass common arguments to loadProject
		...args,
		lix,
	});
}
