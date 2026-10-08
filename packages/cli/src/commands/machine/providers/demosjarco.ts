import type {
  MachineTranslateProvider,
  TranslateTextArgs,
  TranslateTextResult,
} from "./types.js";

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
export const REQUEST_TIMEOUT_MS = 20_000;

/**
 * The service runs on Cloudflare Workers, which allow at most 6 simultaneous
 * open connections per invocation. Every request fans out into upstream model
 * calls, so keeping the CLI to the same bound avoids bursting the service's
 * per-model rate limits on large projects.
 */
export const MAX_CONCURRENT_REQUESTS = 6;

/** Retries after the first attempt, so at most 3 attempts per translation. */
export const MAX_RETRIES = 2;

/**
 * Wait before the first retry, doubling for each retry after it (5s, 10s, ...).
 * With the request timeout this bounds a single translation to 3 x 20s
 * attempts plus 5s + 10s of waiting (75s).
 */
export const RETRY_BASE_DELAY_MS = 5_000;

/** How long to wait before the given retry (0-based). */
export function retryDelayMs(retry: number) {
  return RETRY_BASE_DELAY_MS * 2 ** retry;
}

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

type AttemptResult =
  | { done: true; result: TranslateTextResult }
  | { done: false };

export function createDemosjarcoTranslateProvider(
  model?: string,
  zdr?: boolean,
): MachineTranslateProvider {
  const limiter = createConcurrencyLimiter(MAX_CONCURRENT_REQUESTS);

  async function attempt(
    url: string,
    args: TranslateTextArgs,
  ): Promise<AttemptResult> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      // Endpoint unreachable, timed out, or the service was shut down.
      return { done: false };
    }

    if (!response.ok) {
      // fetch resolves when headers arrive. Close the unread body before the
      // limiter releases this slot, including for non-retryable client errors.
      try {
        await response.body?.cancel();
      } catch {
        // An aborted or already failed body needs no further cleanup.
      }
      // A server error, throttling, or a shutdown gateway all mean the
      // hosted service itself is unavailable, not a bad request.
      if (response.status >= 500 || response.status === 429) {
        return { done: false };
      }
      return {
        done: true,
        result: {
          ok: false,
          error: `${response.status} ${response.statusText}: translating from ${args.sourceLocale} to ${args.targetLocale}`,
        },
      };
    }

    let translatedText: unknown;
    try {
      const json = await response.json();
      translatedText = json?.data?.translations?.[0]?.translatedText;
    } catch (error) {
      // A body can time out or lose its connection after fetch has resolved.
      // Retry those failures, but not a complete body containing invalid JSON.
      if (!(error instanceof SyntaxError)) {
        return { done: false };
      }
      translatedText = undefined;
    }

    if (typeof translatedText !== "string") {
      // Malformed response body: treat the same as a service outage.
      return {
        done: true,
        result: {
          ok: false,
          error: SERVICE_UNAVAILABLE_ERROR,
          unavailable: true,
        },
      };
    }

    return { done: true, result: { ok: true, translatedText } };
  }

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

      const url = `${DEMOSJARCO_TRANSLATE_API_URL}?${query}`;

      for (let retry = 0; retry <= MAX_RETRIES; retry++) {
        // The concurrency slot is only held while a request is in flight, not
        // while backing off, so waiting retries don't block fresh requests.
        const outcome = await limiter(() => attempt(url, args));
        if (outcome.done) {
          return outcome.result;
        }
        if (retry < MAX_RETRIES) {
          await sleep(retryDelayMs(retry));
        }
      }

      return {
        ok: false,
        error: SERVICE_UNAVAILABLE_ERROR,
        unavailable: true,
      };
    },
  };
}

/** Runs at most `limit` tasks at once; the rest wait in FIFO order. */
function createConcurrencyLimiter(limit: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= limit) {
      await new Promise<void>((resolve) => queue.push(resolve));
    } else {
      active++;
    }

    try {
      return await task();
    } finally {
      // Hand the slot straight to the next waiter, or free it.
      const next = queue.shift();
      if (next) {
        next();
      } else {
        active--;
      }
    }
  };
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
