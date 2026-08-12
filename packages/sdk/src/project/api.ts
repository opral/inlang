import type { Kysely } from "kysely";
import type { InlangDatabaseSchema } from "../database/schema.js";
import type { InlangPlugin } from "../plugin/schema.js";
import type { ProjectSettings } from "../json-schema/settings.js";
import type { InlangLix } from "../lix/withDb.js";

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
	lix: InlangLix;
	importFiles: (args: {
		pluginKey: InlangPlugin["key"];
		files: ImportFile[];
	}) => Promise<void>;
	exportFiles: (args: {
		pluginKey: InlangPlugin["key"];
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
