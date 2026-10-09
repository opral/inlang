import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import * as publishedSdk from "published-sdk";
import * as currentSdk from "@inlang/sdk";

/**
 * Two worlds: the SDK and plugins on npm today ("published"), and the ones in
 * this repository ("current"), i.e. the next release.
 */
export type Version = "published" | "current";

export const sdks = {
	published: publishedSdk,
	current: currentSdk,
} as const;

/**
 * The storage plugins, with the module URL projects put into
 * `settings.modules`. The URLs use a major range, so projects on the
 * published SDK load the next plugin release as soon as it is on npm.
 */
export const plugins = {
	"plugin.inlang.messageFormat": {
		package: "plugin-message-format",
		url: "https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format@4/dist/index.js",
	},
	"plugin.inlang.i18next": {
		package: "plugin-i18next",
		url: "https://cdn.jsdelivr.net/npm/@inlang/plugin-i18next@6/dist/index.js",
	},
	"plugin.inlang.icu-messageformat-1": {
		package: "plugin-icu1",
		url: "https://cdn.jsdelivr.net/npm/@inlang/plugin-icu1@1/dist/index.js",
	},
	"plugin.inlang.json": {
		package: "plugin-json",
		url: "https://cdn.jsdelivr.net/npm/@inlang/plugin-json@5/dist/index.js",
	},
	"plugin.inlang.nextIntl": {
		package: "plugin-next-intl",
		url: "https://cdn.jsdelivr.net/npm/@inlang/plugin-next-intl@2/dist/index.js",
	},
	"plugin.inlang.android": {
		package: "plugin-android",
		url: "https://cdn.jsdelivr.net/npm/@inlang/plugin-android@0/dist/index.js",
	},
	"plugin.inlang.apple-strings": {
		package: "plugin-apple-strings",
		url: "https://cdn.jsdelivr.net/npm/@inlang/plugin-apple-strings@0/dist/index.js",
	},
	"plugin.inlang.apple-xcstrings": {
		package: "plugin-apple-xcstrings",
		url: "https://cdn.jsdelivr.net/npm/@inlang/plugin-apple-xcstrings@0/dist/index.js",
	},
	"plugin.inlang.mFunctionMatcher": {
		package: "plugin-m-function-matcher",
		url: "https://cdn.jsdelivr.net/npm/@inlang/plugin-m-function-matcher@2/dist/index.js",
	},
} as const;

export type PluginKey = keyof typeof plugins;

const require = createRequire(import.meta.url);

/**
 * The bundled plugin module, exactly the file that jsdelivr serves.
 */
export function pluginSource(key: PluginKey, version: Version): string {
	const name = plugins[key].package;
	const specifier =
		version === "published" ? `published-${name}` : `@inlang/${name}`;
	return readFileSync(require.resolve(specifier), "utf8");
}

let servedPlugins: Version = "published";

/**
 * Serves `settings.modules` URLs from the local packages instead of the CDN:
 * the published plugin or the one in this repository. Both SDKs load
 * modules with the global `fetch`.
 */
export function servePlugins(version: Version): void {
	servedPlugins = version;
}

/** `<version> <url>` of every module request, to assert what was served. */
export const fetchedModules: string[] = [];

globalThis.fetch = (async (input: string | URL | Request) => {
	const url =
		typeof input === "string"
			? input
			: input instanceof URL
				? input.href
				: input.url;
	const entry = Object.entries(plugins).find(
		([, plugin]) => plugin.url === url
	);
	if (entry === undefined) {
		throw new Error(`Unexpected network request in compat tests: ${url}`);
	}
	const response = new Response(
		pluginSource(entry[0] as PluginKey, servedPlugins),
		{ headers: { "content-type": "text/javascript" } }
	);
	// only after the source was read: a failed read makes the SDK fall back
	// to its plugin cache, which may hold another version
	fetchedModules.push(`${servedPlugins} ${url}`);
	return response;
}) as typeof fetch;

/**
 * Imports a plugin module the way the SDK does for `settings.modules`.
 */
export async function importPlugin(key: PluginKey, version: Version) {
	const source = pluginSource(key, version);
	const url =
		"data:text/javascript;base64," + Buffer.from(source).toString("base64");
	const module = await import(/* @vite-ignore */ url);
	return module.default;
}

/** Rows as plugins see them: camelCase `bundleId` and `messageId`. */
export type Rows = {
	bundles: Array<{ id: string; declarations: unknown[] }>;
	messages: Array<{
		id: string;
		bundleId: string;
		locale: string;
		selectors: unknown[];
	}>;
	variants: Array<{
		id: string;
		messageId: string;
		matches: unknown[];
		pattern: unknown[];
	}>;
};

type AnyProject = {
	db: any;
	importFiles: (args: {
		pluginKey: string;
		files: Array<{ locale: string; content: Uint8Array }>;
	}) => Promise<void>;
	exportFiles: (args: {
		pluginKey: string;
	}) => Promise<Array<{ locale: string; name: string; content: Uint8Array }>>;
	toBlob: () => Promise<Blob>;
	close: () => Promise<void>;
	settings: { get: () => Promise<any>; set: (settings: any) => Promise<void> };
	plugins: { get: () => Promise<readonly any[]> };
	errors: { get: () => Promise<readonly Error[]> };
	lix: any;
};

export type Project = AnyProject & { version: Version };

