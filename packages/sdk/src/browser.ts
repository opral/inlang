/**
 * Browser-safe Inlang SDK entrypoint.
 *
 * This intentionally excludes the Node.js directory project APIs exported by
 * the package root so browser bundlers do not need to externalize `node:fs`
 * or `node:path`.
 */
export { openProject, type OpenProjectArgs } from "./project/openProject.js";
export type {
	InlangProject,
	ImportFile,
	ExportFile,
} from "./project/api.js";
export * from "./json-schema/settings.js";
export * from "./json-schema/pattern.js";
export * from "./query-utilities/index.js";
export * from "./plugin/errors.js";
export { executeLixBatch } from "./database/lixBatch.js";
export type {
	InlangPlugin,
	BundleImport,
	MessageImport,
	VariantImport,
} from "./plugin/schema.js";
export * from "./database/schema.js";
