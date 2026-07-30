import { log } from "../../../utilities/log.js";
import { createDeepLTranslateProvider } from "./deepl.js";
import { createGoogleTranslateProvider } from "./google.js";
import { createDemosjarcoTranslateProvider } from "./demosjarco.js";
import type { MachineTranslateProvider } from "./types.js";

export const PROVIDER_ENV = "INLANG_MACHINE_TRANSLATE_PROVIDER";
export const GOOGLE_API_KEY_ENV = "INLANG_GOOGLE_TRANSLATE_API_KEY";
export const DEEPL_API_KEY_ENV = "INLANG_DEEPL_API_KEY";
export const DEMOSJARCO_MODEL_ENV = "DEMOSJARCO_TRANSLATE_MODEL";
export const DEMOSJARCO_ZDR_ENV = "DEMOSJARCO_TRANSLATE_ZDR";

export type MachineTranslateProviderName = "google" | "deepl" | "demosjarco";

const BYOK_URL = "https://inlang.com/m/2qj2w8pu/app-inlang-cli/byok";
const DEEPL_DOCS_URL =
  "https://developers.deepl.com/docs/getting-started/quickstart";

/**
 * Determines which provider to use.
 *
 * When `INLANG_MACHINE_TRANSLATE_PROVIDER` is set, that provider is used. When
 * it is unset, an already-configured BYOK provider (Google or DeepL) is used if
 * its API key is present; otherwise the CLI falls back to a free, third-party,
 * community-operated translation service at translate.demosjarco.dev that is
 * not owned, operated, or maintained by inlang.
 */
function resolveMachineTranslateProviderName(): MachineTranslateProviderName {
  const rawProvider = process.env[PROVIDER_ENV]?.trim();

  if (rawProvider && rawProvider.length > 0) {
    const providerName = rawProvider.toLowerCase();
    if (
      providerName !== "google" &&
      providerName !== "deepl" &&
      providerName !== "demosjarco"
    ) {
      throw new Error(
        [
          `Unsupported ${PROVIDER_ENV} value: "${process.env[PROVIDER_ENV]}".`,
          "Supported values: google, deepl, demosjarco.",
        ].join("\n"),
      );
    }
    return providerName;
  }

  // No provider configured: prefer a BYOK provider whose key is already set,
  // otherwise fall back to the free, community-operated translation service.
  if (process.env[GOOGLE_API_KEY_ENV]) {
    return "google";
  }
  if (process.env[DEEPL_API_KEY_ENV]) {
    return "deepl";
  }
  return "demosjarco";
}

export function resolveMachineTranslateProvider(): MachineTranslateProvider {
  const providerName = resolveMachineTranslateProviderName();

  if (providerName === "demosjarco") {
    log.warn(
      [
        "Using the community-operated translation service at translate.demosjarco.dev. Stability is not guaranteed.",
        "This service is not owned, operated, or maintained by inlang.",
        "Provide your own API key for higher reliability and control.",
        `Set ${PROVIDER_ENV} to "google" or "deepl" and the matching API key to use your own provider.`,
        `See ${BYOK_URL}`,
      ].join("\n"),
    );
    // Scoped to the free service only: opt in to Zero Data Retention upstream.
    const zdr =
      process.env[DEMOSJARCO_ZDR_ENV]?.trim().toLowerCase() === "true";
    return createDemosjarcoTranslateProvider(
      process.env[DEMOSJARCO_MODEL_ENV],
      zdr,
    );
  }

  if (providerName === "deepl") {
    const apiKey = process.env[DEEPL_API_KEY_ENV];
    if (!apiKey) {
      throw new Error(
        [
          `${DEEPL_API_KEY_ENV} must be set to use machine translate with DeepL.`,
          "Create your own DeepL API key and export it before running this command.",
          `See ${DEEPL_DOCS_URL}`,
          `See ${BYOK_URL}`,
        ].join("\n"),
      );
    }
    return createDeepLTranslateProvider(apiKey);
  }

  const apiKey = process.env[GOOGLE_API_KEY_ENV];
  if (!apiKey) {
    throw new Error(
      [
        `${GOOGLE_API_KEY_ENV} must be set to use machine translate.`,
        "Create your own Google Cloud Translation API key and export it before running this command.",
        `See ${BYOK_URL}`,
      ].join("\n"),
    );
  }
  return createGoogleTranslateProvider(apiKey);
}
