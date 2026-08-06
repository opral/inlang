import type { Lix, LixBatchStatement } from "@lix-js/sdk";
import type { Bundle, Message, Variant } from "../database/schema.js";

const FORMAT = "inlang-lix-memory-v1";

type Snapshot = {
	format: typeof FORMAT;
	files: Array<{ path: string; data: string }>;
	bundles: Bundle[];
	messages: Message[];
	variants: Variant[];
};

export async function projectToBlob(lix: Lix): Promise<Blob> {
	const [files, bundles, messages, variants] = await Promise.all([
		lix.execute("SELECT path, content FROM lix_file ORDER BY path"),
		lix.execute("SELECT id, declarations FROM bundle ORDER BY id"),
		lix.execute(
			'SELECT id, "bundleId", locale, selectors FROM message ORDER BY id'
		),
		lix.execute(
			'SELECT id, "messageId", matches, pattern FROM variant ORDER BY id'
		),
	]);

	const snapshot: Snapshot = {
		format: FORMAT,
		files: files.rows.map((row) => ({
			path: row.get("path") as string,
			data: bytesToBase64(row.value("content").asBytes() ?? new Uint8Array()),
		})),
		bundles: bundles.rows.map((row) => row.toObject() as Bundle),
		messages: messages.rows.map((row) => row.toObject() as Message),
		variants: variants.rows.map((row) => row.toObject() as Variant),
	};

	return new Blob([JSON.stringify(snapshot)], {
		type: "application/vnd.inlang.project+json",
	});
}

export async function restoreProjectBlob(lix: Lix, blob: Blob): Promise<void> {
	let snapshot: Snapshot;
	try {
		snapshot = JSON.parse(await blob.text()) as Snapshot;
	} catch (cause) {
		throw new Error(
			"The project uses the legacy Lix SQLite format, which Lix 0.9 cannot open in memory.",
			{ cause }
		);
	}
	if (snapshot.format !== FORMAT) {
		throw new Error(
			`Unsupported inlang project format: ${String(snapshot.format)}`
		);
	}

	const statements: LixBatchStatement[] = [];
	for (const file of snapshot.files) {
		statements.push({
			sql: "INSERT INTO lix_file (path, content) VALUES ($1, $2)",
			params: [file.path, base64ToBytes(file.data)],
		});
	}
	for (const bundle of snapshot.bundles) {
		statements.push({
			sql: "INSERT INTO bundle (id, declarations) VALUES ($1, $2)",
			params: [bundle.id, bundle.declarations],
		});
	}
	for (const message of snapshot.messages) {
		statements.push({
			sql: 'INSERT INTO message (id, "bundleId", locale, selectors) VALUES ($1, $2, $3, $4)',
			params: [message.id, message.bundleId, message.locale, message.selectors],
		});
	}
	for (const variant of snapshot.variants) {
		statements.push({
			sql: 'INSERT INTO variant (id, "messageId", matches, pattern) VALUES ($1, $2, $3, $4)',
			params: [variant.id, variant.messageId, variant.matches, variant.pattern],
		});
	}
	if (statements.length > 0) await lix.executeBatch(statements);
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
	}
	return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}
