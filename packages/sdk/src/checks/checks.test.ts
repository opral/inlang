import { afterEach, expect, test, vi } from "vitest";
import { openLix, Value } from "@lix-js/sdk";
import { openProject } from "../project/openProject.js";
import type { InlangPlugin } from "../plugin/schema.js";
import type { InlangProject } from "../project/api.js";
import { checkProject } from "./checkProject.js";
import { applyFix } from "./applyFix.js";
import type { CheckDiagnostic, SourceFile } from "./types.js";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
	for (const close of cleanup.splice(0).reverse()) await close();
});
const files: SourceFile[] = [{ path: "src/app.ts", content: "m.used()" }];
const analyze = vi.fn(async ({ files }: { files: readonly SourceFile[] }) => ({
	usedBundleIds: files[0]!.content.includes("old") ? ["old"] : ["used"],
	status: "complete" as const,
}));
async function setup(
	plugins: InlangPlugin[] = [{ key: "matcher", analyzeUsage: analyze }]
): Promise<InlangProject> {
	const lix = await openLix();
	cleanup.push(() => lix.close());
	const project = await openProject({
		lix,
		settings: { baseLocale: "en", locales: ["en", "de"], modules: [] },
		providePlugins: plugins,
	});
	cleanup.push(() => project.close());
	await project.db.transaction().execute(async (tx) => {
		await tx
			.insertInto("inlang_bundle")
			.values([{ id: "used" }, { id: "old" }])
			.execute();
		await tx
			.insertInto("inlang_message")
			.values([
				{ id: "used-en", bundle_id: "used", locale: "en" },
				{ id: "old-en", bundle_id: "old", locale: "en" },
				{ id: "old-de", bundle_id: "old", locale: "de" },
			])
			.execute();
		await tx
			.insertInto("inlang_variant")
			.values([
				{
					id: "old-en-v",
					message_id: "old-en",
					pattern: [{ type: "text", value: "Old" }],
				},
				{ id: "old-de-v", message_id: "old-de", pattern: [] },
			])
			.execute();
	});
	return project;
}
async function unused(project: InlangProject): Promise<CheckDiagnostic> {
	return (await checkProject({ project, files })).diagnostics.find(
		(d) => d.checkId === "unused-message"
	)!;
}

