/* eslint-disable @typescript-eslint/no-explicit-any */
import { atom } from "jotai";
import { BundleRow, loadProjectInMemory, ProjectSettings } from "@inlang/sdk";
import { atomWithStorage } from "jotai/utils";
import { jsonObjectFrom } from "kysely/helpers/sqlite";
import { Change, isInSimulatedCurrentBranch } from "@inlang/sdk";
import hasMissingTranslations from "./helper/hasMissingTranslations.ts";
import getSortedBundles from "./helper/sortBundles.ts";
// @ts-expect-error - the plugin ships with no declaration file
import i18nextPlugin from "@inlang/plugin-i18next";
// @ts-expect-error - the plugin ships with no declaration file
import messageFormatPlugin from "@inlang/plugin-message-format";

export const selectedProjectPathAtom = atomWithStorage<string | undefined>(
	"selected-project-path",
	undefined
);

export const authorNameAtom = atomWithStorage<string | undefined>(
	"author-name",
	undefined
);

let safeProjectToOpfsInterval: NodeJS.Timeout;

/**
 * Force reload the project.
 *
 * Search for `setReloadProject` to see where this atom is set.
 */
export const forceReloadProjectAtom = atom<ReturnType<typeof Date.now> | undefined>(
	undefined
);

export const projectAtom = atom(async (get) => {
	// listen to forceReloadProjectAtom to reload the project
	// workaround for https://github.com/opral/lix/issues/47
	get(forceReloadProjectAtom);

	if (safeProjectToOpfsInterval) {
		clearInterval(safeProjectToOpfsInterval);
	}

	try {
		const path = get(selectedProjectPathAtom);
		if (!path) return undefined;
		const opfsRoot = await navigator.storage.getDirectory();
		const fileHandle = await opfsRoot.getFileHandle(path);
		const file = await fileHandle.getFile();
		const project = await loadProjectInMemory({
			blob: file,
			providePlugins: [i18nextPlugin, messageFormatPlugin],
		});
		safeProjectToOpfsInterval = setInterval(async () => {
			const writable = await fileHandle.createWritable();
			const file = await project.toBlob();
			await writable.write(file);
			await writable.close();
		}, 2000);

		//@ts-ignore
		window.lix = project.lix;

		return project;
	} catch (e) {
		console.error(e);
		return undefined;
	}
});

export const settingsAtom = atom(async (get) => {
	get(withPollingAtom);
	const project = await get(projectAtom);
	// assuming that the project is always defined when the settings are read
	if (!project) return undefined as unknown as ProjectSettings;
	return await project?.settings.get();
});

/**
 * Ugly ass workaround to get polled derived state.
 *
 * Search where the atom is set (likely in the layout/root component).
 */
export const withPollingAtom = atom(Date.now());

export const bundlesNestedAtom = atom(async (get) => {
	get(withPollingAtom);
	const project = await get(projectAtom);
	if (!project) return [];
	return await getSortedBundles(project);
});

export const filteredLocalesAtom = atom<string[]>([]);
export const searchQueryAtom = atom("");
export const filterMissingTranslationAtom = atom<boolean>(false);

export const bundlesNestedFilteredAtom = atom(async (get) => {
	const query = get(searchQueryAtom).toLowerCase();
	const settings = await get(settingsAtom);
	const filteredLocales = get(filteredLocalesAtom);
	const relevantLocales =
		filteredLocales.length > 0
			? [...filteredLocales, settings.baseLocale]
			: settings?.locales;
	let bundles = await get(bundlesNestedAtom);

	// Filter by missing translations if the flag is set
	if (get(filterMissingTranslationAtom)) {
		bundles = bundles.filter((bundle) => hasMissingTranslations(bundle, relevantLocales));
	}

	// Filter bundles by query, only considering relevant locales
	if (query !== "") {
		bundles = bundles.filter((bundle) => {
			return bundle.messages.some(
				(message) =>
					relevantLocales.includes(message.locale) &&
					JSON.stringify(message).toLowerCase().includes(query)
			);
		});
	}
	return bundles;
});

export const committedChangesAtom = atom(async (get) => {
	get(withPollingAtom);
	const project = await get(projectAtom);
	if (!project) return [];
	const result = await project.lix.db
		.selectFrom("change")
		.select((eb) => [
			"change.id",
			"change.commit_id",
			"change.file_id",
			"change.operation",
			"change.type",
			"change.value",
			jsonObjectFrom(
				eb
					.selectFrom("commit")
					.select([
						"commit.id",
						"commit.author",
						"commit.description",
						"commit.created_at",
					])
					.whereRef("change.commit_id", "=", "commit.id")
			).as("commit"),
		])
		.where("commit_id", "is not", null)
		// TODO remove after sequence concept on lix
		// https://linear.app/opral/issue/LIX-126/branching
		.where(isInSimulatedCurrentBranch)
		.innerJoin("commit", "commit.id", "change.commit_id")
		.orderBy("commit.created_at desc")
		.execute();

	return result;
});

export const pendingChangesAtom = atom(async (get) => {
	get(withPollingAtom);
	const project = await get(projectAtom);
	if (!project) return [];
	const result = await project.lix.db
		.selectFrom("change")
		.selectAll()
		.where("commit_id", "is", null)
		// TODO remove after sequence concept on lix
		// https://linear.app/opral/issue/LIX-126/branching
		.where(isInSimulatedCurrentBranch)
		.execute();
	return result;
});

