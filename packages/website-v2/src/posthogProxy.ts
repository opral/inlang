/**
 * Reverse proxy for PostHog: apps (Parrot, Fink, Sherlock, Paraglide JS) send their telemetry to
 * https://inlang.com/relay/… and only need inlang.com on their network allowlist.
 *
 * The path is deliberately not "posthog", "analytics" or "ingest", which ad blockers block.
 * See https://posthog.com/docs/advanced/proxy/cloudflare
 */
export const POSTHOG_PROXY_PATH = "/relay";

const API_HOST = "us.i.posthog.com";
const ASSET_HOST = "us-assets.i.posthog.com";

export function isPosthogProxyRequest(url: URL) {
  return (
    url.pathname === POSTHOG_PROXY_PATH ||
    url.pathname.startsWith(`${POSTHOG_PROXY_PATH}/`)
  );
}

/** The PostHog URL a proxied request goes to: static files and remote config come from the asset host. */
export function posthogTargetUrl(url: URL) {
  const path = url.pathname.slice(POSTHOG_PROXY_PATH.length) || "/";
  const host =
    path.startsWith("/static/") || path.startsWith("/array/")
      ? ASSET_HOST
      : API_HOST;
  return new URL(`${path}${url.search}`, `https://${host}`);
}

export async function proxyPosthog(request: Request): Promise<Response> {
  const target = posthogTargetUrl(new URL(request.url));

  const headers = new Headers(request.headers);
  // inlang.com cookies are none of PostHog's business
  headers.delete("cookie");
  // keep the visitor's IP for PostHog's GeoIP lookup instead of the worker's
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) headers.set("x-forwarded-for", ip);

  return fetch(target, {
    method: request.method,
    headers,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : request.body,
    redirect: "manual",
  });
}
