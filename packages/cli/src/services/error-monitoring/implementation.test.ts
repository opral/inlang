import { afterEach, expect, test, vi } from "vitest";
import * as Sentry from "@sentry/node";
import { initErrorMonitoring } from "./implementation.js";

vi.mock("@sentry/node", () => ({ init: vi.fn(), captureException: vi.fn() }));

afterEach(() => {
  vi.mocked(Sentry.init).mockClear();
  vi.unstubAllEnvs();
});

test("reports errors without the hostname, breadcrumbs or session pings", () => {
  vi.stubEnv("DO_NOT_TRACK", "");
  vi.stubEnv("INLANG_TELEMETRY", "");
  initErrorMonitoring();
  expect(Sentry.init).toHaveBeenCalledWith(
    expect.objectContaining({
      serverName: "unknown",
      autoSessionTracking: false,
      beforeBreadcrumb: expect.any(Function),
      beforeSend: expect.any(Function),
    }),
  );
});

test.each([
  ["DO_NOT_TRACK", "1"],
  ["INLANG_TELEMETRY", "off"],
])("%s=%s turns off error reports", (name, value) => {
  vi.stubEnv(name, value);
  initErrorMonitoring();
  expect(Sentry.init).not.toHaveBeenCalled();
});
