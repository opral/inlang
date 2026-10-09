import type nodeFs from "node:fs";
import type fs from "node:fs/promises";
import type { ExistingFile, ExportFile, InlangProject } from "./api.js";
import path from "node:path";
import { toMessageV1 } from "../json-schema/old-v1-message/toMessageV1.js";
import { absolutePathFromProject, withAbsolutePaths } from "./path-helpers.js";
import { detectJsonFormatting } from "../utilities/detectJsonFormatting.js";
import { selectBundleNested } from "../query-utilities/selectBundleNested.js";
import { README_CONTENT } from "./README_CONTENT.js";
import { selectPluginRows } from "../import-export/pluginRows.js";
import { ENV_VARIABLES } from "../services/env-variables/index.js";
import type { InlangPlugin } from "../plugin/schema.js";
import type { ProjectSettings } from "../json-schema/settings.js";
import { compareSemver, pickHighestVersion, readProjectMeta } from "./meta.js";

async function fileExists(fsModule: typeof fs, filePath: string) {
	try {
		await fsModule.stat(filePath);
		return true;
	} catch {
		return false;
	}
}

type SaveProjectFs = typeof fs | typeof nodeFs;

function getPromisesFs(fsModule: SaveProjectFs): typeof fs {
	return "promises" in fsModule ? fsModule.promises : fsModule;
}

async function assertTranslationDataCanBeExported(project: InlangProject) {
	const plugins = await project.plugins.get();
	const hasExporter = plugins.some(
		(plugin) => plugin.exportFiles || plugin.saveMessages
	);
	if (hasExporter) {
		return;
	}

	const [bundle, message, variant] = await Promise.all([
		project.db
			.selectFrom("inlang_bundle")
			.select("id")
			.limit(1)
			.executeTakeFirst(),
		project.db
			.selectFrom("inlang_message")
			.select("id")
			.limit(1)
			.executeTakeFirst(),
		project.db
			.selectFrom("inlang_variant")
			.select("id")
			.limit(1)
			.executeTakeFirst(),
	]);
	if (bundle || message || variant) {
		throw new Error(
			"saveProjectToDirectory cannot write bundles, messages, or variants without an import/export plugin. Add a plugin to settings.modules/providePlugins, or save the canonical .inlang file with project.toBlob()."
		);
	}
}

/**
 * Reads the files that `plugin.toBeImportedFiles` lists, i.e. the files that
 * the plugin's export overwrites, if they exist.
 */
async function readExistingFiles(args: {
	fs: typeof fs;
	projectPath: string;
	plugin: InlangPlugin;
	settings: ProjectSettings;
}): Promise<ExistingFile[] | undefined> {
	if (!args.plugin.toBeImportedFiles) {
		return undefined;
	}
	let toBeImportedFiles: Awaited<
		ReturnType<NonNullable<InlangPlugin["toBeImportedFiles"]>>
	>;
	try {
		toBeImportedFiles = await args.plugin.toBeImportedFiles({
			settings: args.settings,
		});
	} catch {
		// The import already reported the error. Without the list, the plugin
		// writes whole files as before.
		return undefined;
	}
	const result: ExistingFile[] = [];
	for (const file of toBeImportedFiles) {
		try {
			const content = await args.fs.readFile(
				absolutePathFromProject(args.projectPath, file.path)
			);
			result.push({
				path: file.path,
				locale: file.locale,
				content: new Uint8Array(content),
				metadata: file.metadata,
			});
		} catch (error) {
			if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
				// a new file
				continue;
			}
			// Without the content of an existing file, the plugin would write
			// it from scratch. Let the plugin write all files as before.
			return undefined;
		}
	}
	return result;
}

/**
 * Writes an exported file.
 *
 * JSON is indented like the existing file, unless the plugin marked the file
 * as `verbatim`, i.e. it already kept the formatting of the existing file.
 * A file that didn't change is not written.
 */
