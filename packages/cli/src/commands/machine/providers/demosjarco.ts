import type { MachineTranslateProvider, TranslateTextArgs } from "./types.js";

/**
 * A free, third-party hosted translation service used as the default fallback
 * when no BYOK provider is configured. It is community-run and is not owned,
 * operated, or maintained by inlang. It mirrors the Google Cloud Translation
 * v2 API surface, so the response shape matches the Google provider.
 *
 * @see https://translate.demosjarco.dev
 */
export const DEMOSJARCO_TRANSLATE_API_URL =
  "https://translate.demosjarco.dev/language/translate/v2";

const BYOK_URL = "https://inlang.com/m/2qj2w8pu/app-inlang-cli/byok";

/** Bounded so a hung request fails fast instead of stalling the whole run. */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Shown when the community-operated service at translate.demosjarco.dev can't
 * be reached, is throttling requests, or returns a response the CLI can't
 * parse. Points users at bringing their own API key instead.
 */
export const SERVICE_UNAVAILABLE_ERROR = [
  "The community-operated translation service at translate.demosjarco.dev is not available.",
  'Set INLANG_MACHINE_TRANSLATE_PROVIDER to "google" or "deepl" and provide your own API key.',
  `See ${BYOK_URL}`,
].join("\n");

export function createDemosjarcoTranslateProvider(
  model?: string,
  zdr?: boolean,
): MachineTranslateProvider {
  return {
    async translateText(args: TranslateTextArgs) {
      const query = new URLSearchParams({
        q: args.text,
        target: args.targetLocale,
        source: args.sourceLocale,
        // Matches the Google and DeepL providers: patterns are serialized with
        // placeholders wrapped in `<span class="notranslate">`, which only html
        // mode is guaranteed to leave untouched.
        format: "html",
      });

      // The service doesn't use API keys; an optional model can be pinned via
      // DEMOSJARCO_TRANSLATE_MODEL, otherwise the gateway-configured default is used.
      if (model && model.length > 0) {
        query.set("model", model);
      }

      // Opt-in Zero Data Retention: when enabled via DEMOSJARCO_TRANSLATE_ZDR, ask
      // the upstream service to run the request without retaining any data. The
      // value is a boolean serialized as a string literal, as the API expects.
      if (zdr) {
        query.set("zdr", "true");
      }

      let response: Response;
      try {
        response = await fetch(`${DEMOSJARCO_TRANSLATE_API_URL}?${query}`, {
          method: "POST",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        // Endpoint unreachable, timed out, or the service was shut down.
        return {
          ok: false,
          error: SERVICE_UNAVAILABLE_ERROR,
          unavailable: true,
        };
      }

      if (!response.ok) {
        // A server error, throttling, or a shutdown gateway all mean the
        // hosted service itself is unavailable, not a bad request.
        if (response.status >= 500 || response.status === 429) {
          return {
            ok: false,
            error: SERVICE_UNAVAILABLE_ERROR,
            unavailable: true,
          };
        }
        return {
          ok: false,
          error: `${response.status} ${response.statusText}: translating from ${args.sourceLocale} to ${args.targetLocale}`,
        };
      }

      let translatedText: unknown;
      try {
        const json = await response.json();
        translatedText = json?.data?.translations?.[0]?.translatedText;
      } catch {
        translatedText = undefined;
      }

      if (typeof translatedText !== "string") {
        // Malformed response body: treat the same as a service outage.
        return {
          ok: false,
          error: SERVICE_UNAVAILABLE_ERROR,
          unavailable: true,
        };
      }

      return { ok: true, translatedText };
    },
  };
}
