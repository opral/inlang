/**
 * Remembers the patterns an editor emitted so that a host that saves asynchronously can pass them
 * back one by one while the user keeps typing: those echoes are older than the content and must not
 * replace it.
 *
 * The history is long enough for a save that takes seconds while typing fast; it only exists to
 * bound the memory of a host that never passes anything back.
 */
export const ECHO_HISTORY = 1000;

export class EchoTracker {
	private emitted: string[] = [];
	/** The pattern the host passed last. */
	private received?: string;

	/** The editor emitted this pattern (serialized). */
	record(pattern: string) {
		this.emitted.push(pattern);
		if (this.emitted.length > ECHO_HISTORY)
			this.emitted.splice(0, this.emitted.length - ECHO_HISTORY);
	}

	/**
	 * `true` if `incoming` is an echo of an emitted pattern: it and everything emitted before it are
	 * dropped (hosts pass echoes back in order, merged ones may be skipped).
	 */
	consume(incoming: string): boolean {
		const index = this.emitted.indexOf(incoming);
		if (index === -1) return false;
		this.emitted.splice(0, index + 1);
		return true;
	}

	/**
	 * A pattern the host passed in, given the editor's content (`undefined` before the first one):
	 * "replace" the content with it, or "keep" the content. Kept are echoes (see `consume`) and the
	 * same pattern as last time: hosts with immutable snapshots pass a fresh copy whenever anything
	 * else changes, e.g. while a new form is still being saved, and that must not undo typing.
	 */
	receive(incoming: string, content: string | undefined): "replace" | "keep" {
		const unchanged = incoming === this.received;
		this.received = incoming;
		if (content === undefined) return "replace";
		if (this.consume(incoming) || unchanged || incoming === content)
			return "keep";
		this.emitted = [];
		return "replace";
	}

	/** Forget emitted and received patterns, so the next pattern passed in replaces the content. */
	clear() {
		this.emitted = [];
		this.received = undefined;
	}

	get size() {
		return this.emitted.length;
	}
}
