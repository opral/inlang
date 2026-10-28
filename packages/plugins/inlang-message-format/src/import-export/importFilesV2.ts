import type { InlangPlugin } from "@inlang/sdk";

/**
 * Imports ordinary flat strings through the SDK-owned catalog builder.
 * The entire import is checked before the first sink callback. Unsupported
 * syntax returns undefined so the unchanged plugin importer can handle it.
 */
export const importFilesV2: NonNullable<InlangPlugin["importFilesV2"]> = ({
	files,
	sink,
}) => {
	const parsedFiles: Array<{
		locale: string;
		entries: Array<[string, string]>;
	}> = [];
	const locales = new Set<string>();
	const decoder = new TextDecoder();
	for (const file of files) {
		// Repeated locale paths may merge rows; retain the normal importer then.
		if (locales.has(file.locale)) return undefined;
		locales.add(file.locale);
		const json = JSON.parse(decoder.decode(file.content));
		if (json === null || typeof json !== "object" || Array.isArray(json))
			return undefined;
		const entries = Object.entries(json);
		for (const [key, value] of entries) {
			if (typeof value !== "string") return undefined;
			if (key === "$schema") continue;
			if (!isSimplePattern(value)) return undefined;
		}
		parsedFiles.push({
			locale: file.locale,
			entries: entries as Array<[string, string]>,
		});
	}
	for (const { locale, entries } of parsedFiles) {
		for (const [key, value] of entries) {
			if (key === "$schema") continue;
			sink.addMessage(key, locale, scalarParts(value));
		}
	}
	return true;
};

/** No AST, substring, or reference-name allocation during preflight. */
function isSimplePattern(value: string): boolean {
	if (value.includes("\\")) return false;
	let cursor = 0;
	while (cursor < value.length) {
		const opening = value.indexOf("{", cursor);
		if (opening === -1) return true;
		const closing = value.indexOf("}", opening + 1);
		if (closing === -1) return false;
		if (value[opening + 1] === "#" || value[opening + 1] === "/") return false;
		for (let i = opening + 1; i < closing; i++) {
			const char = value[i];
			if (char === "{" || char === "|" || char === ":") return false;
		}
		cursor = closing + 1;
	}
	return true;
}

/** Empty slots separate neighboring inputs; the sink omits empty text nodes. */
function scalarParts(value: string): string[] {
	const parts = [];
	let cursor = 0;
	while (cursor < value.length) {
		const opening = value.indexOf("{", cursor);
		if (opening === -1) break;
		const closing = value.indexOf("}", opening + 1);
		parts.push(value.slice(cursor, opening), value.slice(opening + 1, closing));
		cursor = closing + 1;
	}
	parts.push(value.slice(cursor));
	return parts;
}
