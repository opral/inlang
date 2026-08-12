import { Kysely } from "kysely";
import type { JsonValue, Lix } from "@lix-js/sdk";
import { LixDialect } from "../database/lixDialect.js";

type LixFile = {
	path: string;
	content: Uint8Array;
};

type KeyValue = {
	key: string;
	value: JsonValue;
};

type Account = {
	id: string;
	name: string;
	kind: "human" | "agent" | "service" | "system" | "anonymous";
	status: "active" | "disabled";
};

export type InlangLix = Lix & {
	db: Kysely<{
		file: LixFile;
		key_value: KeyValue;
		account: Account;
	}>;
};

export function withInlangLixDb(args: { lix: Lix }): InlangLix {
	const lix = args.lix as InlangLix;
	Object.defineProperty(lix, "db", {
		configurable: true,
		enumerable: true,
		value: new Kysely({ dialect: new LixDialect(args.lix) }),
	});
	return lix;
}
