import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	type PluginKey,
	type Project,
	type Version,
	decode,
	importPlugin,
	loadFromBlob,
	newProjectBlob,
} from "./harness.js";

export const fixturesDir = fileURLToPath(
	new URL("../fixtures", import.meta.url)
);

export type Fixture = {
	key: PluginKey;
	/** directory under `fixtures/` */
	dir: string;
	locales: string[];
	pluginSettings: Record<string, unknown>;
	/** source files under `fixtures/<dir>/source`, by locale */
	files: Array<{ locale: string; path: string }>;
	/**
	 * Bundles of `editorSpecs` that editors could have added to a project
	 * using this plugin, i.e. the ones the published plugin can export.
	 */
	editorBundles: string[];
};

export const fixtures: Fixture[] = [
	{
		key: "plugin.inlang.messageFormat",
		dir: "message-format",
		editorBundles: [
			"greeting",
			"items_count",
			"invite",
			"pronoun",
			"rich_text",
			"escapes",
			"nav.home.title",
		],
		locales: ["en", "de", "fr"],
		pluginSettings: { pathPattern: "./messages/{locale}.json" },
		files: [
			{ locale: "en", path: "en.json" },
			{ locale: "de", path: "de.json" },
			{ locale: "fr", path: "fr.json" },
		],
	},
	{
		key: "plugin.inlang.i18next",
		dir: "i18next",
		editorBundles: [
			"greeting",
			"items_count",
			"rich_text",
			"escapes",
			"nav.home.title",
		],
		locales: ["en", "de", "lv"],
		pluginSettings: { pathPattern: "./locales/{locale}.json" },
		files: [
			{ locale: "en", path: "en.json" },
			{ locale: "de", path: "de.json" },
			{ locale: "lv", path: "lv.json" },
		],
	},
	{
		key: "plugin.inlang.icu-messageformat-1",
		dir: "icu1",
		editorBundles: [
			"greeting",
			"items_count",
			"invite",
			"cart",
			"pronoun",
			"escapes",
			"nav.home.title",
		],
		locales: ["en", "de", "fr"],
		pluginSettings: { pathPattern: "./messages/{locale}.json" },
		files: [
			{ locale: "en", path: "en.json" },
			{ locale: "de", path: "de.json" },
			{ locale: "fr", path: "fr.json" },
		],
	},
	{
		key: "plugin.inlang.json",
		dir: "json",
		editorBundles: ["greeting", "escapes", "nav.home.title"],
		locales: ["en", "de"],
		pluginSettings: { pathPattern: "./messages/{locale}.json" },
		files: [
			{ locale: "en", path: "en.json" },
			{ locale: "de", path: "de.json" },
		],
	},
	{
		key: "plugin.inlang.nextIntl",
		dir: "next-intl",
		editorBundles: [
			"greeting",
			"items_count",
			"invite",
			"cart",
			"pronoun",
			"escapes",
			"nav.home.title",
		],
		locales: ["en", "de"],
		pluginSettings: { pathPattern: "./messages/{locale}.json" },
		files: [
			{ locale: "en", path: "en.json" },
			{ locale: "de", path: "de.json" },
		],
	},
	{
		key: "plugin.inlang.android",
		dir: "android",
		editorBundles: ["greeting", "items_count", "escapes", "nav.home.title"],
		locales: ["en", "de"],
		pluginSettings: { pathPattern: "./res/values{locale}/strings.xml" },
		files: [
			{ locale: "en", path: "values/strings.xml" },
			{ locale: "de", path: "values-de/strings.xml" },
		],
	},
	{
		key: "plugin.inlang.apple-strings",
		dir: "apple-strings",
		editorBundles: ["greeting", "escapes", "nav.home.title"],
		locales: ["en", "de"],
		pluginSettings: { pathPattern: "./{locale}.lproj/Localizable.strings" },
		files: [
			{ locale: "en", path: "en.lproj/Localizable.strings" },
			{ locale: "de", path: "de.lproj/Localizable.strings" },
		],
	},
	{
		key: "plugin.inlang.apple-xcstrings",
		dir: "apple-xcstrings",
		editorBundles: ["greeting", "items_count", "escapes", "nav.home.title"],
		locales: ["en", "de"],
		pluginSettings: { pathPattern: "./Localizable.xcstrings" },
		files: [{ locale: "en", path: "Localizable.xcstrings" }],
	},
];

