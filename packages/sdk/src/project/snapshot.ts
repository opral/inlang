import type { Lix, LixBatchStatement } from "@lix-js/sdk";
import { initDb } from "../database/initDb.js";
import type {
	Bundle,
	BundleNested,
	Message,
	Variant,
} from "../database/schema.js";
import { selectBundleNested } from "../query-utilities/selectBundleNested.js";

const FORMAT = "inlang-lix-memory-v3";
const PREVIOUS_FORMAT = "inlang-lix-memory-v2";
const LEGACY_FORMAT = "inlang-lix-memory-v1";

type Snapshot = {
	format: typeof FORMAT;
	lixId: string;
	files: Array<{ path: string; data: string }>;
	bundles: BundleNested[];
};

type PreviousSnapshot = {
	format: typeof PREVIOUS_FORMAT;
	files: Array<{ path: string; data: string }>;
	bundles: BundleNested[];
};

type LegacySnapshot = {
	format: typeof LEGACY_FORMAT;
	files: Array<{ path: string; data: string }>;
	bundles: Bundle[];
	messages: Message[];
	variants: Variant[];
};

export async function projectToBlob(lix: Lix): Promise<Blob> {
	const db = initDb({ lix });
	let lixIdResult: Awaited<ReturnType<Lix["execute"]>>;
	let files: Awaited<ReturnType<Lix["execute"]>>;
	let bundles: BundleNested[];
	try {
		[lixIdResult, files, bundles] = await Promise.all([
			lix.execute("SELECT value FROM lix_key_value WHERE key = 'lix_id'"),
			lix.execute("SELECT path, content FROM lix_file ORDER BY path"),
			selectBundleNested(db).execute(),
		]);
	} finally {
		await db.destroy();
	}
	const lixId = lixIdResult.rows[0]?.value("value").toJS();
	if (typeof lixId !== "string") throw new Error("Missing Lix id");

	const snapshot: Snapshot = {
		format: FORMAT,
		lixId,
		files: files.rows
			.filter((row) => row.get("path") !== "/project_id")
			.map((row) => ({
				path: row.get("path") as string,
				data: bytesToBase64(row.value("content").asBytes() ?? new Uint8Array()),
			})),
		bundles,
	};

	return new Blob([JSON.stringify(snapshot)], {
		type: "application/vnd.inlang.project+json",
	});
}

export async function restoreProjectBlob(lix: Lix, blob: Blob): Promise<void> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(await blob.text());
	} catch (cause) {
		throw new Error(
			"The project uses the legacy Lix SQLite format, which Lix 0.9 cannot open in memory.",
			{ cause }
		);
	}
	const format =
		typeof parsed === "object" && parsed !== null && "format" in parsed
			? parsed.format
			: undefined;
	if (
		format !== FORMAT &&
		format !== PREVIOUS_FORMAT &&
		format !== LEGACY_FORMAT
	) {
		throw new Error(`Unsupported inlang project format: ${String(format)}`);
	}
	const snapshot = parsed as Snapshot | PreviousSnapshot | LegacySnapshot;

	const statements: LixBatchStatement[] = [];
	const lixId = snapshotLixId(snapshot);
	if (lixId) {
		statements.push({
			sql: "UPDATE lix_key_value SET value = $1 WHERE key = 'lix_id'",
			params: [lixId],
		});
	}
	for (const file of snapshot.files) {
		if (file.path === "/project_id") continue;
		statements.push({
			sql: "INSERT INTO lix_file (path, content) VALUES ($1, $2)",
			params: [file.path, base64ToBytes(file.data)],
		});
	}
	const bundles =
		snapshot.format === LEGACY_FORMAT
			? nestLegacyBundles(snapshot)
			: snapshot.bundles;
	for (const bundle of bundles) {
		statements.push({
			sql: "INSERT INTO inlang_bundle (id, declarations) VALUES ($1, $2)",
			params: [bundle.id, bundle.declarations],
		});
		for (const message of bundle.messages) {
			statements.push({
				sql: 'INSERT INTO inlang_message (id, "bundleId", locale, selectors) VALUES ($1, $2, $3, $4)',
				params: [message.id, bundle.id, message.locale, message.selectors],
			});
			for (const variant of message.variants) {
				statements.push({
					sql: 'INSERT INTO inlang_variant (id, "messageId", matches, pattern) VALUES ($1, $2, $3, $4)',
					params: [variant.id, message.id, variant.matches, variant.pattern],
				});
			}
		}
	}
	if (statements.length > 0) await lix.executeBatch(statements);
}

function snapshotLixId(
	snapshot: Snapshot | PreviousSnapshot | LegacySnapshot
): string | undefined {
	if (snapshot.format === FORMAT) return snapshot.lixId;
	const projectId = snapshot.files.find((file) => file.path === "/project_id");
	if (!projectId) return undefined;
	return new TextDecoder().decode(base64ToBytes(projectId.data));
}

function nestLegacyBundles(snapshot: LegacySnapshot): BundleNested[] {
	const variantsByMessage = new Map<string, Variant[]>();
	for (const variant of snapshot.variants) {
		const variants = variantsByMessage.get(variant.messageId) ?? [];
		variants.push(variant);
		variantsByMessage.set(variant.messageId, variants);
	}

	const messagesByBundle = new Map<string, BundleNested["messages"]>();
	for (const message of snapshot.messages) {
		const messages = messagesByBundle.get(message.bundleId) ?? [];
		messages.push({
			...message,
			variants: variantsByMessage.get(message.id) ?? [],
		});
		messagesByBundle.set(message.bundleId, messages);
	}

	return snapshot.bundles.map((bundle) => ({
		...bundle,
		messages: messagesByBundle.get(bundle.id) ?? [],
	}));
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
