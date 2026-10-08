import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isPosthogProxyRequest,
  posthogTargetUrl,
  proxyPosthog,
} from "./posthogProxy";

describe("posthog proxy", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("only handles /relay and paths below it", () => {
    expect(isPosthogProxyRequest(new URL("https://inlang.com/relay/i/v0/e/"))).toBe(true);
    expect(isPosthogProxyRequest(new URL("https://inlang.com/relay"))).toBe(true);
    expect(isPosthogProxyRequest(new URL("https://inlang.com/relayed-post"))).toBe(false);
    expect(isPosthogProxyRequest(new URL("https://inlang.com/blog"))).toBe(false);
  });

  it("sends events to the API host and static files to the asset host", () => {
    expect(posthogTargetUrl(new URL("https://inlang.com/relay/i/v0/e/?ip=1")).toString()).toBe(
      "https://us.i.posthog.com/i/v0/e/?ip=1",
    );
    expect(posthogTargetUrl(new URL("https://inlang.com/relay/static/array.js")).toString()).toBe(
      "https://us-assets.i.posthog.com/static/array.js",
    );
    expect(posthogTargetUrl(new URL("https://inlang.com/relay/array/phc_x/config")).toString()).toBe(
      "https://us-assets.i.posthog.com/array/phc_x/config",
    );
  });

  it("forwards the body and the visitor IP, drops cookies", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await proxyPosthog(
      new Request("https://inlang.com/relay/i/v0/e/", {
        method: "POST",
        body: '{"event":"app:session_start"}',
        headers: { cookie: "a=b", "cf-connecting-ip": "203.0.113.7", "content-type": "application/json" },
      }),
    );

    const [target, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(target.toString()).toBe("https://us.i.posthog.com/i/v0/e/");
    const headers = new Headers(init.headers);
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("x-forwarded-for")).toBe("203.0.113.7");
    expect(await new Response(init.body).text()).toBe('{"event":"app:session_start"}');
  });
});