test("catalog checks run without files and report unavailable usage", async () => {
	const project = await setup();
	const result = await checkProject({ project });
	expect(result.diagnostics).toMatchObject([
		{
			checkId: "missing-translation",
			bundleId: "used",
			locale: "de",
			fixes: [],
		},
	]);
	expect(result.checks[1]?.status).toBe("unavailable");
});
test("returns serializable fixes and scoped diagnostics, with fallback exclusions", async () => {
	const project = await setup();
	const result = await checkProject({ project, files });
	expect(JSON.parse(JSON.stringify(result))).toEqual(result);
	expect(
		result.diagnostics
			.filter((d) => d.checkId === "unused-message")
			.map((d) => d.bundleId)
	).toEqual(["old"]);
	expect(
		(await checkProject({ project, files, bundleIds: ["old"] })).diagnostics
	).toHaveLength(1);
	expect(
		(
			await checkProject({
				project,
				ignoreMissingTranslations: [{ bundleId: "used", locale: "de" }],
			})
		).diagnostics
	).toEqual([]);
	expect((await checkProject({ project, bundleIds: [] })).diagnostics).toEqual(
		[]
	);
});
test("reuses source analysis across translation edits and invalidates changed source/settings", async () => {
	const project = await setup();
	analyze.mockClear();
	const snapshot = files.map((file) => ({ ...file }));
	await checkProject({ project, files: snapshot });
	await project.db
		.updateTable("inlang_variant")
		.set({ pattern: [{ type: "text", value: "Changed" }] })
		.where("id", "=", "old-en-v")
		.execute();
	await checkProject({ project, files: snapshot });
	expect(analyze).toHaveBeenCalledTimes(1);
	snapshot[0]!.content = "m.old()";
	await checkProject({ project, files: snapshot });
	expect(analyze).toHaveBeenCalledTimes(2);
	await project.settings.set({
		...(await project.settings.get()),
		locales: ["en", "de", "fr"],
	});
	await checkProject({ project, files: snapshot });
	expect(analyze).toHaveBeenCalledTimes(3);
});
test.each(["incomplete", "throw"])(
	"%s analysis never offers deletion",
	async (mode) => {
		const project = await setup([
			{
				key: "uncertain",
				analyzeUsage: () => {
					if (mode === "throw") throw new Error("parse failed");
					return { status: "incomplete", usedBundleIds: [] };
				},
			},
		]);
		const result = await checkProject({ project, files });
		expect(result.checks[1]?.status).toBe("incomplete");
		expect(result.diagnostics.some((d) => d.checkId === "unused-message")).toBe(
			false
		);
	}
);
test("missing analyzer, empty snapshot and mixed legacy matchers do not imply unused", async () => {
	const project = await setup([]);
	expect((await checkProject({ project, files })).checks[1]?.status).toBe(
		"unavailable"
	);
	const mixed = await setup([
		{ key: "modern", analyzeUsage: analyze },
		{
			key: "legacy",
			meta: {
				"app.inlang.ideExtension": { messageReferenceMatchers: [() => []] },
			},
		},
	]);
	expect(
		(await checkProject({ project: mixed, files })).checks[1]?.status
	).toBe("incomplete");
	expect(
		(await checkProject({ project: mixed, files: [] })).checks[1]?.status
	).toBe("unavailable");
});
test("applies deletion across all locales and variants; repeated fixes are skipped", async () => {
	const project = await setup();
	const diagnostic = await unused(project);
	analyze.mockClear();
	expect(
		await applyFix({
			project,
			files,
			diagnostic,
			fixId: "delete-unused-message",
		})
	).toEqual({ status: "applied", affectedBundleIds: ["old"] });
	expect(analyze).toHaveBeenCalledTimes(1);
	expect(
		await project.db.selectFrom("inlang_message").select("id").execute()
	).toEqual([{ id: "used-en" }]);
	expect(
		await project.db.selectFrom("inlang_variant").select("id").execute()
	).toEqual([]);
	expect(
		(
			await applyFix({
				project,
				files,
				diagnostic,
				fixId: "delete-unused-message",
			})
		).status
	).toBe("skipped");
});
test.each(["variant", "message", "bundle", "new-variant", "new-locale"])(
	"rejects a stale fix after %s changes",
	async (kind) => {
		const project = await setup();
		const diagnostic = await unused(project);
		if (kind === "variant")
			await project.db
				.updateTable("inlang_variant")
				.set({ pattern: [{ type: "text", value: "New" }] })
				.where("id", "=", "old-en-v")
				.execute();
		if (kind === "message")
			await project.db
				.updateTable("inlang_message")
				.set({ locale: "fr" })
				.where("id", "=", "old-de")
				.execute();
		if (kind === "bundle")
			await project.db
				.updateTable("inlang_bundle")
				.set({ declarations: [{ type: "input-variable", name: "name" }] })
				.where("id", "=", "old")
				.execute();
		if (kind === "new-variant")
			await project.db
				.insertInto("inlang_variant")
				.values({ id: "new", message_id: "old-en" })
				.execute();
		if (kind === "new-locale")
			await project.db
				.insertInto("inlang_message")
				.values({ id: "old-fr", bundle_id: "old", locale: "fr" })
				.execute();
		expect(
			(
				await applyFix({
					project,
					files,
					diagnostic,
					fixId: "delete-unused-message",
				})
			).status
		).toBe("skipped");
		expect(
			await project.db
				.selectFrom("inlang_bundle")
				.select("id")
				.where("id", "=", "old")
				.execute()
		).toHaveLength(1);
	}
);
test("rejects new usages, unavailable analysis and unoffered fixes", async () => {
	const project = await setup();
	const diagnostic = await unused(project);
	for (const args of [
		{ files: [{ path: "src/app.ts", content: "m.old()" }] },
		{ files: undefined },
		{ diagnostic: { ...diagnostic, fixes: [] } },
	]) {
		expect(
			(
				await applyFix({
					project,
					files,
					diagnostic,
					fixId: "delete-unused-message",
					...args,
				})
			).status
		).toBe("skipped");
	}
});

