import { Kysely } from "kysely";
import type { Lix } from "@lix-js/sdk";
import type { InlangDatabaseSchema } from "./schema.js";
import { LixDialect } from "./lixDialect.js";

export function initDb(args: { lix: Lix }) {
	return new Kysely<InlangDatabaseSchema>({
		dialect: new LixDialect(args.lix),
	});
}
