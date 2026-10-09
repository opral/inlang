import { bench } from "vitest";
import nodeFs from "node:fs";
import nodePath from "node:path";
import { memfs } from "memfs";
import { loadProjectFromDirectory } from "./loadProjectFromDirectory.js";

const pluginAsText = nodeFs.readFileSync(
	nodePath.join(
		process.cwd(),
		"packages/plugins/inlang-message-format/dist/index.js"
	),
	"utf8"
);
const messageData = Object.fromEntries(
	Array.from({ length: 1000 }, (_, i) => [`message_${i}`, `Hello {username} #${i}`])
);
const localeNames = Array.from({ length: 10 }, (_, i) => `locale_${i}`);
const fs = memfs({
	"/plugin.js": pluginAsText,
	"/project.inlang/settings.json": JSON.stringify({
		baseLocale: localeNames[0],
		locales: localeNames,
		modules: ["/plugin.js"],
		"plugin.inlang.messageFormat": { pathPattern: "/{locale}.json" },
	}),
	...Object.fromEntries(
		localeNames.map((locale) => [`/${locale}.json`, JSON.stringify(messageData)])
	),
}).fs as unknown as typeof import("node:fs");

bench("load project from directory", async () => {
	const project = await loadProjectFromDirectory({ path: "/project.inlang", fs });
	await project.close();
}, { iterations: 1, time: 100 });