test("a concurrent edit after revision validation conflicts and preserves all rows", async () => {
	const project = await setup();
	const diagnostic = await unused(project);
	const other = await project.lix.openAnotherSession();
	cleanup.push(() => other.close());
	let ready!: () => void, resume!: () => void;
	const paused = new Promise<void>((resolve) => {
		ready = resolve;
	});
	const continueFix = new Promise<void>((resolve) => {
		resume = resolve;
	});
	const originalBegin = project.lix.beginTransaction.bind(project.lix);
	vi.spyOn(project.lix, "beginTransaction").mockImplementation(async () => {
		const tx = await originalBegin();
		const execute = tx.execute.bind(tx);
		vi.spyOn(tx, "execute").mockImplementation(async (sql, params, options) => {
			const result = await execute(sql, params, options);
			if (sql.includes('"bundle_change"')) {
				ready();
				await continueFix;
			}
			return result;
		});
		return tx;
	});
	const fixing = applyFix({
		project,
		files,
		diagnostic,
		fixId: "delete-unused-message",
	});
	const rejected = expect(fixing).rejects.toThrow(/conflict/i);
	await paused;
	try {
		await other.execute(
			"UPDATE inlang_variant SET pattern = $1 WHERE id = $2",
			[Value.jsonb([{ type: "text", value: "Concurrent edit" }]), "old-en-v"]
		);
	} finally {
		resume();
	}
	await rejected;
	expect(
		(
			await project.db
				.selectFrom("inlang_variant")
				.select("pattern")
				.where("id", "=", "old-en-v")
				.executeTakeFirst()
		)?.pattern
	).toEqual([{ type: "text", value: "Concurrent edit" }]);
	expect(
		await project.db
			.selectFrom("inlang_bundle")
			.select("id")
			.where("id", "=", "old")
			.execute()
	).toHaveLength(1);
	expect(
		await project.db
			.selectFrom("inlang_message")
			.select("id")
			.where("bundle_id", "=", "old")
			.execute()
	).toHaveLength(2);
	expect(
		await project.db.selectFrom("inlang_variant").select("id").execute()
	).toHaveLength(2);
});

test("settings changed by an analyzer prevent applying its finding", async () => {
	const project = await setup();
	const diagnostic = await unused(project);
	vi.spyOn(project.plugins, "get").mockResolvedValue([
		{
			key: "changing",
			analyzeUsage: async () => {
				await project.settings.set({
					...(await project.settings.get()),
					locales: ["en", "de", "fr"],
				});
				return { status: "complete", usedBundleIds: [] };
			},
		},
	]);
	expect(
		(
			await applyFix({
				project,
				files,
				diagnostic,
				fixId: "delete-unused-message",
			})
		).status
	).toBe("skipped");
});

test("retries transient analyzer failures on an unchanged snapshot", async () => {
	let attempts = 0;
	const project = await setup([
		{
			key: "transient",
			analyzeUsage: () => {
				if (++attempts === 1) throw new Error("Temporary failure");
				return { status: "complete", usedBundleIds: ["used"] };
			},
		},
	]);
	expect((await checkProject({ project, files })).checks[1]?.status).toBe(
		"incomplete"
	);
	expect((await checkProject({ project, files })).checks[1]?.status).toBe(
		"complete"
	);
});

test("analyzer issues withhold fixes even if status incorrectly says complete", async () => {
	const project = await setup([
		{
			key: "contradictory",
			analyzeUsage: () => ({
				status: "complete",
				usedBundleIds: [],
				issues: [{ path: "app.ts", reason: "Unresolved usage" }],
			}),
		},
	]);
	const result = await checkProject({ project, files });
	expect(result.checks[1]?.status).toBe("incomplete");
	expect(result.diagnostics.some((d) => d.checkId === "unused-message")).toBe(
		false
	);
});
