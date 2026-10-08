import { afterEach, expect, test, vi } from "vitest";
import { openLix, Value } from "@lix-js/sdk";
import { openProject } from "../project/openProject.js";
import type { InlangPlugin } from "../plugin/schema.js";
import type { InlangProject } from "../project/api.js";
import { checkProject } from "./checkProject.js";
import { applyFix } from "./applyFix.js";
import { findUsages } from "./findUsages.js";
import type { CheckDiagnostic, SourceFile, UsageAnalysis } from "./types.js";

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
					id: "used-en-v",
					message_id: "used-en",
					pattern: [{ type: "text", value: "Used" }],
				},
				{
					id: "old-en-v",
					message_id: "old-en",
					pattern: [{ type: "text", value: "Old" }],
				},
				{
					id: "old-de-v",
					message_id: "old-de",
					pattern: [{ type: "text", value: "Alt" }],
				},
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
	).toEqual([{ id: "used-en-v" }]);
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
		await project.db
			.selectFrom("inlang_variant")
			.select("id")
			.where("message_id", "in", ["old-en", "old-de"])
			.execute()
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

test("plugin load failures remain incomplete when no analyzer is available", async () => {
	const project = await setup([]);
	vi.spyOn(project.errors, "get").mockResolvedValue([
		new Error("Plugin failed to load"),
	]);
	const result = await checkProject({ project, files });
	expect(result.checks[1]).toMatchObject({
		status: "incomplete",
		issues: [{ reason: "Project plugin loading reported errors." }],
	});
	expect(result.diagnostics.some((d) => d.checkId === "unused-message")).toBe(
		false
	);
});

test.each([
	{ status: "complete", usedBundleIds: "old" },
	{ status: "complete", usedBundleIds: [1] },
	{ status: "invalid", usedBundleIds: [] },
	{ status: "complete", usedBundleIds: [], issues: [{ reason: 1 }] },
	null,
])("invalid runtime analyzer output withholds findings: %j", async (output) => {
	const project = await setup([
		{ key: "invalid", analyzeUsage: () => output as unknown as UsageAnalysis },
	]);
	const result = await checkProject({ project, files });
	expect(result.checks[1]?.status).toBe("incomplete");
	expect(result.diagnostics.some((d) => d.checkId === "unused-message")).toBe(
		false
	);
});
test.each(["settings", "files"])(
	"plugin mutation of %s cannot corrupt later checks",
	async (target) => {
		let observed = "";
		const project = await setup([
			{
				key: "mutating",
				analyzeUsage: ({ files, settings }) => {
					if (target === "settings") settings.locales.length = 0;
					else files[0]!.content = "";
					return { status: "complete", usedBundleIds: [] };
				},
			},
			{
				key: "observing",
				analyzeUsage: ({ files, settings }) => {
					observed = files[0]!.content + settings.locales.join(",");
					return { status: "complete", usedBundleIds: ["used"] };
				},
			},
		]);
		const result = await checkProject({ project, files });
		expect(observed).toBe("m.used()en,de");
		expect(result.checks[1]?.status).toBe("incomplete");
		expect(result.diagnostics).toMatchObject([
			{ checkId: "missing-translation", bundleId: "used", locale: "de" },
		]);
		expect((await project.settings.get()).locales).toEqual(["en", "de"]);
		expect(files[0]!.content).toBe("m.used()");
	}
);
test("caller mutations of result status cannot change cached analysis", async () => {
	const project = await setup([
		{
			key: "uncertain",
			analyzeUsage: () => ({
				status: "incomplete",
				usedBundleIds: [],
				issues: [{ reason: "Dynamic reference" }],
			}),
		},
	]);
	const first = await checkProject({ project, files });
	first.checks[1]!.status = "complete";
	(first.checks[1]!.issues as { reason: string }[])[0]!.reason = "Changed";
	const second = await checkProject({ project, files });
	expect(second.checks[1]).toMatchObject({
		status: "incomplete",
		issues: [{ reason: "Dynamic reference" }],
	});
	expect(second.diagnostics.some((d) => d.checkId === "unused-message")).toBe(
		false
	);
});

test("normalizes plugin issues to serializable public metadata", async () => {
	const project = await setup([
		{
			key: "extra",
			analyzeUsage: () => ({
				status: "incomplete",
				usedBundleIds: [],
				issues: [{ reason: "Dynamic reference", path: "app.ts", extra: 1n }],
			}),
		},
	]);
	const result = await checkProject({ project, files });
	expect(result.checks[1]?.issues).toEqual([
		{ reason: "Dynamic reference", path: "app.ts" },
	]);
	expect(JSON.parse(JSON.stringify(result))).toEqual(result);
});

