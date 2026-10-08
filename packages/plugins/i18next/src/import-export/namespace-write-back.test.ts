import { expect, test } from "vitest";
import nodeFs from "node:fs";
import nodeOs from "node:os";
import nodePath from "node:path";
import {
	loadProjectFromDirectory,
	saveProjectToDirectory,
	type InlangPlugin,
} from "@inlang/sdk";
import { plugin } from "../plugin.js";

// kept separate from roundtrip.test.ts on purpose: that file imports
// ./importFiles.js before ../plugin.js, and under vite's module transform
// the circular (type-only) imports between plugin.ts and the import-export
// modules then leave plugin.importFiles undefined, which makes the sdk
// silently treat the plugin as a legacy loadMessages/saveMessages plugin.
//
// https://github.com/opral/inlang/issues/4356
test("saveProjectToDirectory writes namespaced files back to their pathPattern", async () => {
	const dir = nodeFs.mkdtempSync(
		nodePath.join(nodeOs.tmpdir(), "i18next-namespace-write-back-")
	);
	nodeFs.mkdirSync(nodePath.join(dir, "en"), { recursive: true });
	nodeFs.mkdirSync(nodePath.join(dir, "project.inlang"), { recursive: true });
	nodeFs.writeFileSync(
		nodePath.join(dir, "en/common.json"),
		JSON.stringify({ hello: "Hello world" })
	);
	nodeFs.writeFileSync(
		nodePath.join(dir, "en/app.json"),
		JSON.stringify({ title: "My app" })
	);
	nodeFs.writeFileSync(
		nodePath.join(dir, "project.inlang/settings.json"),
		JSON.stringify({
			baseLocale: "en",
			locales: ["en"],
			"plugin.inlang.i18next": {
				pathPattern: {
					common: "./{locale}/common.json",
					app: "./{locale}/app.json",
				},
			},
		})
	);

	const project = await loadProjectFromDirectory({
		path: nodePath.join(dir, "project.inlang"),
		fs: nodeFs,
		providePlugins: [plugin as unknown as InlangPlugin],
	});

	try {
		// update a message to prove that saving writes the change back
		// to the path the namespace pattern describes
		const message = await project.db
			.selectFrom("inlang_message")
			.selectAll()
			.where("bundle_id", "=", "common:hello")
			.executeTakeFirstOrThrow();
		await project.db
			.updateTable("inlang_variant")
			.set({ pattern: [{ type: "text", value: "Hello updated" }] })
			.where("message_id", "=", message.id)
			.execute();

		await saveProjectToDirectory({
			project,
			path: nodePath.join(dir, "project.inlang"),
			fs: nodeFs,
		});

		expect(
			JSON.parse(
				nodeFs.readFileSync(nodePath.join(dir, "en/common.json"), "utf-8")
			)
		).toStrictEqual({ hello: "Hello updated" });
		expect(
			JSON.parse(nodeFs.readFileSync(nodePath.join(dir, "en/app.json"), "utf-8"))
		).toStrictEqual({ title: "My app" });
	} finally {
		await project.close();
		nodeFs.rmSync(dir, { recursive: true, force: true });
	}
});
