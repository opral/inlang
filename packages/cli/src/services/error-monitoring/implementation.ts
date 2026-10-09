import * as Sentry from "@sentry/node";
import os from "node:os";
import { version } from "../../../package.json";
import { ENV_VARIABLES } from "../../env-variables/index.js";
import { isTelemetryDisabled } from "../../telemetry/isTelemetryDisabled.js";
import { scrubEvent } from "./scrubEvent.js";

export function initErrorMonitoring() {
  // DO_NOT_TRACK=1 and INLANG_TELEMETRY=off turn off error reports too
  if (isTelemetryDisabled()) return;
  Sentry.init({
    dsn: "https://b7a06c6d36454ef2bc5e2ca7e257bd5b@o4504345873285120.ingest.sentry.io/4505172745650176",
    release: version,
    // Not interested in performance data
    tracesSampleRate: 0,
    // no usage ping (release health session) on every run
    autoSessionTracking: false,
    environment: ENV_VARIABLES.IS_PRODUCTION ? "production" : "development",
    // the hostname is the default server name
    serverName: "unknown",
    // breadcrumbs record console output, which contains paths and messages
    beforeBreadcrumb: () => null,
    beforeSend: (event) =>
      scrubEvent(event, { home: os.homedir(), cwd: process.cwd() }),
  });
}

export const captureException = Sentry.captureException;
