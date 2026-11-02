[![NPM Downloads](https://img.shields.io/npm/dw/%40inlang%2Fsdk?logo=npm&logoColor=red&label=npm%20downloads)](https://www.npmjs.com/package/@inlang/sdk)
[![GitHub Issues](https://img.shields.io/github/issues-closed/opral/inlang?logo=github&color=purple)](https://github.com/opral/inlang/issues)
[![Contributors](https://img.shields.io/github/contributors/opral/inlang?logo=github)](https://github.com/opral/inlang/graphs/contributors)
[![Discord](https://img.shields.io/discord/897438559458430986?logo=discord&logoColor=white&label=discord)](https://discord.gg/gdMPPWy57R)

<h1 align="center"><img src="https://github.com/opral/inlang/blob/main/assets/logo_rounded.png?raw=true" alt="inlang icon" height="32" align="absmiddle">&nbsp;inlang</h1>

<h3 align="center">The Git-based translation management system.</h3>

<p align="center">
  <a href="https://inlang.com/c/tools">Tools</a> ·
  <a href="https://inlang.com/c/plugins">Plugins</a> ·
  <a href="https://inlang.com/docs">Docs</a> ·
  <a href="https://discord.gg/gdMPPWy57R">Discord</a>
</p>

<p align="center">
  <sub>Used by teams at</sub><br/><br/>
  <a href="https://www.kraftheinz.com/"><img src="https://github.com/opral/inlang/blob/main/assets/used-by/kraft-heinz.png?raw=true" alt="Kraft Heinz" height="18"></a>&nbsp;&nbsp;
  <a href="https://www.bose.com/"><img src="https://github.com/opral/inlang/blob/main/assets/used-by/bose.svg?raw=true" alt="Bose" height="18"></a>&nbsp;&nbsp;
  <a href="https://www.disney.co.jp/"><img src="https://github.com/opral/inlang/blob/main/assets/used-by/disney.svg?raw=true" alt="Disney" height="18"></a>&nbsp;&nbsp;
  <a href="https://ethz.ch/de.html"><img src="https://github.com/opral/inlang/blob/main/assets/used-by/eth-zurich.svg?raw=true" alt="ETH Zurich" height="18"></a>&nbsp;&nbsp;
  <a href="https://brave.com/"><img src="https://github.com/opral/inlang/blob/main/assets/used-by/brave.svg?raw=true" alt="Brave" height="18"></a>&nbsp;&nbsp;
  <a href="https://www.michelin.com/"><img src="https://github.com/opral/inlang/blob/main/assets/used-by/michelin.svg?raw=true" alt="Michelin" height="18"></a>&nbsp;&nbsp;
  <a href="https://www.idealista.com/"><img src="https://github.com/opral/inlang/blob/main/assets/used-by/idealista.svg?raw=true" alt="idealista" height="18"></a>&nbsp;&nbsp;
  <a href="https://lovable.dev/"><img src="https://github.com/opral/inlang/blob/main/assets/used-by/lovable.svg?raw=true" alt="Lovable" height="18"></a>
</p>

---

inlang is an open-source translation management system (TMS) that lives in your Git repository. Translations are plain files in your repo. There is no server to host and no vendor database.

Your coding agent translates the files with your code as context, runs `inlang check`, fixes failures and opens a pull request. Translators edit in [Fink](https://fink.inlang.com), a web editor. You review the pull request.

## What is a translation management system?

A TMS stores an app's translations and manages how they are edited and reviewed. Most TMSs are hosted web apps. inlang keeps translations as files in your repo, where AI agents can read, edit and check them.

|                              | Hosted TMS                                                                        | inlang                                           |
| ---------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Who does the work**        | People work in the vendor's app. Agents use the vendor's API.                     | AI agents do the work. You review it.            |
| **Where translations live**  | In a vendor's database. The vendor keeps the main copy and syncs it to your repo. | In your Git repo. Plain files. Nothing to host.  |
| **How mistakes are caught**  | Reviewers proofread in the vendor app.                                            | `inlang check` finds errors. AI agents fix them. |
| **How changes are reviewed** | In a separate vendor app, apart from code review.                                 | In a pull request.                               |

## AI agents handle your translations, with guardrails

```text
you ask  →  agent translates  →  inlang check  →  you review
```

1. You ask your coding agent: "Add German."
2. The agent adds `de` to `locales` in `project.inlang/settings.json` and writes `messages/de.json`.
3. The agent runs the check and fixes every finding:

   ```bash
   npx @inlang/cli check --project ./project.inlang
   ```

4. CI runs the same check on the pull request. You review and merge.

The check exits with code 1 on findings. Use `--format json` for a machine-readable report. It finds missing and empty translations, missing variables, missing plural forms and unused messages (`--unused-messages --source ./src`). It checks structure, so you review the wording in the pull request.

Machine translation is optional. `npx @inlang/cli machine translate --project ./project.inlang` adds translations with a provider you configure. See the [CLI documentation](https://inlang.com/m/2qj2w8pu/app-inlang-cli) for provider setup.

## Translators edit in the browser

[Fink](https://fink.inlang.com) is a web editor for translators. They sign in with a free GitHub account and need no Git. Fink pushes changes to a branch, or to a fork without write access, and you review them in a pull request.

## Plugins for any translation format

Plugins import and export your translation files. Pick the plugin for your format, or write your own for a format that is missing.

- i18next
- next-intl
- ICU MessageFormat v1
- inlang message format (JSON, used by Paraglide JS)
- Android `strings.xml`
- Apple `.strings` and `.xcstrings`

See all [plugins](https://inlang.com/c/plugins). Each plugin page lists the settings key and `pathPattern` to add to `project.inlang/settings.json`.

## A tool for every localization need

The tools work on the same `project.inlang` folder in your repo.

| Tool                                                              | For                    |
| ----------------------------------------------------------------- | ---------------------- |
| [Fink](https://fink.inlang.com)                                   | Translators, web app   |
| [Sherlock](https://inlang.com/m/r7kp499g/app-inlang-ideExtension) | Developers, VS Code    |
| Parrot                                                            | Designers, Figma       |
| [Paraglide JS](https://paraglidejs.com)                           | Your app, i18n library |
| [inlang CLI](https://inlang.com/m/2qj2w8pu/app-inlang-cli)        | CI and coding agents   |
| [SDK](https://www.npmjs.com/package/@inlang/sdk)                  | Your own tools         |

```text
Fink · Sherlock · CLI · Paraglide · your own tool
                       │
                   inlang SDK
                       │
                .inlang project
                       │
                    plugins
                       │
          translation files in Git
```

An inlang project describes messages, variants, locales and settings. Plugins connect that model to the files your app uses. Tools use the [SDK](https://www.npmjs.com/package/@inlang/sdk) instead of each building its own parser and project model.

## When to use inlang

Use inlang if:

- Your app's text lives in your repo: i18next, next-intl, Paraglide JS, JSON, iOS or Android files.
- Developers and AI agents do most of the translation work.
- You want translation changes reviewed in pull requests and checked in CI.

Use Crowdin or Lokalise if:

- You manage agencies or freelancers in one tool.
- Your translators cannot use a GitHub account.
- Your text lives in a CMS, not in code.

## Get started

- New JavaScript or TypeScript app: `npx @inlang/paraglide-js@latest init` ([Paraglide JS](https://paraglidejs.com))
- Existing i18next project: `npx i18next-cli init --inlang`
- Other formats and next-intl: see the [plugins](https://inlang.com/c/plugins) and the [CLI documentation](https://inlang.com/m/2qj2w8pu/app-inlang-cli)
- Build your own tool with the [SDK](https://www.npmjs.com/package/@inlang/sdk)

## Contributing

Found a problem or have an idea? [Open an issue](https://github.com/opral/inlang/issues). To contribute code, see the [contributing guide](https://github.com/opral/inlang/blob/main/CONTRIBUTING.md).
