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
