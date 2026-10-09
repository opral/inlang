import type { Kysely } from "kysely";
import type { InlangDatabaseSchema } from "../database/schema.js";
import type { InlangPlugin } from "../plugin/schema.js";
import type { ProjectSettings } from "../json-schema/settings.js";
import type { Lix } from "@lix-js/sdk";

export type InlangProject = {
	db: Kysely<InlangDatabaseSchema>;
	id: {
		/**
		 * The built-in Lix id. Stable for packed `.inlang` files. Unpacked projects
		 * loaded into a fresh Lix receive a new id on each load.
		 */
		get: () => Promise<string>;
	};
	plugins: {
		get: () => Promise<readonly InlangPlugin[]>;
	};
	errors: {
		get: () => Promise<readonly Error[]>;
	};
	settings: {
		get: () => Promise<ProjectSettings>;
		set: (settings: ProjectSettings) => Promise<void>;
	};
	/** The exact Lix instance supplied by the caller or opened by Inlang. */
	lix: Lix;
	importFiles: (args: {
		pluginKey: InlangPlugin["key"];
		files: ImportFile[];
	}) => Promise<void>;
	exportFiles: (args: {
		pluginKey: InlangPlugin["key"];
		/**
		 * The current content of the files the plugin writes, if they exist.
		 *
		 * Plugins that support it keep the text of every entry that didn't
		 * change, so that an export only changes the bytes of edited messages.
		 * Pass the files the plugin lists in `toBeImportedFiles`. See
		 * `ExistingFile`.
		 */
		files?: ExistingFile[];
	}) => Promise<ExportFile[]>;
	close: () => Promise<void>;
	toBlob: () => Promise<Blob>;
};

export type ImportFile = {
	/** The locale of the resource file */
	locale: string;
	/** The binary content of the resource */
	content: Uint8Array;
	/**
	 * The metadata of the file to be imported.
	 *
	 * Used to store additional information that is accessible in `importFiles` via `toBeImportedFilesMetadata`.
	 * https://github.com/opral/inlang/issues/218
	 */
	toBeImportedFilesMetadata?: Record<string, any>;
};

/**
 * A translation file as it is before an export overwrites it, e.g. on disk
 * or in a git repository.
 *
 * `path`, `locale` and `metadata` are the ones the plugin returns from
 * `toBeImportedFiles`, so that a plugin can match an exported file with the
 * file it replaces.
 */
export type ExistingFile = {
	/** The path as returned by `toBeImportedFiles`. */
	path: string;
	/** The locale of the file. */
	locale: string;
	/** The binary content of the file. */
	content: Uint8Array;
	/** The metadata as returned by `toBeImportedFiles`. */
	metadata?: Record<string, any>;
};

export type ExportFile = {
	/** The locale of the resource file */
	locale: string;
	/**
	 * The name of the file.
	 *
	 * @example
	 *   "en.json"
	 *   "common-de.json"
	 *
	 */
	name: string;
	/** The binary content of the resource */
	content: Uint8Array;
	/**
	 * Metadata of the exported file.
	 *
	 * The counterpart of `ImportFile.toBeImportedFilesMetadata`. Plugins can
	 * use it to pass information to the writer. For example, a plugin that
	 * supports a namespaced `pathPattern` (`Record<namespace, pattern>`)
	 * provides `{ namespace }` so that `saveProjectToDirectory` can resolve
	 * the pattern each exported file belongs to. Plugins can also provide
	 * `{ pathPattern }` to override the configured pattern for one file.
	 *
	 * https://github.com/opral/inlang/issues/4356
	 */
	metadata?: Record<string, any>;
};

/**
 * Minimal RxJS compatible (generic) subscription type.
 */
export type Subscription<T> = (callback: (value: T) => void) => {
	unsubscribe: () => void;
};