/**
 * Reads all rows through the public query API of either SDK.
 *
 * The published SDK names the tables `bundle`, `message` and `variant` with
 * `bundleId` / `messageId`; the current SDK uses the canonical
 * `inlang_bundle`, `inlang_message`, `inlang_variant` with `bundle_id` /
 * `message_id`. Both map to the same Lix entities.
 */
export async function selectRows(project: Project): Promise<Rows> {
	if (project.version === "published") {
		const [bundles, messages, variants] = await Promise.all([
			project.db.selectFrom("bundle").selectAll().execute(),
			project.db.selectFrom("message").selectAll().execute(),
			project.db.selectFrom("variant").selectAll().execute(),
		]);
		return {
			bundles: bundles.map((b: any) => ({
				id: b.id,
				declarations: b.declarations,
			})),
			messages: messages.map((m: any) => ({
				id: m.id,
				bundleId: m.bundleId,
				locale: m.locale,
				selectors: m.selectors,
			})),
			variants: variants.map((v: any) => ({
				id: v.id,
				messageId: v.messageId,
				matches: v.matches,
				pattern: v.pattern,
			})),
		};
	}
	const [bundles, messages, variants] = await Promise.all([
		project.db.selectFrom("inlang_bundle").selectAll().execute(),
		project.db.selectFrom("inlang_message").selectAll().execute(),
		project.db.selectFrom("inlang_variant").selectAll().execute(),
	]);
	return {
		bundles: bundles.map((b: any) => ({
			id: b.id,
			declarations: b.declarations,
		})),
		messages: messages.map((m: any) => ({
			id: m.id,
			bundleId: m.bundle_id,
			locale: m.locale,
			selectors: m.selectors,
		})),
		variants: variants.map((v: any) => ({
			id: v.id,
			messageId: v.message_id,
			matches: v.matches,
			pattern: v.pattern,
		})),
	};
}

/**
 * Table and column names of the query API of either SDK.
 */
export function tables(version: Version) {
	return version === "published"
		? {
				bundle: "bundle",
				message: "message",
				variant: "variant",
				bundleId: "bundleId",
				messageId: "messageId",
			}
		: {
				bundle: "inlang_bundle",
				message: "inlang_message",
				variant: "inlang_variant",
				bundleId: "bundle_id",
				messageId: "message_id",
			};
}

/**
 * Inserts rows with the query API of either SDK, the way editors such as
 * Fink and Parrot write: row by row, with ids they generate.
 */
export async function insertRows(project: Project, rows: Rows): Promise<void> {
	const names = tables(project.version);
	for (const bundle of rows.bundles) {
		await project.db
			.insertInto(names.bundle)
			.values({ id: bundle.id, declarations: bundle.declarations })
			.execute();
	}
	for (const message of rows.messages) {
		await project.db
			.insertInto(names.message)
			.values({
				id: message.id,
				[names.bundleId]: message.bundleId,
				locale: message.locale,
				selectors: message.selectors,
			})
			.execute();
	}
	for (const variant of rows.variants) {
		await project.db
			.insertInto(names.variant)
			.values({
				id: variant.id,
				[names.messageId]: variant.messageId,
				matches: variant.matches,
				pattern: variant.pattern,
			})
			.execute();
	}
}

/**
 * Rows in a canonical order, to compare the content of two projects
 * independent of the order a query returns.
 */
export function sortRows(rows: Rows): Rows {
	const byId = (a: { id: string }, b: { id: string }) =>
		a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
	return {
		bundles: [...rows.bundles].sort(byId),
		messages: [...rows.messages].sort(byId),
		variants: [...rows.variants].sort(byId),
	};
}

/**
 * Content of a project without the ids of messages and variants, which
 * importers generate. Messages are keyed by bundle and locale, variants by
 * their message and matches.
 */
export function contentOf(rows: Rows) {
	const messageKey = new Map(
		rows.messages.map((m) => [m.id, `${m.bundleId}/${m.locale}`])
	);
	return {
		bundles: [...rows.bundles]
			.map((b) => ({ id: b.id, declarations: b.declarations }))
			.sort((a, b) => a.id.localeCompare(b.id)),
		messages: rows.messages
			.map((m) => ({
				key: `${m.bundleId}/${m.locale}`,
				selectors: m.selectors,
			}))
			.sort((a, b) => a.key.localeCompare(b.key)),
		variants: rows.variants
			.map((v) => ({
				message: messageKey.get(v.messageId),
				matches: v.matches,
				pattern: v.pattern,
			}))
			.sort((a, b) =>
				`${a.message}${JSON.stringify(a.matches)}`.localeCompare(
					`${b.message}${JSON.stringify(b.matches)}`
				)
			),
	};
}

export async function loadFromBlob(
	version: Version,
	blob: Blob,
	providePlugins?: unknown[]
): Promise<Project> {
	const project = await (sdks[version].loadProjectInMemory as any)({
		blob,
		providePlugins,
	});
	return Object.assign(project, { version }) as Project;
}

export async function newProjectBlob(
	version: Version,
	settings: Record<string, unknown>
): Promise<Blob> {
	return (sdks[version].newProject as any)({ settings });
}

export async function loadFromDirectory(
	version: Version,
	args: { path: string; fs: unknown; providePlugins?: unknown[] }
): Promise<Project> {
	const project = await (sdks[version].loadProjectFromDirectory as any)(args);
	return Object.assign(project, { version }) as Project;
}

export async function saveToDirectory(
	version: Version,
	args: { path: string; fs: unknown; project: Project }
): Promise<void> {
	await (sdks[version].saveProjectToDirectory as any)(args);
}

export const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
export const encode = (text: string) => new TextEncoder().encode(text);