test("uses validated indexed plugin entries despite custom array methods", async () => {
	const usedBundleIds = ["old"];
	Object.defineProperty(usedBundleIds, Symbol.iterator, {
		value: function* () {
			yield "used";
		},
	});
	Object.defineProperty(usedBundleIds, "every", { value: () => true });
	const issues = [{ reason: "Unresolved" }];
	issues.map = (() => [
		{ reason: "Unresolved", extra: 1n },
	]) as typeof issues.map;
	const project = await setup([
		{
			key: "custom",
			analyzeUsage: () => ({ status: "complete", usedBundleIds }),
		},
	]);
	const result = await checkProject({ project, files });
	expect(
		result.diagnostics
			.filter((d) => d.checkId === "unused-message")
			.map((d) => d.bundleId)
	).toEqual(["used"]);
	const uncertain = await setup([
		{
			key: "issues",
			analyzeUsage: () => ({ status: "incomplete", usedBundleIds: [], issues }),
		},
	]);
	const incomplete = await checkProject({ project: uncertain, files });
	expect(incomplete.checks[1]?.issues).toEqual([{ reason: "Unresolved" }]);
	expect(JSON.parse(JSON.stringify(incomplete))).toEqual(incomplete);
});
test.each([
	Object.create(null),
	{
		toString() {
			throw new Error("Cannot stringify");
		},
	},
])("unprintable analyzer exceptions report incomplete", async (error) => {
	const project = await setup([
		{
			key: "throwing",
			analyzeUsage: () => {
				throw error;
			},
		},
	]);
	const result = await checkProject({ project, files });
	expect(result.checks[1]?.status).toBe("incomplete");
	expect(result.diagnostics.some((d) => d.checkId === "unused-message")).toBe(
		false
	);
});

test("translation checks compare each locale with the reference locale", async () => {
	const project = await setup();
	await project.db.transaction().execute(async (tx) => {
		await tx.insertInto("inlang_bundle").values({ id: "storage" }).execute();
		await tx
			.insertInto("inlang_message")
			.values([
				{ id: "storage-en", bundle_id: "storage", locale: "en" },
				{ id: "storage-de", bundle_id: "storage", locale: "de" },
			])
			.execute();
		await tx
			.insertInto("inlang_variant")
			.values([
				{
					id: "storage-en-v",
					message_id: "storage-en",
					pattern: [
						{
							type: "expression",
							arg: { type: "variable-reference", name: "used" },
						},
						{ type: "text", value: " of " },
						{
							type: "expression",
							arg: { type: "variable-reference", name: "total" },
						},
					],
				},
				{
					id: "storage-de-v",
					message_id: "storage-de",
					pattern: [
						{
							type: "expression",
							arg: { type: "variable-reference", name: "used" },
						},
						{ type: "text", value: " belegt" },
					],
				},
			])
			.execute();
	});
	const result = await checkProject({ project });
	expect(result.diagnostics.filter((d) => d.bundleId === "storage")).toEqual([
		{
			checkId: "missing-variable",
			bundleId: "storage",
			locale: "de",
			messageId: "storage-de",
			variantId: "storage-de-v",
			name: "total",
			severity: "warning",
			fixes: [],
			message: 'Message "storage" is missing {total} in "de".',
		},
	]);
	expect(result.checks.map((check) => check.id)).toEqual([
		"missing-translation",
		"unused-message",
		"empty-translation",
		"missing-variable",
		"unknown-variable",
		"missing-markup",
		"missing-variant",
	]);
	// German as the reference: English now has a variable German doesn't use.
	expect(
		(
			await checkProject({
				project,
				referenceLocale: "de",
				bundleIds: ["storage"],
			})
		).diagnostics.map((d) => [d.checkId, d.locale])
	).toEqual([["unknown-variable", "en"]]);
	// Selected checks only; patterns aren't needed for these.
	const selected = await checkProject({
		project,
		checks: ["missing-translation"],
	});
	expect(selected.checks.map((check) => check.id)).toEqual([
		"missing-translation",
	]);
	expect(
		selected.diagnostics.every((d) => d.checkId === "missing-translation")
	).toBe(true);
});

test("findUsages returns analyzer references from the shared snapshot", async () => {
	const references = [
		{
			bundleId: "used",
			path: "src/app.ts",
			start: { line: 1, column: 0 },
			end: { line: 1, column: 8 },
		},
	];
	const project = await setup([
		{
			key: "matcher",
			analyzeUsage: async () => ({
				usedBundleIds: ["used"],
				status: "complete",
				references,
			}),
		},
	]);
	const found = await findUsages({ project, files });
	expect(found).toEqual({ status: "complete", references });
	expect(
		(await findUsages({ project, files, bundleIds: ["old"] })).references
	).toEqual([]);
	expect((await findUsages({ project, files: [] })).status).toBe("unavailable");
});