export function readSourceFiles(fixture: Fixture) {
	return fixture.files.map((file) => ({
		locale: file.locale,
		content: new Uint8Array(
			fs.readFileSync(path.join(fixturesDir, fixture.dir, "source", file.path))
		),
	}));
}

export function settingsFor(fixture: Fixture) {
	return {
		baseLocale: "en",
		locales: fixture.locales,
		modules: [] as string[],
		[fixture.key]: fixture.pluginSettings,
	};
}

/**
 * The SDK / plugin combinations that write files after the release:
 *
 * - current SDK + current plugin: apps and CLIs that upgrade
 * - published SDK + current plugin: every project on the published SDK, which
 *   loads the new plugin release from `settings.modules` (major range URL)
 */
export const upgrades: Array<{ sdk: Version; plugin: Version }> = [
	{ sdk: "current", plugin: "current" },
	{ sdk: "published", plugin: "current" },
];

/**
 * A project of `fixture` on an SDK with a plugin version, new or from `blob`.
 */
export async function openFixtureProject(
	fixture: Fixture,
	sdk: Version,
	plugin: Version,
	blob?: Blob
): Promise<Project> {
	return loadFromBlob(
		sdk,
		blob ?? (await newProjectBlob(sdk, settingsFor(fixture))),
		[await importPlugin(fixture.key, plugin)]
	);
}

export type Files = Array<{ locale: string; name: string; content: string }>;

/** The exported files, in a stable order. File contents are not touched. */
export async function exportFixtureFiles(
	project: Project,
	fixture: Fixture
): Promise<Files> {
	const files = await project.exportFiles({ pluginKey: fixture.key });
	return files
		.map((file) => ({
			locale: file.locale,
			name: file.name,
			content: decode(file.content),
		}))
		.sort((a, b) =>
			`${a.name}${a.locale}`.localeCompare(`${b.name}${b.locale}`)
		);
}

/**
 * `files` with the variants of some messages in another order, given as
 * `{ "<bundle>/<locale>": [match keys in the new order] }`. Everything else
 * keeps its bytes (the files are written with `JSON.stringify(…, "\t")`).
 *
 * Only for messages that runtimes reading variants in file order (Paraglide
 * JS 2.26) display wrong: a variant after the catch-all can never be
 * selected. The function checks that the message had one.
 */
export function withVariantOrder(
	files: Files,
	orders: Record<string, string[]>
): Files {
	const used = new Set<string>();
	const result = files.map((file) => {
		const keys = Object.keys(orders).filter((key) =>
			key.endsWith(`/${file.locale}`)
		);
		if (keys.length === 0) return file;
		const json = JSON.parse(file.content);
		let changed = false;
		for (const [key, order] of Object.entries(orders)) {
			const [bundle, locale] = key.split("/") as [string, string];
			if (locale !== file.locale) continue;
			const match = json[bundle][0].match as Record<string, string>;
			const keys = Object.keys(match);
			const catchAll = keys.findIndex((k) =>
				k.split(", ").every((part) => part.endsWith("=*"))
			);
			if (catchAll === -1 || catchAll === keys.length - 1) {
				throw new Error(`${key}: every variant can be selected already`);
			}
			if ([...order].sort().join() !== [...keys].sort().join()) {
				throw new Error(`${key}: the order must have the keys ${keys}`);
			}
			json[bundle][0].match = Object.fromEntries(
				order.map((k) => [k, match[k]])
			);
			used.add(key);
			changed = true;
		}
		return changed
			? { ...file, content: JSON.stringify(json, undefined, "\t") }
			: file;
	});
	const unused = Object.keys(orders).filter((key) => !used.has(key));
	if (unused.length > 0) throw new Error(`No message ${unused}`);
	return result;
}
