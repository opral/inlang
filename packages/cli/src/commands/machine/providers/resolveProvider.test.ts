import { afterEach, test, expect, vi } from "vitest";
import { resolveMachineTranslateProvider } from "./resolveProvider.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

test("uses google when its key is set and no provider is configured", () => {
  vi.stubEnv("INLANG_GOOGLE_TRANSLATE_API_KEY", "google-key");
  vi.stubEnv("INLANG_MACHINE_TRANSLATE_PROVIDER", "");

  const provider = resolveMachineTranslateProvider();
  expect(provider).toBeDefined();
});

test("falls back to the free demosjarco service when no keys are set", () => {
  vi.stubEnv("INLANG_MACHINE_TRANSLATE_PROVIDER", "");
  vi.stubEnv("INLANG_GOOGLE_TRANSLATE_API_KEY", "");
  vi.stubEnv("INLANG_DEEPL_API_KEY", "");

  const provider = resolveMachineTranslateProvider();
  expect(provider).toBeDefined();
});

test("uses the free demosjarco service when explicitly selected", () => {
  vi.stubEnv("INLANG_MACHINE_TRANSLATE_PROVIDER", "demosjarco");

  const provider = resolveMachineTranslateProvider();
  expect(provider).toBeDefined();
});

test("requires INLANG_GOOGLE_TRANSLATE_API_KEY for google provider", () => {
  vi.stubEnv("INLANG_MACHINE_TRANSLATE_PROVIDER", "google");
  vi.stubEnv("INLANG_GOOGLE_TRANSLATE_API_KEY", "");

  expect(() => resolveMachineTranslateProvider()).toThrow(
    "INLANG_GOOGLE_TRANSLATE_API_KEY must be set",
  );
});

test("requires INLANG_DEEPL_API_KEY for deepl provider", () => {
  vi.stubEnv("INLANG_MACHINE_TRANSLATE_PROVIDER", "deepl");
  vi.stubEnv("INLANG_DEEPL_API_KEY", "");

  expect(() => resolveMachineTranslateProvider()).toThrow(
    "INLANG_DEEPL_API_KEY must be set",
  );
});

test("rejects unsupported provider values", () => {
  vi.stubEnv("INLANG_MACHINE_TRANSLATE_PROVIDER", "azure");

  expect(() => resolveMachineTranslateProvider()).toThrow(
    'Unsupported INLANG_MACHINE_TRANSLATE_PROVIDER value: "azure"',
  );
});
