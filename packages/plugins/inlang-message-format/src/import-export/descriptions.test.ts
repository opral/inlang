import { expect, test } from "vitest";
import { plugin } from "../plugin.js";
const settings = { baseLocale: "en", locales: ["en", "de"], modules: [] };
const sdkCapabilities = ["bundle-description"];
const encode = (value: unknown) =>
	new TextEncoder().encode(JSON.stringify(value));
const parse = (content: Uint8Array) =>
	JSON.parse(new TextDecoder().decode(content));

test("legacy nested collision shapes preserve guidance without creating a description message", async () => {
	const files = [
		{
			locale: "en",
			path: "en.json",
			imported: true,
			content: encode({
				save: {
					"0": {
						declarations: [],
						selectors: [],
						description: "Button guidance",
						match: { "*": "Save" },
					},
					child: "Child",
				},
			}),
		},
	];
	for (const capabilities of [sdkCapabilities, undefined]) {
		const imported = await plugin.importFiles!({
			settings,
			sdkCapabilities: capabilities,
			files,
		});
		expect(imported.bundles.map((bundle) => bundle.id)).toEqual([
			"save",
			"save.child",
		]);
		if (capabilities)
			expect(imported.bundles[0]?.description).toBe("Button guidance");
		const rows = concrete(imported);
		rows.variants.find(
			(variant) =>
				variant.messageId ===
				rows.messages.find((message) => message.bundleId === "save")!.id
		)!.pattern = [{ type: "text", value: "Store" }];
		const exported = await plugin.exportFiles!({
			settings,
			sdkCapabilities: capabilities,
			files,
			...rows,
		});
		const reopened = await plugin.importFiles!({
			settings,
			sdkCapabilities,
			files: exported,
		});
		expect(reopened.bundles.map((bundle) => bundle.id)).toEqual([
			"save",
			"save.child",
		]);
		expect(reopened.bundles[0]?.description).toBe("Button guidance");
	}
});

test("shared description uses source locale independent of file ordering and edits/clears without text edits", async () => {
	const files = [
		{
			locale: "de",
			content: encode({ save: "Speichern" }),
			path: "de.json",
			imported: true,
		},
		{
			locale: "en",
			content: encode({
				save: [{ description: "Button guidance", match: { "*": "Save" } }],
			}),
			path: "en.json",
			imported: true,
		},
	];
	for (const ordered of [files, [...files].reverse()]) {
		const imported = await plugin.importFiles!({
			files: ordered,
			settings,
			sdkCapabilities,
		});
		expect(imported.bundles[0]?.description).toBe("Button guidance");
		const rows = concrete(imported);
		rows.bundles[0]!.description = "New guidance";
		const exported = await plugin.exportFiles!({
			...rows,
			settings,
			sdkCapabilities,
			files,
		});
		expect(
			parse(exported.find((f) => f.locale === "en")!.content).save[0]
				.description
		).toBe("New guidance");
		expect(parse(exported.find((f) => f.locale === "de")!.content).save).toBe(
			"Speichern"
		);
		const reopened = await plugin.importFiles!({
			files: exported,
			settings,
			sdkCapabilities,
		});
		expect(reopened.bundles[0]?.description).toBe("New guidance");
		rows.bundles[0]!.description = null;
		const cleared = await plugin.exportFiles!({
			...rows,
			settings,
			sdkCapabilities,
			files: exported.map((f) => ({ ...f, path: f.name, imported: true })),
		});
		expect(parse(cleared.find((f) => f.locale === "en")!.content).save).toBe(
			"Save"
		);
		expect(
			(await plugin.importFiles!({ files: cleared, settings, sdkCapabilities }))
				.bundles[0]?.description
		).toBe(null);
	}
});

