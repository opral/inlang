import { createBundle, createMessage, generateUUID } from "@inlang/sdk";
import fs from "fs";

const enFile = fs.readFileSync("demo/importedResources/en.json", "utf8");
const enData = JSON.parse(enFile);

const deFile = fs.readFileSync("demo/importedResources/de.json", "utf8");
const deData = JSON.parse(deFile);

// Create a new object and combine the two languages. Both languages have a intersection of the same keys.
const combinedData = {};
for (const key in enData) {
	combinedData[key] = {
		en: enData[key],
		de: deData[key],
	};
}

//console.log(combinedData);

const ast = [];
for (const key in combinedData) {
	const bundle = createBundle({
		messages: [
			createMessage({
				locale: "en",
				text: combinedData[key].en,
			}),
			combinedData[key].de &&
				createMessage({
					locale: "de",
					text: combinedData[key].de,
				}),
		].filter(Boolean),
	});
	ast.push(bundle);
}

console.log(JSON.stringify(ast, null, 2));

const sqliteConformAst = [];

for (const bundle of ast) {
	const newBundle = {};
	newBundle["id"] = bundle.id;
	newBundle["messages"] = [];

	for (const message of bundle.messages) {
		const newMessage = {};
		newMessage["id"] = message.id;
		newMessage["bundle_id"] = bundle.id;
		newMessage["locale"] = message.locale;
		newMessage["selectors"] = [];
		newMessage["declarations"] = [
			{
				type: "input",
				name: "numTodos",
				value: {
					type: "expression",
					arg: {
						type: "variable",
						name: "numTodos",
					},
				},
			},
		];
		newMessage["variants"] = [];

		for (const variant of message.variants) {
			const newVariant = {};
			newVariant["id"] = variant.id;
			newVariant["message_id"] = message.id;
			newVariant["match"] = {};
			newVariant["pattern"] = variant.pattern;

			newMessage["variants"].push(newVariant);
		}

		newBundle["messages"].push(newMessage);
	}

	sqliteConformAst.push(newBundle);
}

console.log(JSON.stringify(sqliteConformAst, null, 2));

// Add one variant bundle
const variantBundle = sqliteConformAst.find((bundle) => bundle.id === "app_nrOfTodos");

for (const message of variantBundle.messages) {
	if (message.locale === "en") {
		message.selectors.push({
			type: "expression",
			arg: {
				type: "variable",
				name: "numTodos",
			},
			annotation: {
				type: "function",
				name: "plural",
				options: [],
			},
		});
		message.variants = [
			{
				message_id: message.id,
				id: generateUUID(),
				match: { numTodos: "one" },
				pattern: [
					{
						type: "expression",
						arg: {
							type: "variable",
							name: "numTodos",
						},
					},
					{
						type: "text",
						value: " task",
					},
				],
			},
			{
				message_id: message.id,
				id: generateUUID(),
				match: { numTodos: "other" },
				pattern: [
					{
						type: "expression",
						arg: {
							type: "variable",
							name: "numTodos",
						},
					},
					{
						type: "text",
						value: " tasks",
					},
				],
			},
		];
	} else {
		message.selectors.push({
			type: "expression",
			arg: {
				type: "variable",
				name: "numTodos",
			},
			annotation: {
				type: "function",
				name: "plural",
				options: [],
			},
		});
		message.variants = [
			{
				message_id: message.id,
				id: generateUUID(),
				match: { numTodos: "one" },
				pattern: [
					{
						type: "text",
						value: "Eine Aufgabe",
					},
				],
			},
			{
				message_id: message.id,
				id: generateUUID(),
				match: { numTodos: "other" },
				pattern: [
					{
						type: "expression",
						arg: {
							type: "variable",
							name: "numTodos",
						},
					},
					{
						type: "text",
						value: " Aufgaben",
					},
				],
			},
		];
	}
}

//clear the file before writing to it
fs.writeFileSync("demo/bundles.ts", "");

// Write to demo/bundles.ts file with a defulat export. Name the export `demoBundles`
fs.writeFileSync(
	"demo/bundles.ts",
	`import { BundleNested } from "@inlang/sdk"; \n export const demoBundles: BundleNested[] = ${JSON.stringify(
		sqliteConformAst,
		null,
		2
	)}`
);
