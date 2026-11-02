import { expect, test } from "vitest";
import i18next from "i18next";
import { type Rows, decode, encode, selectRows, tables } from "./harness.js";
import { fixtures, openFixtureProject as open, upgrades } from "./fixtures.js";

const fixture = fixtures.find((fixture) => fixture.dir === "i18next")!;

// Evaluate this importer's count/plural subset independently of its suffix
// parser and exporter. The fixture uses only text and count interpolation.
function render(rows: Rows, locale: string, count: number) {
	const message = rows.messages.find(
		(message) => message.bundleId === "item" && message.locale === locale
	)!;
	const variables: Record<string, string | number> = {
		count,
		countPlural: new Intl.PluralRules(locale).select(count),
	};
	const variant = rows.variants.find(
		(variant) =>
			variant.messageId === message.id &&
			variant.matches.every(
				(match: any) =>
					match.type === "catchall-match" ||
					String(variables[match.key]) === match.value
			)
	)!;
	return variant.pattern
		.map((part: any) => {
			if (part.type === "text") return part.value;
			if (part.type === "expression" && part.arg.type === "variable-reference")
				return String(variables[part.arg.name]);
			throw new Error("Unsupported fixture pattern");
		})
		.join("");
}

for (const { sdk, plugin } of upgrades) {
	test.each(["en", "de", "lv"])(
		`${sdk} SDK with ${plugin} plugin: one zero source in %s keeps runtime meaning and can be edited and deleted once`,
		async (locale) => {
			const resource = {
				item_zero: "Zero: {{count}}",
				item_one: "One: {{count}}",
				item_other: "Other: {{count}}",
			};
			const source = [{ locale, content: encode(JSON.stringify(resource)) }];
			const published = await open(fixture, "published", "published");
			const current = await open(fixture, sdk, plugin);
			try {
				await published.importFiles({ pluginKey: fixture.key, files: source });
				// Prove exactly what changed from the published importer: one
				// source entry no longer creates two independently editable rows.
				expect((await selectRows(published)).variants).toHaveLength(4);
				await current.importFiles({ pluginKey: fixture.key, files: source });
				let rows = await selectRows(current);
				expect(rows.variants).toHaveLength(3);
				const zero = rows.variants.filter(
					(variant) => (variant.pattern[0] as any)?.value === "Zero: "
				);
				expect(zero).toHaveLength(1);
				const runtime = i18next.createInstance();
				await runtime.init({
					lng: locale,
					fallbackLng: false,
					resources: { [locale]: { translation: resource } },
				});
				for (const count of [0, 1, 2, 10, 11, 19, 20, 21, 100, 0.5]) {
					expect(render(rows, locale, count), `${locale}, count=${count}`).toBe(
						runtime.t("item", { count })
					);
				}
				const t = tables(current.version);
				await current.db
					.updateTable(t.variant)
					.set({ pattern: [{ type: "text", value: "Edited zero" }] })
					.where("id", "=", zero[0]!.id)
					.execute();
				const exportResource = async () => {
					const files = await current.exportFiles({ pluginKey: fixture.key });
					return JSON.parse(
						decode(files.find((file) => file.locale === locale)!.content)
					);
				};
				expect(await exportResource()).toEqual({
					...resource,
					item_zero: "Edited zero",
				});
				await current.db
					.deleteFrom(t.variant)
					.where("id", "=", zero[0]!.id)
					.execute();
				expect(await exportResource()).toEqual({
					item_one: resource.item_one,
					item_other: resource.item_other,
				});
				rows = await selectRows(current);
				expect(rows.variants).toHaveLength(2);
			} finally {
				await published.close();
				await current.close();
			}
		}
	);
}