test("adding a description promotes only the source plain string", async () => {
	const imported = await plugin.importFiles!({
		settings,
		sdkCapabilities,
		files: [
			{ locale: "en", content: encode({ save: "Save" }) },
			{ locale: "de", content: encode({ save: "Speichern" }) },
		],
	});
	imported.bundles[0]!.description = "Button guidance";
	const exported = await plugin.exportFiles!({
		...concrete(imported),
		settings,
		sdkCapabilities,
	});
	expect(
		parse(exported.find((f) => f.locale === "en")!.content).save[0]
	).toMatchObject({ description: "Button guidance", match: { "": "Save" } });
	expect(parse(exported.find((f) => f.locale === "de")!.content).save).toBe(
		"Speichern"
	);
});

test("conflicting source entry descriptions are rejected; old hosts and target imports omit patches", async () => {
	await expect(
		plugin.importFiles!({
			settings,
			sdkCapabilities,
			files: [
				{
					locale: "en",
					content: encode({
						save: [
							{ description: "First", match: { "*": "Save" } },
							{ description: "Second", match: { "*": "Save" } },
						],
					}),
				},
			],
		})
	).rejects.toThrow("Conflicting descriptions");
	const target = await plugin.importFiles!({
		settings,
		sdkCapabilities,
		files: [
			{
				locale: "de",
				content: encode({
					save: [{ description: "Target note", match: { "*": "Speichern" } }],
				}),
			},
		],
	});
	expect(target.bundles[0]).not.toHaveProperty("description");
	const legacy = await plugin.importFiles!({
		settings,
		files: [
			{
				locale: "en",
				content: encode({
					save: [{ description: "Guidance", match: { "*": "Save" } }],
				}),
			},
		],
	});
	expect(legacy.bundles[0]).not.toHaveProperty("description");
});

function concrete(
	imported: Awaited<ReturnType<NonNullable<typeof plugin.importFiles>>>
) {
	const messages = imported.messages.map((message, index) => ({
		...message,
		id: `m${index}`,
		selectors: message.selectors ?? [],
	}));
	return {
		bundles: imported.bundles.map((bundle) => ({
			...bundle,
			id: bundle.id!,
			declarations: bundle.declarations ?? [],
		})),
		messages,
		variants: imported.variants.map((variant, index) => ({
			...variant,
			id: `v${index}`,
			matches: variant.matches ?? [],
			pattern: variant.pattern ?? [],
			messageId: messages.find(
				(m) =>
					m.bundleId === variant.messageBundleId &&
					m.locale === variant.messageLocale
			)!.id,
		})),
	};
}

test("target descriptions remain document metadata when the target translation is edited", async () => {
	const files = [
		{
			locale: "en",
			content: encode({ save: "Save" }),
			path: "en.json",
			imported: true,
		},
		{
			locale: "de",
			content: encode({
				save: [{ description: "Target note", match: { "*": "Speichern" } }],
			}),
			path: "de.json",
			imported: true,
		},
	];
	const imported = await plugin.importFiles!({
		settings,
		sdkCapabilities,
		files,
	});
	expect(imported.bundles[0]?.description).toBe(null);
	const rows = concrete(imported);
	rows.variants.find(
		(variant) =>
			variant.messageId ===
			rows.messages.find((message) => message.locale === "de")!.id
	)!.pattern = [{ type: "text", value: "Sichern" }];
	const exported = await plugin.exportFiles!({
		settings,
		sdkCapabilities,
		files,
		...rows,
	});
	expect(
		parse(exported.find((file) => file.locale === "de")!.content).save[0]
	).toMatchObject({ description: "Target note", match: { "": "Sichern" } });
});

test("old hosts preserve source descriptions as file metadata while editing text", async () => {
	const files = [
		{
			locale: "en",
			path: "en.json",
			imported: true,
			content: encode({
				save: [{ description: "Keep guidance", match: { "*": "Save" } }],
			}),
		},
	];
	const imported = await plugin.importFiles!({ settings, files });
	expect(imported.bundles[0]).not.toHaveProperty("description");
	const rows = concrete(imported);
	rows.variants[0]!.pattern = [{ type: "text", value: "Store" }];
	const exported = await plugin.exportFiles!({ settings, files, ...rows });
	expect(parse(exported[0]!.content).save[0]).toMatchObject({
		description: "Keep guidance",
		match: { "": "Store" },
	});
});
