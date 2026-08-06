export { newProject } from "./project/newProject.js";
export { loadProjectInMemory } from "./project/loadProjectInMemory.js";

export {
	loadProjectFromDirectory,
	/**
	 * @deprecated use `loadProjectFromDirectory()` instead (it's a rename)
	 */
	loadProjectFromDirectory as loadProjectFromDirectoryInMemory,
} from "./project/loadProjectFromDirectory.js";

export { saveProjectToDirectory } from "./project/saveProjectToDirectory.js";
export type { InlangProject } from "./project/api.js";
export * from "./json-schema/settings.js";
export * from "./json-schema/pattern.js";
export * from "./helper.js";
export * from "./query-utilities/index.js";
export * from "./plugin/errors.js";
export { humanId } from "./human-id/human-id.js";
export type { InlangDatabaseSchema } from "./database/schema.js";
export { executeLixBatch } from "./database/lixBatch.js";
export type { ImportFile, ExportFile } from "./project/api.js";
export type {
	InlangPlugin,
	BundleImport,
	MessageImport,
	VariantImport,
} from "./plugin/schema.js";
export type { IdeExtensionConfig } from "./plugin/meta/ideExtension.js";
export * from "./database/schema.js";
export { createMessageV1 } from "./migrations/v2/createMessageV1.js";
