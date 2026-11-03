---
title: BYOK
description: Set your own Google Cloud Translation, DeepL API, or OpenAI key for machine translations with the inlang CLI.
---

# Bring Your Own Translation API Key

By default, the `machine translate` command uses a free, third-party translation service that is not owned, operated, or maintained by inlang. For higher reliability and control, you can bring your own Google Cloud Translation, DeepL API, or OpenAI key. Choose a provider with `INLANG_MACHINE_TRANSLATE_PROVIDER` and set the matching API key environment variable before running the command.

For many projects, coding agents can produce better translation drafts than generic machine translation because they can use surrounding product and code context. Consider using an agent-driven workflow when translation quality matters more than fully automated CI output.

## Provider selection

Set `INLANG_MACHINE_TRANSLATE_PROVIDER` to choose the translation service:

| Provider                                                                     | Env var                                        | API key env var                   |
| ---------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------- |
| Community-operated translation service at translate.demosjarco.dev (default) | `demosjarco` or unset (when no API key is set) | none                              |
| Google Translate                                                             | `google`                                       | `INLANG_GOOGLE_TRANSLATE_API_KEY` |
| DeepL                                                                        | `deepl`                                        | `INLANG_DEEPL_API_KEY`            |
| OpenAI                                                                       | `openai`                                       | `INLANG_OPENAI_API_KEY`           |

When `INLANG_MACHINE_TRANSLATE_PROVIDER` is unset, the CLI uses Google, DeepL, or OpenAI if the matching API key is set, and otherwise falls back to the community-operated translation service at translate.demosjarco.dev. If multiple keys are set, Google takes precedence over DeepL, which takes precedence over OpenAI.

## Community-operated translation service

The free service at [translate.demosjarco.dev](https://translate.demosjarco.dev) is used by default when no API key is configured. It is a community-run, third-party service — it is not owned, operated, or maintained by inlang. It requires no setup and no API key:

```bash
npx @inlang/cli machine translate --project ./project.inlang
```

Stability is not guaranteed and the service may be unavailable at any time. Provide your own API key for higher reliability and control. If the service is unreachable, throttling requests, or returns a response the CLI can't parse, the command fails with a non-zero exit code and tells you how to switch to your own provider.

You can optionally pin a specific model with `DEMOSJARCO_TRANSLATE_MODEL`. When unset, the service picks its default model.

```bash
export DEMOSJARCO_TRANSLATE_MODEL="@cf/google/gemma-4-26b-a4b-it"
```

You can also opt in to Zero Data Retention (ZDR) with `DEMOSJARCO_TRANSLATE_ZDR`. When set to `true`, the CLI asks the service to process your request without retaining any data. This applies only to the community-operated service and has no effect on the Google, DeepL, or OpenAI providers.

```bash
export DEMOSJARCO_TRANSLATE_ZDR="true"
```

## Google Translate setup

### 1. Create a Google Cloud project

Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a new project, or select an existing one.

### 2. Enable the Cloud Translation API

Enable the **Cloud Translation API (Basic)** for your project. The CLI uses the v2 REST API.

Follow the [Cloud Translation setup guide](https://cloud.google.com/translate/docs/setup) for detailed instructions.

### 3. Generate an API key

1. In the Google Cloud Console, go to **APIs & Services > Credentials**
2. Click **Create Credentials** and select **API key**
3. Copy the generated key

### 4. Set the environment variables

```bash
export INLANG_MACHINE_TRANSLATE_PROVIDER="google"
export INLANG_GOOGLE_TRANSLATE_API_KEY="your-google-api-key"
```

To make this permanent, add it to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.):

```bash
echo 'export INLANG_MACHINE_TRANSLATE_PROVIDER="google"' >> ~/.bashrc
echo 'export INLANG_GOOGLE_TRANSLATE_API_KEY="your-google-api-key"' >> ~/.bashrc
source ~/.bashrc
```

For CI/CD pipelines, add the key as a secret environment variable in your CI provider's settings.

## DeepL setup

### 1. Create a DeepL API account

Sign up for a [DeepL API plan](https://www.deepl.com/pro#developer) (Free or Pro).

### 2. Generate an API key

Copy your API key from the DeepL account dashboard. Free API keys end with `:fx` and use the `api-free.deepl.com` endpoint automatically.

### 3. Set the environment variables

```bash
export INLANG_MACHINE_TRANSLATE_PROVIDER="deepl"
export INLANG_DEEPL_API_KEY="your-deepl-api-key"
```

To make this permanent, add it to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.):

```bash
echo 'export INLANG_MACHINE_TRANSLATE_PROVIDER="deepl"' >> ~/.bashrc
echo 'export INLANG_DEEPL_API_KEY="your-deepl-api-key"' >> ~/.bashrc
source ~/.bashrc
```

For CI/CD pipelines, add both variables as secrets in your CI provider's settings.

See the [DeepL API quickstart](https://developers.deepl.com/docs/getting-started/quickstart) for more details.

## OpenAI setup

Set your OpenAI API key. You can optionally choose a model and reasoning effort. If no model is configured, the CLI uses `gpt-6-luna`. If no reasoning effort is configured, the CLI omits the `reasoning` setting and lets the model use its default.

```bash
export INLANG_MACHINE_TRANSLATE_PROVIDER="openai"
export INLANG_OPENAI_API_KEY="your-openai-api-key"
# Optional: defaults to gpt-6-luna
export INLANG_OPENAI_MODEL="your-model"
# Optional: supported values depend on the selected model
export INLANG_OPENAI_REASONING_EFFORT="none"
```

`INLANG_OPENAI_REASONING_EFFORT` is sent as the Responses API `reasoning.effort` value; supported values depend on the selected model (commonly `none`, `minimal`, `low`, `medium`, or `high`). Only set it to a value supported by your model. The CLI sends requests directly to the OpenAI Responses API using `fetch`; it does not require the OpenAI SDK.

OpenAI throttling (HTTP 429) or an incomplete Responses API result causes the translation command to fail with a non-zero exit code rather than silently reporting success or accepting partial text.

## Usage

Once the environment variables are set, run machine translate:

```bash
npx @inlang/cli machine translate --project ./project.inlang
```

## Contextual descriptions

Machine translation can use per-message descriptions as additional context with OpenAI and DeepL. Configure `translationDescriptors` in `project.inlang/settings.json`; its path is relative to the project root (the directory containing `project.inlang`), not relative to the settings file:

```json
{
  "translationDescriptors": "./descriptors.yml"
}
```

The SDK-native YAML format maps exact inlang bundle IDs to descriptions:

```yaml
"misc:port":
  description: in computing
```

An i18n-ally review file is also accepted. It uses `<namespace>.<key>` entries nested under `reviews`; the parser converts the first dot to `:` for the inlang bundle ID:

```yaml
reviews:
  misc.port:
    description: in computing
```

Google Translate and the default community-operated provider do not support contextual descriptions. The CLI warns and proceeds without them when either provider is selected.
