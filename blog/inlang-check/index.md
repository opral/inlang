---
og:title: "inlang check: find missing translations and unused keys in CI"
og:description: "Checks are now in the inlang CLI. Find missing translations, wrong variables and unused messages in i18next, next-intl and Paraglide JS projects."
og:type: article
---

# inlang check: find missing translations and unused keys in CI

`inlang check` is now in the inlang CLI. It finds missing translations, wrong variables and unused messages. It works in your terminal and in CI.

```sh
npx @inlang/cli check --project ./project.inlang
```

The feature request ["introduce checks"](https://github.com/opral/inlang/issues/4472) was open for almost 20 months and got 96 upvotes. This post shows what it finds and how it works with Paraglide JS, i18next and next-intl.

## What checks do

A check reads your translation files and tells you what is wrong. Nothing is changed. If a check finds a problem, the command exits with code `1` and your CI fails.

This is the output for a small project:

```
Checked project.inlang · 7 messages · locales en-US, pt-BR · 2 source files in ./

missing-translation (1)
  welcome_back  pt-BR  no translation

missing-variable (2)
  cart_items  pt-BR  missing {count} (countPlural=other)
  greeting    pt-BR  missing {name}

3 findings
  missing-translation  1
  missing-variable     2
```

## What `inlang check` finds

All checks run by default. You can run only some of them with flags.

| Problem | Flag |
| --- | --- |
| A message has no translation for a language | `--missing-translations` |
| A translation is empty | `--empty-translations` |
| One plural or select form is empty | `--empty-variants` |
| A translation forgot a variable such as `{name}` | `--missing-variables` |
| A translation uses a variable that does not exist, for example a typo like `{totl}` | `--unknown-variables` |
| A translation forgot a markup tag | `--missing-markup` |
| A language needs a plural form that is missing (Russian needs `one`, `few`, `many`, `other`) | `--missing-variants` |
| A translation cannot choose by an input the source language chooses by | `--missing-selectors` |
| A message is not used in your code | `--unused-messages` |

The checks know plural rules. German does not need a `zero` form. Latvian does. You do not have to configure this.

## Works with Paraglide JS, i18next and next-intl

`inlang check` reads your translations through an inlang plugin. Any project that has a plugin can be checked.

| Check | Paraglide JS | i18next | next-intl |
| --- | :---: | :---: | :---: |
| Missing and empty translations | yes | yes | yes |
| Missing or unknown variables and markup | yes | yes | yes |
| Missing plural and select forms | yes | yes | yes |
| Unused messages | yes | yes | yes |

Unused messages need a plugin that can read your source code. Paraglide JS, i18next and next-intl all have one. ICU message format and plain JSON projects get every other check.

Other formats, such as ICU message format and plain JSON, work for the translation checks too.

## Find unused translation keys

Old keys stay in your translation files after a refactor. They cost money when you pay for translation. They also confuse translators.

```sh
npx @inlang/cli check --project ./project.inlang --unused-messages --source ./src
```

```
unused-message (2)
  legacy_banner
  password_label
```

`check` reads your source code and looks for every use of a message. It only reports a message as unused when it can find **every** use in your code. A key built at runtime, like `` t(`items.${id}`) ``, makes this impossible. So do i18next options that change which keys are read, such as `keyPrefix` and `returnObjects`. In that case `check` shows you the file and line instead of guessing. We chose this on purpose. A wrong "unused" report deletes a real translation.

Unused messages work with:

- **Paraglide JS**: `m.message_key()`. Needs `@inlang/plugin-m-function-matcher` 2.3.0 or later.
- **i18next**: `t("key")`, `i18n.t("key")` and `<Trans i18nKey="key">`, with namespaces, plurals and context. Needs `@inlang/plugin-i18next` 6.5.0 or later.
- **next-intl**: `useTranslations` and `getTranslations`. Needs `@inlang/plugin-next-intl` 2.4.0 or later.

## Use it in GitHub Actions

```yaml
name: i18n
on: pull_request
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx @inlang/cli check --project ./project.inlang --locales de,fr
```

`--locales de,fr` reports only the languages you ship. A language you are still translating will not fail the build.

For other tools, use `--format json`. The report has a `version` field, so scripts and editors can depend on it.

## Why coding agents need checks

An agent that edits your translation files can make mistakes. It can forget a variable or skip a language. A check finds this right away, and the agent can fix it without a human in the loop.

That was one of the reasons for the feature request. The `README.md` that inlang writes into every project folder now tells agents to run `inlang check`.

## What changed in the CLI

| Before | Now |
| --- | --- |
| `inlang validate` checked settings only | `inlang check` checks settings, translations and unused messages |
| `inlang lint` did nothing (the v1 lint rules were removed in the v2 rewrite) | `inlang check` |

`validate` and `lint` still work. They print a deprecation warning, and `lint` still exits with `0` so old scripts do not break. Both are hidden from `--help`.

## Try it

```sh
npx @inlang/cli check --project ./project.inlang
```

- [CLI documentation](https://inlang.com/m/2qj2w8pu/app-inlang-cli)
- [Checks API for tool builders](https://github.com/opral/inlang/blob/main/packages/sdk/docs/checks.md)
- [GitHub issue #4472](https://github.com/opral/inlang/issues/4472)

Missing a check? [Open an issue](https://github.com/opral/inlang/issues/new). The checks you ask for are the checks we build.
