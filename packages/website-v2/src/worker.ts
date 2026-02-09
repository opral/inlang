import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { trackVisit } from "2027-track";

const handler = createStartHandler(defaultStreamHandler);

interface RequestWithCf extends Request {
  cf?: { country?: string; [key: string]: unknown };
}

export default {
  async fetch(
    request: Request,
    _env: unknown,
    ctx: { waitUntil: (promise: Promise<unknown>) => void },
  ): Promise<Response> {
    const url = new URL(request.url);

    // non-blocking: tracks AI agent visits without delaying the response
    ctx.waitUntil(
      trackVisit({
        host: url.hostname,
        path: url.pathname,
        userAgent: request.headers.get("user-agent") || "",
        accept: request.headers.get("accept") || "",
        country: (request as RequestWithCf).cf?.country,
      }).catch(() => {}),
    );

    return handler(request);
  },
};
