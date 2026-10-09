/**
 * Whether the user opted out of telemetry and error reporting.
 *
 * - `DO_NOT_TRACK=1` (https://consoledonottrack.com): any value except `0` or `false`
 * - `INLANG_TELEMETRY=off` (also `0`, `false` or `disabled`)
 */
export function isTelemetryDisabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const doNotTrack = env.DO_NOT_TRACK?.trim().toLowerCase();
  if (doNotTrack && doNotTrack !== "0" && doNotTrack !== "false") return true;
  const inlangTelemetry = env.INLANG_TELEMETRY?.trim().toLowerCase();
  return (
    inlangTelemetry === "off" ||
    inlangTelemetry === "0" ||
    inlangTelemetry === "false" ||
    inlangTelemetry === "disabled"
  );
}
