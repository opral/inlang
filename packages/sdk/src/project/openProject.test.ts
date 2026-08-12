import { openLix } from "@lix-js/sdk";
import { expect, test } from "vitest";
import { openProject } from "./openProject.js";

test("opens a project on a caller-owned Lix", async () => {
	const lix = await openLix();
	const project = await openProject({
		lix,
		settings: { baseLocale: "fr", locales: ["fr", "en"], modules: [] },
	});

	expect(await project.settings.get()).toMatchObject({
		baseLocale: "fr",
		locales: ["fr", "en"],
	});
	const registeredSchemas = await lix.execute(
		"SELECT lix_json_get_text(value, 'x-lix-key') AS schema_key FROM lix_registered_schema"
	);
	expect(
		registeredSchemas.rows
			.map((row) => row.value("schema_key").toJS())
			.filter((key) => typeof key === "string" && key.startsWith("inlang_"))
			.sort()
	).toEqual(["inlang_bundle", "inlang_message", "inlang_variant"]);
	await expect(
		lix.execute("SELECT key, value FROM lix_key_value")
	).resolves.toBeDefined();
	await expect(
		lix.execute("SELECT id, name FROM lix_account")
	).resolves.toBeDefined();

	await project.db
		.insertInto("bundle")
		.values({ id: "caller-owned-lix" })
		.execute();
	expect(
		await project.db
			.selectFrom("bundle")
			.select("id")
			.where("id", "=", "caller-owned-lix")
			.executeTakeFirst()
	).toEqual({ id: "caller-owned-lix" });

	await project.close();

	await expect(lix.execute("SELECT 1 AS value")).resolves.toBeDefined();
	await lix.close();
});

test("reopens an existing project without replacing its settings", async () => {
	const lix = await openLix();
	const first = await openProject({
		lix,
		settings: { baseLocale: "de", locales: ["de"], modules: [] },
	});
	await first.close();

	const second = await openProject({
		lix,
		settings: { baseLocale: "en", locales: ["en"], modules: [] },
	});
	expect(await second.settings.get()).toMatchObject({
		baseLocale: "de",
		locales: ["de"],
	});

	await second.close();
	await lix.close();
});
