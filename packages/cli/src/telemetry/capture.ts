import { ENV_VARIABLES } from "../env-variables/index.js";
import { isTelemetryDisabled } from "./isTelemetryDisabled.js";

/**
 * List of telemetry events for typesafety.
 *
 * - prefix with `CLI` to avoid collisions with other apps
 * - use past tense to indicate that the event has been completed
 */
const events = [
  "CLI command executed",
  "CLI started",
  "CLI cloud viewed",
] as const;

/**
 * Capture an event.
 *
 * - manually calling the PostHog API because the SDKs were not platform angostic (and generally bloated)
 * - never pass anything the user typed or that identifies them: no flag
 *   values, paths, globs, locales, file names or message keys
 * - nothing is sent if the user opted out, see {@link isTelemetryDisabled}
 */
export const capture = async (args: {
  event: (typeof events)[number];
  properties: Record<string, any>;
}) => {
  // do not send events if the token is not set
  // (assuming this eases testing)
  if (ENV_VARIABLES.PUBLIC_POSTHOG_TOKEN === undefined) {
    return;
  }
  if (isTelemetryDisabled()) {
    return;
  }
  try {
    await fetch("https://eu.posthog.com/capture/", {
      method: "POST",
      // never hold up the command's exit on a slow network
      signal: AbortSignal.timeout(1500),
      body: JSON.stringify({
        api_key: ENV_VARIABLES.PUBLIC_POSTHOG_TOKEN,
        event: args.event,
        // id is "unknown" because no user information is available
        distinct_id: "unknown",
        properties: {
          ...args.properties,
          // don't resolve the request's IP to a location
          $geoip_disable: true,
        },
      }),
    });
  } catch (e) {
    // TODO implement sentry logging
    // do not console.log and avoid exposing internal errors to the user
  }
};
