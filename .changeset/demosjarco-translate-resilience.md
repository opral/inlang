---
"@inlang/cli": patch
---

Make `machine translate` resilient on large projects when using the community-operated service at translate.demosjarco.dev.

- Requests to the service are limited to 6 in flight, matching the Cloudflare Workers per-invocation connection limit, instead of firing every bundle at once. Google and DeepL are unaffected.
- Each request to the service now times out after 20 seconds instead of 15, leaving room for slower models and gateway fallbacks.
- Throttled (429), server-error (5xx), timed-out and network-failed requests are retried up to 2 times (3 attempts total), waiting 5 seconds before the first retry and doubling the wait for each retry after it.
- When the service is still unavailable for some translations, only those translations are skipped: every translation that succeeded is saved, and the command fails once with a single summary error instead of discarding the whole run.
