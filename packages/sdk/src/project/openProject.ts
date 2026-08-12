import type { Lix } from "@lix-js/sdk";
import { registerInlangSchemas } from "../database/registerSchemas.js";
import type { ProjectSettings } from "../json-schema/settings.js";
import { defaultProjectSettings } from "./newProject.js";
import { loadProject } from "./loadProject.js";

export type OpenProjectArgs = {
	/**
	 * The caller-owned Lix that stores the project.
	 *
	 * `project.close()` releases Inlang resources but does not close this Lix.
	 */
	lix: Lix;
	/** Settings used only when the supplied Lix does not contain a project yet. */
	settings?: ProjectSettings;
} & Omit<Parameters<typeof loadProject>[0], "lix" | "closeLixOnClose">;

/**
 * Opens an Inlang project on a caller-provided Lix.
 *
 * Inlang registers its schemas and initializes a fresh Lix with project
 * settings when necessary. The caller retains ownership of the Lix lifecycle.
 */
export async function openProject(
	args: OpenProjectArgs
): Promise<Awaited<ReturnType<typeof loadProject>>> {
	await registerInlangSchemas(args.lix);
	await initializeSettingsIfMissing(args);

	return loadProject({
		...args,
		lix: args.lix,
		closeLixOnClose: false,
	});
}

async function initializeSettingsIfMissing(args: {
	lix: Lix;
	settings?: ProjectSettings;
}): Promise<void> {
	const result = await args.lix.execute(
		"SELECT path FROM lix_file WHERE path = $1",
		["/settings.json"]
	);
	if (result.rows.length > 0) return;

	await args.lix.execute(
		"INSERT INTO lix_file (path, content) VALUES ($1, $2)",
		[
			"/settings.json",
			new TextEncoder().encode(
				JSON.stringify(args.settings ?? defaultProjectSettings, undefined, 2)
			),
		]
	);
}
