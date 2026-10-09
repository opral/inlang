import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { capture } from "./capture.js";
import { isTelemetryDisabled } from "./isTelemetryDisabled.js";

vi.mock("../env-variables/index.js", () => ({
  ENV_VARIABLES: { PUBLIC_POSTHOG_TOKEN: "test-token", IS_PRODUCTION: false },
}));

const fetch = vi.fn(async () => new Response());

beforeEach(() => {
  vi.stubGlobal("fetch", fetch);
  vi.stubEnv("DO_NOT_TRACK", "");
  vi.stubEnv("INLANG_TELEMETRY", "");
});

afterEach(() => {
  fetch.mockClear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const event = {
  event: "CLI cloud viewed",
  properties: { json: true },
} as const;

test("sends the event with only the given properties", async () => {
  await capture(event);
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://eu.posthog.com/capture/");
  expect(JSON.parse(init.body as string)).toEqual({
    api_key: "test-token",
    event: "CLI cloud viewed",
    distinct_id: "unknown",
    properties: { json: true, $geoip_disable: true },
  });
});

test.each([
  ["DO_NOT_TRACK", "1"],
  ["DO_NOT_TRACK", "true"],
  ["INLANG_TELEMETRY", "off"],
  ["INLANG_TELEMETRY", "OFF"],
  ["INLANG_TELEMETRY", "0"],
  ["INLANG_TELEMETRY", "false"],
])("%s=%s sends nothing", async (name, value) => {
  vi.stubEnv(name, value);
  await capture(event);
  expect(fetch).not.toHaveBeenCalled();
});

test("telemetry stays on unless opted out", () => {
  expect(isTelemetryDisabled({})).toBe(false);
  expect(isTelemetryDisabled({ DO_NOT_TRACK: "" })).toBe(false);
  expect(isTelemetryDisabled({ DO_NOT_TRACK: "0" })).toBe(false);
  expect(isTelemetryDisabled({ DO_NOT_TRACK: "false" })).toBe(false);
  expect(isTelemetryDisabled({ INLANG_TELEMETRY: "on" })).toBe(false);
});
