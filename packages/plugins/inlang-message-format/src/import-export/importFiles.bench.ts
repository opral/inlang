import { bench, describe } from "vitest";
import { importFiles } from "./importFiles.js";

function makeFiles(locales: number, keys: number) {
	const encoder = new TextEncoder();
	const files = [];

	for (let localeIndex = 0; localeIndex < locales; localeIndex++) {
		const locale = `locale_${localeIndex}`;
		const json: Record<string, string> = {};

		for (let keyIndex = 0; keyIndex < keys; keyIndex++) {
			const key = `message_${keyIndex}`;
			if (keyIndex % 5 === 0) {
				json[key] = `Hello {name} from ${locale} (#${keyIndex})`;
			} else if (keyIndex % 5 === 1) {
				json[key] = `Count is {count} in ${locale}`;
			} else {
				json[key] = `Static text ${locale} ${keyIndex}`;
			}
		}

		files.push({
			locale,
			content: encoder.encode(JSON.stringify(json)),
		});
	}

	return files;
}

for (const [locales, keys] of [
	[30, 5000],
	[10, 1000],
	[1, 200],
]) {
	const files = makeFiles(locales, keys);
	describe(`importFiles (${locales} locales × ${keys} keys)`, () => {
		bench(
			"Import files",
			async () => {
				await importFiles({
					settings: {} as any,
					files,
				});
			},
			{ time: 1000 }
		);
	});
}
