---
"@inlang/cli": minor
---

Add OpenAI as a provider for machine translation.

Setting `INLANG_MACHINE_TRANSLATE_PROVIDER` to "openai" now allows machine translation through openai Responses API ("/v1/response" endpoint).
You need to provide a key with the `INLANG_OPENAI_API_KEY` env.

The model/agent and reasoning effort can be optionally provided by the `INLANG_OPENAI_MODEL` and `INLANG_OPENAI_REASONING_EFFORT` envs. If unspecified, the default model is "gpt-6-luna".