export const groupedPendingChangesAtom = atom(async (get) => {
	// TODO: there is for sure a better way to do this, but it should unblock Fink2 diff ui
	get(withPollingAtom);
	const project = await get(projectAtom);
	if (!project) return [];
	const result = await project.lix.db
		.selectFrom("change")
		.selectAll()
		.where("commit_id", "is", null)
		// TODO remove after sequence concept on lix
		// https://linear.app/opral/issue/LIX-126/branching
		.where(isInSimulatedCurrentBranch)
		.execute();

	const latestChangesPerEntity: Change[] = [];

	for (const change of result) {
		const entityId = change.value?.id;
		if (!entityId) continue;

		const latestChange = await project.lix.db
			.selectFrom("change")
			.selectAll()
			.where("commit_id", "is", null)
			.where((eb) => eb.ref("value", "->>").key("id"), "=", entityId)
			.orderBy("created_at desc")
			.executeTakeFirst();

		if (
			latestChange &&
			!latestChangesPerEntity.some((change) => change.value?.id === entityId)
		) {
			latestChangesPerEntity.push(latestChange);
		}
	}

	return latestChangesPerEntity;
});

export const bundlesWithPendingChangesAtom = atom(async (get) => {
	const bundlesNested = await get(bundlesNestedAtom);
	const groupedPendingChanges = await get(groupedPendingChangesAtom);
	const hasPendingChange = (id: BundleRow["id"]) =>
		groupedPendingChanges.some((change) => change.value?.id === id);
	const bundleNestedWithChanges = bundlesNested.filter(
		(bundle) =>
			hasPendingChange(bundle.id) ||
			bundle.messages.some(
				(message) =>
					hasPendingChange(message.id) ||
					message.variants.some((variant) => hasPendingChange(variant.id))
			)
	);

	return bundleNestedWithChanges;
});

export const unresolvedConflictsAtom = atom(async (get) => {
	get(withPollingAtom);
	const project = await get(projectAtom);
	if (!project) return [];
	const result = await project.lix.db
		.selectFrom("conflict")
		.where("resolved_with_change_id", "is", null)
		.selectAll()
		.execute();

	//console.log(result);
	return result;
});

/**
 * Get all conflicting changes.
 *
 * @example
 *   const [conflictingChanges] = useAtom(conflictingChangesAtom);
 *   conflictingChanges.find((change) => change.id === id);
 */
export const conflictingChangesAtom = atom(async (get) => {
	get(withPollingAtom);
	const project = await get(projectAtom);
	const unresolvedConflicts = await get(unresolvedConflictsAtom);
	if (!project) return [];
	const result: Set<Change> = new Set();

	for (const conflict of unresolvedConflicts) {
		const change = await project.lix.db
			.selectFrom("change")
			.selectAll()
			.where("id", "=", conflict.change_id)
			.executeTakeFirstOrThrow();
		const conflicting = await project.lix.db
			.selectFrom("change")
			.selectAll()
			.where("id", "=", conflict.conflicting_change_id)
			.executeTakeFirstOrThrow();
		result.add(change);
		result.add(conflicting);
	}
	return [...result];
});

export const commitsAtom = atom(async (get) => {
	get(withPollingAtom);
	const project = await get(projectAtom);
	if (!project) return [];
	return await project.lix.db
		.selectFrom("commit")
		.selectAll()
		.orderBy("commit.created_at desc")
		.execute();
});

//@ts-ignore
const humanFileSize = (bytes, si = false, dp = 1) => {
	const thresh = si ? 1000 : 1024;

	if (Math.abs(bytes) < thresh) {
		return bytes + " B";
	}

	const units = si
		? ["kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"]
		: ["KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];
	let u = -1;
	const r = 10 ** dp;

	do {
		bytes /= thresh;
		++u;
	} while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);

	return bytes.toFixed(dp) + " " + units[u];
};

//@ts-ignore
const getDirectoryEntriesRecursive = async (relativePath = ".") => {
	// @ts-ignore
	const directoryHandle = await navigator.storage.getDirectory();
	const fileHandles = [];
	const directoryHandles = [];

	// Get an iterator of the files and folders in the directory.
	// @ts-ignore
	const directoryIterator = directoryHandle.values();
	const directoryEntryPromises = [];
	for await (const handle of directoryIterator) {
		const nestedPath = `${relativePath}/${handle.name}`;
		if (handle.kind === "file") {
			// @ts-ignore
			fileHandles.push({ handle, nestedPath });
			directoryEntryPromises.push(
				// @ts-ignore
				handle.getFile().then((file) => {
					return {
						name: handle.name,
						file,
						size: humanFileSize(file.size),
						relativePath: nestedPath,
						handle,
					};
				})
			);
		} else if (handle.kind === "directory") {
			// @ts-ignore
			directoryHandles.push({ handle, nestedPath });
			directoryEntryPromises.push(
				// @ts-ignore
				(async () => {
					return {
						name: handle.name,
						// @ts-ignore
						file,
						// @ts-ignore
						size: humanFileSize(file.size),
						relativePath: nestedPath,
						// @ts-ignore
						entries: await getDirectoryEntriesRecursive(handle, nestedPath),
						handle,
					};
				})()
			);
		}
	}
	return await Promise.all(directoryEntryPromises);
};

//@ts-ignore
window.databases = await getDirectoryEntriesRecursive();

//@ts-ignore
window.deleteAll = async () => {
	clearInterval(safeProjectToOpfsInterval);
	const databases = await getDirectoryEntriesRecursive();
	for (const database of databases) {
		await database.handle.remove();
	}
};
