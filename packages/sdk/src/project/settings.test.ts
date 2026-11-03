import { expect, test, vi } from "vitest";
import { loadProjectInMemory } from "./loadProjectInMemory.js";
import { newProject } from "./newProject.js";

test("thousands of concurrent settings getters share one read and independent results", async () => {
	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
				modules: [],
				"plugin.example": { nested: { enabled: true } },
			},
		}),
	});
	const read = vi.spyOn(project.lix, "queryOne");
	try {
		const settings = await Promise.all(
			Array.from({ length: 5000 }, () => project.settings.get())
		);
		expect(read).toHaveBeenCalledTimes(1);
		expect(settings).toHaveLength(5000);
		expect(new Set(settings).size).toBe(5000);
		settings[0]!.locales.push("fr");
		settings[0]!["plugin.example"].nested.enabled = false;
		expect(settings[1]!.locales).toEqual(["en", "de"]);
		expect(settings[1]!["plugin.example"].nested.enabled).toBe(true);
		expect(settings[1]!.languageTags).toEqual(["en", "de"]);

		expect((await project.settings.get()).locales).toEqual(["en", "de"]);
		expect(read).toHaveBeenCalledTimes(2);
	} finally {
		read.mockRestore();
		await project.close();
	}
});

test("settings reads stay fresh after settings.set and direct SQL updates", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });
	try {
		const initial = await project.settings.get();
		await project.settings.set({ ...initial, locales: ["en", "de"] });
		expect((await project.settings.get()).locales).toEqual(["en", "de"]);
		await project.lix.execute(
			"UPDATE lix_file SET content = $1 WHERE path = $2",
			[
				new TextEncoder().encode(
					JSON.stringify({ ...initial, locales: ["en", "fr"] })
				),
				"/settings.json",
			]
		);
		expect((await project.settings.get()).locales).toEqual(["en", "fr"]);
	} finally {
		await project.close();
	}
});

test("a failed shared settings read can be retried", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });
	const error = new Error("settings read failed");
	const read = vi.spyOn(project.lix, "queryOne").mockRejectedValueOnce(error);
	try {
		const results = await Promise.allSettled(
			Array.from({ length: 100 }, () => project.settings.get())
		);
		expect(read).toHaveBeenCalledTimes(1);
		expect(results.every((result) => result.status === "rejected")).toBe(true);
		for (const result of results) {
			if (result.status === "rejected") expect(result.reason).toBe(error);
		}
		expect((await project.settings.get()).baseLocale).toBe("en");
		expect(read).toHaveBeenCalledTimes(2);
	} finally {
		read.mockRestore();
		await project.close();
	}
});

test("a settings write separates overlapping reads without clearing a newer pending read", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });
	const initial = await project.settings.get();
	const oldRead = Promise.withResolvers<void>();
	const newRead = Promise.withResolvers<void>();
	const queryOne = project.lix.queryOne.bind(project.lix);
	const read = vi.spyOn(project.lix, "queryOne");
	read.mockImplementationOnce(async (...args) => {
		const row = await queryOne(...args);
		await oldRead.promise;
		return row;
	});
	read.mockImplementationOnce(async (...args) => {
		const row = await queryOne(...args);
		await newRead.promise;
		return row;
	});
	try {
		const beforeWrite = project.settings.get();
		const write = project.settings.set({ ...initial, locales: ["en", "de"] });
		const afterWrite = project.settings.get();
		await write;
		oldRead.resolve();
		expect((await beforeWrite).locales).toEqual(initial.locales);
		const concurrentAfterWrite = project.settings.get();
		expect(read).toHaveBeenCalledTimes(2);
		newRead.resolve();
		expect((await afterWrite).locales).toEqual(["en", "de"]);
		expect((await concurrentAfterWrite).locales).toEqual(["en", "de"]);
	} finally {
		oldRead.resolve();
		newRead.resolve();
		read.mockRestore();
		await project.close();
	}
});
