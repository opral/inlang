/** Account information retained by the inlang project API. */
export type Account = {
	id: string;
	name: string;
};

/** Compatibility shape for callers that seed project-scoped values. */
export type NewKeyValue = {
	key: string;
	value: unknown;
};
