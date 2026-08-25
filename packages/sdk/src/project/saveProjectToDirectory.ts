import type nodeFs from "node:fs";
import type fs from "node:fs/promises";
import type { InlangProject } from "./api.js";
import path from "node:path";
import { toMessageV1 } from "../json-schema/old-v1-message/toMessageV1.js";
import { absolutePathFromProject, withAbsolutePaths } from "./path-helpers.js";
import { detectJsonFormatting } from "../utilities/detectJsonFormatting.js";
import { selectBundleNested } from "../query-utilities/selectBundleNested.js";
import { README_CONTENT } from "./README_CONTENT.js";
import { ENV_VARIABLES } from "../services/env-variables/index.js";
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
		project.db.selectFrom("bundle").select("id").limit(1).executeTakeFirst(),
		project.db.selectFrom("message").select("id").limit(1).executeTakeFirst(),
		project.db.selectFrom("variant").select("id").limit(1).executeTakeFirst(),
	]);
	if (bundle || message || variant) {
		throw new Error(
			"saveProjectToDirectory cannot write bundles, messages, or variants without an import/export plugin. Add a plugin to settings.modules/providePlugins, or save the canonical .inlang file with project.toBlob()."
		);
	}
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
		path: row.get("path") as string,
		content: row.value("content").asBytes()!,
	}));

	const gitignoreContent = new TextEncoder().encode(
		"# IF GIT SHOWED THAT THIS FILE CHANGED\n#\n# 1. RUN THE FOLLOWING COMMAND\n#\n# ---\n# git rm --cached '**/*.inlang/.gitignore'\n# ---\n#\n# 2. COMMIT THE CHANGE\n#\n# ---\n# git commit -m \"fix: remove tracked .gitignore from inlang project\"\n# ---\n#\n# Inlang handles the gitignore itself starting with version ^2.5.\n#\n# everything is ignored except settings.json\n*\n!settings.json"
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
			const bundles = await args.project.db
				.selectFrom("bundle")
				.selectAll()
				.execute();
			const messages = await args.project.db
				.selectFrom("message")
				.selectAll()
				.execute();
			const variants = await args.project.db
				.selectFrom("variant")
				.selectAll()
				.execute();
			const files = await plugin.exportFiles({
				bundles,
				messages,
				variants,
				settings,
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
					if (p.endsWith(".json")) {
						try {
							const existing = await fsModule.readFile(p, "utf-8");
							const stringify = detectJsonFormatting(existing);
							await fsModule.writeFile(
								p,
								new TextEncoder().encode(
									stringify(JSON.parse(new TextDecoder().decode(file.content)))
								)
							);
						} catch {
							// write the file to disk (json doesn't exist yet)
							// yeah ugly duplication of write file but it works.
							await fsModule.writeFile(p, new Uint8Array(file.content));
						}
					} else {
						await fsModule.writeFile(p, new Uint8Array(file.content));
					}
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
