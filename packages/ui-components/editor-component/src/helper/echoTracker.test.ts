import { expect, it } from "vitest";
import { ECHO_HISTORY, EchoTracker } from "./echoTracker.js";

it("treats echoes of emitted patterns as echoes and drops everything before them", () => {
	const tracker = new EchoTracker();
	for (const text of ["a", "ab", "abc"]) tracker.record(text);
	expect(tracker.consume("ab")).toBe(true);
	expect(tracker.consume("a")).toBe(false);
	expect(tracker.consume("abc")).toBe(true);
	expect(tracker.size).toBe(0);
});

it("does not take a text that was never emitted for an echo", () => {
	const tracker = new EchoTracker();
	tracker.record("a");
	expect(tracker.consume("b")).toBe(false);
	expect(tracker.size).toBe(1);
});

it("clear() forgets pending echoes", () => {
	const tracker = new EchoTracker();
	tracker.record("a");
	tracker.clear();
	expect(tracker.consume("a")).toBe(false);
});

it("still knows the first echo after a long burst of typing", () => {
	// typing faster than the host saves (a paste of 100 characters, one by one, before the first save returned)
	const tracker = new EchoTracker();
	const burst = Array.from({ length: 200 }, (_, i) => "x".repeat(i + 1));
	for (const text of burst) tracker.record(text);
	expect(tracker.consume(burst[0]!)).toBe(true);
	expect(tracker.consume(burst.at(-1)!)).toBe(true);
});

it("bounds its memory", () => {
	const tracker = new EchoTracker();
	for (let i = 0; i < ECHO_HISTORY + 50; i++) tracker.record(String(i));
	expect(tracker.size).toBe(ECHO_HISTORY);
	expect(tracker.consume("0")).toBe(false);
	expect(tracker.consume(String(ECHO_HISTORY + 49))).toBe(true);
});

it("receive() replaces the content only with a pattern that changed on the host's side", () => {
	const tracker = new EchoTracker();
	// the first pattern always replaces the (empty) content
	expect(tracker.receive("p0", undefined)).toBe("replace");
	// typed "p1" right after a new form was added; the host's save of the form passes p0 again
	tracker.record("p1");
	expect(tracker.receive("p0", "p1")).toBe("keep");
	// the save of the typing comes back: an echo
	expect(tracker.receive("p1", "p1")).toBe("keep");
	// someone else changed the pattern
	expect(tracker.receive("theirs", "p1")).toBe("replace");
	// after forgetting (an undo), the same pattern replaces the content again
	tracker.clear();
	expect(tracker.receive("theirs", "typed")).toBe("replace");
});

it("compares patterns structurally, so a store that reorders keys still echoes", () => {
	const tracker = new EchoTracker();
	const emitted = [{ type: "expression", arg: { type: "variable-reference", name: "count" } }];
	const stored = [{ arg: { name: "count", type: "variable-reference" }, type: "expression" }];
	expect(tracker.receive([], undefined)).toBe("replace");
	tracker.record(emitted);
	tracker.record([...emitted, { type: "text", value: " items" }]);
	expect(tracker.receive(stored, [...emitted, { type: "text", value: " items" }])).toBe("keep");
	expect(tracker.receive([{ value: " items", type: "text" }], [...emitted, { type: "text", value: " items" }])).toBe("replace");
});
