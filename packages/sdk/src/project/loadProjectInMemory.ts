import { openLix } from "@lix-js/sdk";
import { registerInlangSchemas } from "../database/registerSchemas.js";
import { loadProject } from "./loadProject.js";
import { restoreProjectBlob } from "./snapshot.js";

/**
 * Load a project from a blob in memory.
 */
export async function loadProjectInMemory(
	args: { blob: Blob } & Omit<Parameters<typeof loadProject>[0], "lix">
) {
	const lix = await openLix();
	await registerInlangSchemas(lix);
	await restoreProjectBlob(lix, args.blob);
	return await loadProject({
		// pass common arguments to loadProject
		...args,
		lix,
	});
}
