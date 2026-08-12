import { Kysely } from "kysely";
import type { Lix } from "@lix-js/sdk";
import { LixDialect } from "../database/lixDialect.js";
import type { Account } from "./compat.js";

type LixFile = {
	path: string;
	content: Uint8Array;
};

type KeyValue = {
	key: string;
	value: string;
};

export type InlangLix = Lix & {
	db: Kysely<{
		file: LixFile;
		key_value: KeyValue;
		active_account: Account;
	}>;
};

export async function withInlangLixDb(args: {
	lix: Lix;
	projectId: string;
	account?: Account;
}): Promise<InlangLix> {
	await args.lix.execute(
		"INSERT INTO inlang_key_value (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
		["lix_id", args.projectId]
	);
	if (args.account) {
		await args.lix.execute("DELETE FROM inlang_active_account");
		await args.lix.execute(
			"INSERT INTO inlang_active_account (id, name) VALUES ($1, $2)",
			[args.account.id, args.account.name]
		);
	}
	const lix = args.lix as InlangLix;
	Object.defineProperty(lix, "db", {
		configurable: true,
		enumerable: true,
		value: new Kysely({ dialect: new LixDialect(args.lix) }),
	});
	return lix;
}