async function writeExportedFile(args: {
	fs: typeof fs;
	path: string;
	file: ExportFile;
}): Promise<void> {
	let existing: Uint8Array | undefined;
	try {
		existing = new Uint8Array(await args.fs.readFile(args.path));
	} catch {
		// the file doesn't exist yet
		existing = undefined;
	}
	let content: Uint8Array = new Uint8Array(args.file.content);
	if (
		existing !== undefined &&
		args.file.verbatim !== true &&
		args.path.endsWith(".json")
	) {
		try {
			const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(
				existing
			);
			const bom = text.startsWith("\uFEFF") ? "\uFEFF" : "";
			const stringify = detectJsonFormatting(text.slice(bom.length));
			content = new TextEncoder().encode(
				bom + stringify(JSON.parse(new TextDecoder().decode(content)))
			);
		} catch {
			// not valid JSON, write the plugin's output as is
		}
	}
	if (existing !== undefined && bytesEqual(existing, content)) {
		return;
	}
	await args.fs.writeFile(args.path, content);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

/**
 * Saves a project to a directory.
 *
 * Writes all project files to disk and runs exporters to generate
 * resource files (e.g., JSON translation files).
 *
 * @example
 *   await saveProjectToDirectory({
 *     fs: await import("node:fs"),
 *     project,
 *     path: "./project.inlang",
 *   });
 */
export async function saveProjectToDirectory(args: {
	/**
	 * The file system module to use for writing files.
	 *
	 * Accepts either `node:fs` or `node:fs/promises`.
	 */
	fs: SaveProjectFs;
	/**
	 * The inlang project to save.
	 */
	project: InlangProject;
	/**
	 * The path to the inlang project directory. Must end with `.inlang`.
	 */
	path: string;
	/**
	 * If `true`, skips running exporters and only writes internal project files.
	 *
	 * Useful when you only want to update project metadata without
	 * regenerating resource files.
	 */
	skipExporting?: boolean;
}): Promise<void> {
	if (args.path.endsWith(".inlang") === false) {
		throw new Error("The path must end with .inlang");
	}
	if (!args.skipExporting) {
		await assertTranslationDataCanBeExported(args.project);
	}
	const fsModule = getPromisesFs(args.fs);

	const files = (
		await args.project.lix.execute("SELECT path, content FROM lix_file")
	).rows.map((row) => ({
		path: row.path as string,
		content: row.content as Uint8Array,
	}));

	const gitignoreContent = new TextEncoder().encode(
		"# IF GIT SHOWED THAT THIS FILE CHANGED\n#\n# 1. RUN THE FOLLOWING COMMAND\n#\n# ---\n# git rm --cached '**/*.inlang/.gitignore'\n# ---\n#\n# 2. COMMIT THE CHANGE\n#\n# ---\n# git commit -m \"fix: remove tracked .gitignore from inlang project\"\n# ---\n#\n# Inlang handles the gitignore itself starting with version ^2.5.\n#\n# everything is ignored except settings.json and Paraglide configuration\n*\n!settings.json\n!paraglide.config.js\n!paraglide.config.mjs\n!paraglide.config.ts\n!paraglide.config.cjs"
	);

	const existingMeta = await readProjectMeta({
		fs: fsModule,
		projectPath: args.path,
	});
	const highestSdkVersion =
		pickHighestVersion([
			existingMeta?.highestSdkVersion,
			ENV_VARIABLES.SDK_VERSION,
		]) ?? ENV_VARIABLES.SDK_VERSION;
	const shouldWriteMetadata = (() => {
		const comparison = compareSemver(
			highestSdkVersion,
			ENV_VARIABLES.SDK_VERSION
		);
		return comparison === null || comparison <= 0;
	})();
	const readmePath = path.join(args.path, "README.md");
	const gitignorePath = path.join(args.path, ".gitignore");
	const shouldWriteReadme =
		shouldWriteMetadata || !(await fileExists(fsModule, readmePath));
	const shouldWriteGitignore =
		shouldWriteMetadata || !(await fileExists(fsModule, gitignorePath));

	// write all files to the directory
	for (const file of files) {
		if (file.path === "/project_id") {
			continue;
		}
		const p = path.join(args.path, file.path);
		await fsModule.mkdir(path.dirname(p), { recursive: true });
		await fsModule.writeFile(p, new Uint8Array(file.content));
	}

	if (shouldWriteGitignore) {
		await fsModule.writeFile(gitignorePath, gitignoreContent);
	}

	if (shouldWriteReadme) {
		// Write README.md for coding agents
		await fsModule.writeFile(
			readmePath,
			new TextEncoder().encode(README_CONTENT)
		);
	}

	if (shouldWriteMetadata) {
		const metaContent = JSON.stringify({ highestSdkVersion }, null, 2);
		await fsModule.writeFile(
			path.join(args.path, ".meta.json"),
			new TextEncoder().encode(metaContent)
		);
	}

	if (args.skipExporting) {
		return;
	}

	// run exporters
	const plugins = await args.project.plugins.get();
	const settings = await args.project.settings.get();

	for (const plugin of plugins) {
		if (plugin.exportFiles) {
			const { bundles, messages, variants } = await selectPluginRows(
				args.project.db
			);
			// the files as they are on disk, so that the plugin can keep the
			// text of unchanged entries
			const existingFiles = await readExistingFiles({
				fs: fsModule,
				projectPath: args.path,
				plugin,
				settings,
			});
			const files = await plugin.exportFiles({
				bundles,
				messages,
				variants,
				settings,
				files: existingFiles,
			});
			for (const file of files) {
				const pathPattern = settings[plugin.key]?.pathPattern;

				const resolvePattern = (pattern: string) =>
					absolutePathFromProject(
						args.path,
						pattern.replace(/\{(languageTag|locale)\}/g, file.locale)
					);

				// pathPattern can be a string, an array of strings, or a record
				// mapping namespaces to patterns (e.g. plugin-i18next).
				// https://github.com/opral/inlang/issues/4356
				let targetPaths: string[];
				if (typeof file.metadata?.["pathPattern"] === "string") {
					targetPaths = [resolvePattern(file.metadata["pathPattern"])];
				} else if (typeof pathPattern === "string") {
					targetPaths = [resolvePattern(pathPattern)];
				} else if (Array.isArray(pathPattern)) {
					// an empty array writes nothing
					targetPaths = pathPattern.map(resolvePattern);
				} else if (typeof pathPattern === "object" && pathPattern !== null) {
					const namespace = file.metadata?.["namespace"];
					const namespacePattern = namespace
						? pathPattern[namespace]
						: undefined;
					// no pattern for this file (plugin didn't provide namespace
					// metadata or the namespace is unknown) -> fall back to file.name
					targetPaths =
						typeof namespacePattern === "string"
							? [resolvePattern(namespacePattern)]
							: [absolutePathFromProject(args.path, file.name)];
				} else {
					targetPaths = [absolutePathFromProject(args.path, file.name)];
				}

				for (const p of targetPaths) {
					await fsModule.mkdir(path.dirname(p), { recursive: true });
					await writeExportedFile({ fs: fsModule, path: p, file });
				}
			}
		}
		// old legacy remove with v3
		else if (plugin.saveMessages) {
			// in-efficient re-qeuery but it's a legacy function that will be removed.
			// the effort of adjusting the code to not re-query is not worth it.
			const bundlesNested = await selectBundleNested(args.project.db).execute();
			await plugin.saveMessages({
				messages: bundlesNested.map((b) => toMessageV1(b)),
				// @ts-expect-error - legacy
				nodeishFs: withAbsolutePaths(fsModule, args.path),
				settings,
			});
		}
	}
}
