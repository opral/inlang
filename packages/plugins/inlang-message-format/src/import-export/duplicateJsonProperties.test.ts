import { expect, test, vi } from "vitest";
import {
	loadProjectInMemory,
	newProject,
	type InlangPlugin,
} from "@inlang/sdk";
import { findDuplicateJsonProperties } from "@inlang/sdk/json-formatting";
import { plugin } from "../plugin.js";
import { PLUGIN_KEY } from "../pluginKey.js";
import { importFiles } from "./importFiles.js";

// Loading an SDK project includes WASM initialization, like the other project tests.
vi.setConfig({ testTimeout: 30_000 });

const source = String.raw`{
  "$schema": "https://example.com/first.json",
  "$schema": "https://example.com/last.json",
  "greeting": "first",
  "\u0067reeting": "second",
  "menu": {"title": "first title", "title": "last title"},
  "invite": [{
    "declarations": ["input count"],
    "selectors": ["count"],
    "match": {"count=*": "first match", "count=*": "last match"}
  }],
  "text": "Punctuation: [] , : \"quoted\" \\ backslash"
}`;

const file = (text: string) => ({
	locale: "en",
	content: new TextEncoder().encode(text),
});
const settings = { baseLocale: "en", locales: ["en"] };

test("default import keeps the last property value, including nested match objects", async () => {
	const imported = await importFiles({ files: [file(source)], settings });
	expect(
		imported.variants
			.filter((variant) => variant.messageBundleId !== "text")
			.map((variant) => [variant.messageBundleId, variant.pattern])
	).toEqual([
		["greeting", [{ type: "text", value: "second" }]],
		["menu.title", [{ type: "text", value: "last title" }]],
		["invite", [{ type: "text", value: "last match" }]],
	]);
	expect(imported).toEqual(
		await importFiles({
			files: [file(JSON.stringify(JSON.parse(source)))],
			settings,
		})
	);
});

test("an opt-in caller can report duplicates before import without changing its result", async () => {
	const files = [file(source)];
	const diagnostics = files.flatMap((input, fileIndex) =>
		findDuplicateJsonProperties(new TextDecoder().decode(input.content)).map(
			(diagnostic) => ({ fileIndex, ...diagnostic })
		)
	);
	expect(diagnostics.map(({ fileIndex, key }) => [fileIndex, key])).toEqual([
		[0, "$schema"],
		[0, "greeting"],
		[0, "title"],
		[0, "count=*"],
	]);
	// The original text still contains information that no post-import check can recover.
	expect(
		findDuplicateJsonProperties(JSON.stringify(JSON.parse(source)))
	).toEqual([]);
	const imported = await importFiles({ files, settings });
	expect(
		imported.variants.find((variant) => variant.messageBundleId === "greeting")
			?.pattern
	).toEqual([{ type: "text", value: "second" }]);
	expect(new TextDecoder().decode(files[0]!.content)).toBe(source);
});

test.each([false, true])(
	"SDK overlays still use the later file (diagnostics enabled: %s)",
	async (diagnose) => {
		const diagnostics: ReturnType<typeof findDuplicateJsonProperties> = [];
		const providedPlugin: InlangPlugin = {
			...plugin,
			importFiles: async (args) => {
				if (diagnose) {
					for (const input of args.files)
						diagnostics.push(
							...findDuplicateJsonProperties(
								new TextDecoder().decode(input.content)
							)
						);
				}
				return importFiles(args);
			},
		};
		const project = await loadProjectInMemory({
			blob: await newProject({ settings: { ...settings, modules: [] } }),
			providePlugins: [providedPlugin],
		});
		try {
			await project.importFiles({
				pluginKey: PLUGIN_KEY,
				files: [file('{"greeting":"first"}'), file('{"greeting":"second"}')],
			});
			expect(diagnostics).toEqual([]);
			const variants = await project.db
				.selectFrom("inlang_variant")
				.selectAll()
				.execute();
			expect(variants).toHaveLength(1);
			expect(variants[0]!.pattern).toEqual([{ type: "text", value: "second" }]);
		} finally {
			await project.close();
		}
	}
);

test.each([
	'{"greeting":"first","greeting":"second",}',
	'{"greeting":"first" // comment\n}',
])(
	"malformed input remains a SyntaxError with or without diagnostics: %s",
	async (text) => {
		await expect(
			importFiles({ files: [file(text)], settings })
		).rejects.toBeInstanceOf(SyntaxError);
		expect(() => findDuplicateJsonProperties(text)).toThrow(SyntaxError);
	}
);
