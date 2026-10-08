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

	clear() {
		this.emitted = [];
	}

	get size() {
		return this.emitted.length;
	}
}
