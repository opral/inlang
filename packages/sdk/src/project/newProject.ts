import { openLix } from "@lix-js/sdk";
import type { ProjectSettings } from "../json-schema/settings.js";
import { registerInlangSchemas } from "../database/registerSchemas.js";
import { projectToBlob } from "./snapshot.js";
import { v4 } from "uuid";

/**
 * Creates a new inlang project.
 *
 * The app is responsible for saving the project "whereever"
 * e.g. the user's computer, cloud storage, or OPFS in the browser.
 */
export async function newProject(args?: {
	settings?: ProjectSettings;
}): Promise<Blob> {
	const lix = await openLix();
	try {
		await registerInlangSchemas(lix);
		const projectId = v4();
		await lix.executeBatch([
			{
				sql: "INSERT INTO lix_file (path, content) VALUES ($1, $2)",
				params: [
					"/settings.json",
					new TextEncoder().encode(
						JSON.stringify(
							args?.settings ?? defaultProjectSettings,
							undefined,
							2
						)
					),
				],
			},
			{
				sql: "INSERT INTO lix_file (path, content) VALUES ($1, $2)",
				params: ["/project_id", new TextEncoder().encode(projectId)],
			},
		]);
		return await projectToBlob(lix);
	} catch (e) {
		const error = new Error(`Failed to create new inlang project: ${e}`, {
			cause: e,
		});
		throw error;
	} finally {
		await lix.close();
	}
}

export const defaultProjectSettings = {
	$schema: "https://inlang.com/schema/project-settings",
	baseLocale: "en",
	locales: ["en"],
	modules: [
		// for instant gratification, we're adding common rules
		// "https://cdn.jsdelivr.net/npm/@inlang/message-lint-rule-empty-pattern@latest/dist/index.js",
		// "https://cdn.jsdelivr.net/npm/@inlang/message-lint-rule-missing-translation@latest/dist/index.js",
		// "https://cdn.jsdelivr.net/npm/@inlang/message-lint-rule-without-source@latest/dist/index.js",
		// default to the message format plugin because it supports all features
		// "https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format@latest/dist/index.js",
		// the m function matcher should be installed by default in case Sherlock (VS Code extension) is adopted
		// "https://cdn.jsdelivr.net/npm/@inlang/plugin-m-function-matcher@latest/dist/index.js",
	],
} satisfies ProjectSettings;
