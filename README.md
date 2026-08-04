[![NPM Downloads](https://img.shields.io/npm/dw/%40inlang%2Fsdk?logo=npm&logoColor=red&label=npm%20downloads)](https://www.npmjs.com/package/@inlang/sdk)
[![GitHub Issues](https://img.shields.io/github/issues-closed/opral/inlang?logo=github&color=purple)](https://github.com/opral/inlang/issues)
[![Contributors](https://img.shields.io/github/contributors/opral/inlang?logo=github)](https://github.com/opral/inlang/graphs/contributors)
[![Discord](https://img.shields.io/discord/897438559458430986?logo=discord&logoColor=white&label=discord)](https://discord.gg/gdMPPWy57R)

<h1 align="center"><img src="https://github.com/opral/inlang/blob/main/assets/logo_rounded.png?raw=true" alt="inlang icon" height="32" align="absmiddle">&nbsp;inlang</h1>

<h3 align="center">
  The open format TMS (translation management system)
</h3>

  <p align="center">
    <br>
    <a href='https://inlang.com/c/apps' target="_blank">🕹️ Apps</a>
    ·
    <a href='https://inlang.com/documentation' target="_blank">📄 Docs</a>
    ·
    <a href='https://discord.gg/gdMPPWy57R' target="_blank">💙 Discord</a>
    ·
    <a href='https://twitter.com/inlangHQ' target="_blank">𝕏 Twitter</a>
  </p>
</p>

<br>

<p align="center">
  <a href="https://github.com/opral/inlang"><strong>1.9k+</strong> GitHub stars</a>
  &nbsp;·&nbsp;
  <a href="https://www.npmjs.com/package/@inlang/sdk"><strong>500k+</strong> weekly npm downloads</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/opral/inlang/graphs/contributors"><strong>115+</strong> contributors</a>
</p>

<p align="center">
  <sub>Used across the inlang ecosystem by teams at</sub><br/><br/>
  <a href="https://www.kraftheinz.com/"><img src="https://github.com/opral/inlang/blob/main/assets/used-by/kraft-heinz.png?raw=true" alt="Kraft Heinz" height="18"></a>&nbsp;&nbsp;&nbsp;
  <a href="https://www.bose.com/"><img src="https://github.com/opral/inlang/blob/main/assets/used-by/bose.svg?raw=true" alt="Bose" height="18"></a>&nbsp;&nbsp;&nbsp;
  <a href="https://www.disney.co.jp/"><img src="https://github.com/opral/inlang/blob/main/assets/used-by/disney.svg?raw=true" alt="Disney" height="18"></a>&nbsp;&nbsp;&nbsp;
  <a href="https://ethz.ch/de.html"><img src="https://github.com/opral/inlang/blob/main/assets/used-by/eth-zurich.svg?raw=true" alt="ETH Zurich" height="18"></a>&nbsp;&nbsp;&nbsp;
  <a href="https://brave.com/"><img src="https://github.com/opral/inlang/blob/main/assets/used-by/brave.svg?raw=true" alt="Brave" height="18"></a>&nbsp;&nbsp;&nbsp;
  <a href="https://www.michelin.com/"><img src="https://github.com/opral/inlang/blob/main/assets/used-by/michelin.svg?raw=true" alt="Michelin" height="18"></a>&nbsp;&nbsp;&nbsp;
  <a href="https://www.idealista.com/"><img src="https://github.com/opral/inlang/blob/main/assets/used-by/idealista.svg?raw=true" alt="idealista" height="18"></a>&nbsp;&nbsp;&nbsp;
  <a href="https://www.architonic.com/"><img src="https://github.com/opral/inlang/blob/main/assets/used-by/architonic.png?raw=true" alt="Architonic" height="18"></a>&nbsp;&nbsp;&nbsp;
  <a href="https://lovable.dev/"><img src="https://github.com/opral/paraglide-js/blob/main/assets/used-by/lovable.svg?raw=true" alt="Lovable" height="18"></a>&nbsp;&nbsp;&nbsp;
  <a href="https://www.klaviyo.com/"><img src="https://github.com/opral/paraglide-js/blob/main/assets/used-by/klaviyo.svg?raw=true" alt="Klaviyo" height="18"></a>
</p>

---

Inlang is the open format TMS (translation management system). 

Store localization as a vendor-neutral `.inlang` project that can be read and written by TMS workflows, editors, CI, runtimes, plugins, and AI agents.

`.inlang` can be a packed `project.inlang` file or an unpacked `project.inlang/` directory. `@inlang/sdk` is the reference implementation for reading and writing both representations. Inlang is the ecosystem around that format: plugins, editor workflows, CI checks, runtime integrations, and versioning via Lix.

Inlang is a fit when engineering, localization, design, CI, and automation need to work on the same localization data. If you need a fully managed enterprise localization suite with built-in vendor management, translation memory, glossary workflows, assignments, and procurement features, evaluate inlang as an open localization format rather than a full replacement for every enterprise TMS function.

## What inlang gives your team

- Open file/directory localization source of truth
- One project model for bundles, messages, variants, locales, settings, and metadata
- Translator-friendly editing through tools like Fink
- SDK access for editors, CLIs, CI checks, runtimes, plugins, and AI agents
- CI checks for missing translations and placeholder issues
- Compatibility with JSON, ICU MessageFormat, i18next, and XLIFF
- Review, history, change proposals, and rollback via Lix
- Runtime integration through tools like Paraglide

## What you adopt

| Layer | What it is |
| --- | --- |
| inlang | Open localization format and ecosystem |
| `.inlang` | Canonical project file or directory format |
| `@inlang/sdk` | Read/write API for editors, CLIs, CI checks, runtimes, plugins, and agents |
| Plugins | Compatibility layer for JSON, ICU MessageFormat, i18next, XLIFF, and other file formats |
| Lix | Versioning, history, review, change proposals, rollback, and merging |
| Tools | Fink, Sherlock, Parrot, CLI, and Paraglide workflows that read/write `.inlang` |

## Choose your path

- Building an app runtime? Use [Paraglide](https://paraglidejs.com) to compile from `.inlang`.
- Giving translators a UI? Use [Fink](https://inlang.com/m/tdozzpar/app-inlang-finkLocalizationEditor) to edit `.inlang` without requiring Git.
- Adding CI or automation? Use the [CLI](https://inlang.com/m/2qj2w8pu/app-inlang-cli) and SDK on the same project data.
- Building an editor, migration, report, plugin, runtime, or AI agent? Use `@inlang/sdk` instead of inventing another i18n schema.
- Keeping existing JSON, ICU, i18next, or XLIFF files? Connect them through plugins while `.inlang` remains the shared project model.

## Build on top of inlang

If you are building localization tooling or generating localization code, target the `.inlang` project with `@inlang/sdk`. Your output will work with the same data model used by editors, CI checks, runtimes, plugins, and translation workflows.

For coding agents:

- Find an existing `project.inlang` file or `project.inlang/` directory before creating new locale files.
- Load and update bundles, messages, variants, locales, settings, and metadata through `@inlang/sdk`.
- Treat JSON, ICU, i18next, and XLIFF files as compatibility files connected through plugins.
- Do not invent a custom `locales/en.json` schema when a `.inlang` project already exists.

Messages, variants, and locale data live in the `.inlang` database. External translation files such as `messages/en.json` are compatibility files connected through plugins.

There are two representations:

```text
project.inlang                  # canonical packed file
```

```text
project.inlang/                 # Git-friendly unpacked representation
├── settings.json               # locales, plugins, file patterns; kept in Git
├── .gitignore                  # generated; ignores everything except settings.json
├── README.md                   # generated; explains this folder to coding agents
├── .meta.json                  # generated SDK metadata
└── cache/                      # plugin cache, created when plugins are loaded
```

`project.inlang` is the canonical packed file and portable representation. `project.inlang/` is the Git-friendly unpacked representation used for review and repository workflows. Both represent the same localization project; the SDK handles reading and writing them.

## The problem

Traditional TMSs make a vendor database the localization source of truth. Translation files become exports.

Common translation files like JSON, YAML, ICU, or XLIFF are good at storing messages. But they do not describe the whole localization project.

Once multiple tools need to read and write the same project, plain translation files start to miss important information:

- Bundles, variants, selectors, locales, settings, and metadata
- CRUD operations and queries without custom parsing
- Review state, history, change proposals, and rollback
- Tool and plugin configuration shared by editors, CI, runtimes, and agents

Without one shared format, every tool invents its own file structure, sync logic, and collaboration workflow.

Even basic import/export for translation file formats gets duplicated across tools instead of being shared.

The result is fragmented tooling:

- Switching tools requires migrations and refactoring
- Cross-team work requires manual exports and hand-offs
- Automating workflows requires custom scripts and glue code

```
┌──────────┐        ┌───────────┐         ┌──────────┐
│ i18n lib │───✗────│Translation│────✗────│   CI/CD  │
│          │        │   Tool    │         │Automation│
└──────────┘        └───────────┘         └──────────┘
```

Every tool has its own format, its own sync, its own collaboration layer. Cross-team work? Manual exports and hand-offs.

## The solution

Inlang makes the localization file the source of truth. The TMS becomes a layer around the format, not the owner of the data.

It provides:

- A message-first structure and SDK for CRUD operations
- Storage that tools can search, update, and report on
- Plugins to import/export formats like JSON, ICU MessageFormat v1, i18next, and XLIFF so that file-format support can be shared instead of reimplemented in every tool
- Versioning, history, review, change proposals, and rollback via [lix](https://github.com/opral/lix)

Core data model:

- **Bundle** — one translatable unit across locales
- **Message** — locale-specific translation for a bundle
- **Variant** — text pattern plus selector matches

```
┌──────────┐        ┌───────────┐         ┌────────────┐
│ i18n lib │        │Translation│         │   CI/CD    │
│          │        │   Tool    │         │ Automation │
└────┬─────┘        └─────┬─────┘         └─────┬──────┘
     │                    │                     │
     └─────────┐          │          ┌──────────┘
               ▼          ▼          ▼
           ┌──────────────────────────────────┐
           │          .inlang file            │
           └──────────────────────────────────┘
```

The result:

- Switch between `.inlang`-compatible tools with less migration work
- Cross-team work without hand-offs — developers, translators, and designers all edit the same source
- Automation gets SDK-readable project data instead of one-off glue code
- Keep your preferred message format — plugins handle import/export

Translators do not need to work directly with files or Git. Editor-friendly apps and workflows operate on the same open localization data.

If you only need an app runtime and a couple of translation files, JSON or your current i18n setup may already be enough. Use inlang when localization becomes shared work: multiple tools, teams, automations, or agents need to use the same localization data.

## How inlang compares

Inlang is an open-format TMS for software teams: localization data lives in a portable `.inlang` file or directory, with TMS workflows layered around it.

| Approach | Source of truth | Best for | Tradeoff |
| --- | --- | --- | --- |
| Traditional TMS | Vendor database | Managed translation workflows, vendors, assignments, and enterprise localization ops | Translation files become synced exports; migration, automation, and CI depend on the vendor |
| Runtime i18n libraries | App dictionaries or compiled catalogs | Rendering translations in the app | Runtime lookup is solved, but localization workflow data is still scattered |
| Translation files only | JSON, YAML, ICU, i18next, XLIFF, etc. | Small apps and simple runtime lookup | Teams maintain their own schema, validation, sync logic, and collaboration workflows |
| inlang | `.inlang` file or directory | Software teams that want portable localization data with TMS workflows | Requires adopting the `.inlang` model; existing JSON, ICU, i18next, and XLIFF files connect through plugins |

Inlang gives tools, CI, translators, and automation one open format to work on instead of syncing separate exports.

## How teams use inlang

A typical software localization workflow looks like this:

1. Developers add or update messages in source files, apps, or `.inlang` tooling.
2. The `.inlang` project becomes the shared localization source of truth.
3. CI checks for missing translations, placeholder mismatches, and message-format issues.
4. Translators and reviewers edit translations in tools that read and write `.inlang`, such as Fink, without working directly in Git.
5. Lix records localization changes, review history, change proposals, merges, and rollback points.
6. Runtime tools such as Paraglide compile from the same `.inlang` source when the app ships.

| Layer | What it provides |
| --- | --- |
| `.inlang` | Open localization format and source of truth |
| `@inlang/sdk` | Read/write API for editors, CI, agents, and automations |
| Plugins | Compatibility with JSON, ICU, i18next, XLIFF, and other existing message formats |
| Lix | History, review, change proposals, rollback, and merging |
| CLI / CI | Checks for missing translations, placeholders, and message-format issues |
| Editor tools | Translation and review workflows without requiring translators to use Git |
| Runtime tools | App integration from the same localization source, for example through Paraglide |

This is different from a traditional TMS where the vendor database owns the localization state and translation files are exports. In inlang, the localization project remains portable; TMS workflows operate around the open format.

## Tools in the inlang ecosystem

These tools read and write `.inlang` for different parts of the localization lifecycle.

- [Paraglide](https://paraglidejs.com) — JS/TS runtime that compiles messages from `.inlang`
- [Fink](https://inlang.com/m/tdozzpar/app-inlang-finkLocalizationEditor) — web editor for `.inlang` projects
- [Sherlock](https://inlang.com/m/r7kp499g/app-inlang-ideExtension) — VS Code extension that reads `.inlang` projects
- [Parrot](https://inlang.com/m/gkrpgoir/app-parrot-figmaPlugin) — Figma plugin that connects design text to `.inlang`
- [CLI](https://inlang.com/m/2qj2w8pu/app-inlang-cli) — linting, machine translation, and CI workflows for `.inlang`

## Read and write `.inlang`

```ts
import { loadProjectFromDirectory, loadProjectInMemory } from "@inlang/sdk";
import fs from "node:fs/promises";

const packedProject = await loadProjectInMemory({
  blob: await fs.readFile("./project.inlang"),
});

// Loads the Git-friendly unpacked representation.
const unpackedProject = await loadProjectFromDirectory({
  path: "./project.inlang",
});

const messages = await packedProject.db.selectFrom("message").selectAll().execute();
```

[Read the docs →](https://inlang.com/docs)

## Contributing

There are many ways you can contribute to inlang! Here are a few options:

- Star this repo
- Create issues every time you feel something is missing or goes wrong
- Upvote issues with 👍 reaction so we know what the demand for a particular issue to prioritize it within the roadmap

If you would like to contribute to the development of the project, please refer to our [Contributing guide](https://github.com/opral/inlang/blob/main/CONTRIBUTING.md).

All contributions are highly appreciated. 🙏
