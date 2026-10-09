import { ENV_VARIABLES } from "../env-variables/index.js";

/**
 * List of telemetry events for typesafety.
 *
 * - prefix with `CLI` to avoid collisions with other apps
 * - use past tense to indicate that the event has been completed
 */
const events = [
  "CLI command executed",
  "CLI started",
  "CLI cloud interest",
] as const;

/**
 * Capture an event.
 *
 * - manually calling the PostHog API because the SDKs were not platform angostic (and generally bloated)
 */
export const capture = async (args: {
  event: (typeof events)[number];
  projectId?: string;
  properties: Record<string, any>;
}) => {
  // do not send events if the token is not set
  // (assuming this eases testing)
  if (ENV_VARIABLES.PUBLIC_POSTHOG_TOKEN === undefined) {
    return;
  }
  try {
    await fetch("https://eu.posthog.com/capture/", {
      method: "POST",
      body: JSON.stringify({
        // @ts-expect-error - env variable is set in build step
        api_key: ENV_DEFINED_IN_BUILD_STEP.PUBLIC_POSTHOG_TOKEN,
        event: args.event,
        // id is "unknown" because no user information is available
        distinct_id: "unknown",
        properties: {
          $groups: args.projectId ? { project: args.projectId } : undefined,
          ...args.properties,
        },
      }),
    });
  } catch (e) {
    // TODO implement sentry logging
    // do not console.log and avoid exposing internal errors to the user
  }
};
