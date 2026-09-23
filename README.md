[![NPM Downloads](https://img.shields.io/npm/dw/%40inlang%2Fsdk?logo=npm&logoColor=red&label=npm%20downloads)](https://www.npmjs.com/package/@inlang/sdk)
[![GitHub Issues](https://img.shields.io/github/issues-closed/opral/inlang?logo=github&color=purple)](https://github.com/opral/inlang/issues)
[![Contributors](https://img.shields.io/github/contributors/opral/inlang?logo=github)](https://github.com/opral/inlang/graphs/contributors)
[![Discord](https://img.shields.io/discord/897438559458430986?logo=discord&logoColor=white&label=discord)](https://discord.gg/gdMPPWy57R)

<h1 align="center"><img src="https://github.com/opral/inlang/blob/main/assets/logo_rounded.png?raw=true" alt="inlang icon" height="32" align="absmiddle">&nbsp;inlang</h1>

<h3 align="center">Run localization through Git, CI, and pull requests.</h3>

<p align="center">
  <a href="https://inlang.com/c/apps">Tools</a> ·
  <a href="https://inlang.com/documentation">Docs</a> ·
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
  <a href="https://www.idealista.com/"><img src="https://github.com/opral/inlang/blob/main/assets/used-by/idealista.svg?raw=true" alt="idealista" height="18"></a>
</p>

---

Keep translation files in your Git repo. Inlang gives editors, agents, and automation a shared localization model, so they can work with those files without making a hosted TMS the source of truth.

## One project, many tools

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

An inlang project describes messages, variants, locales, and settings. [Plugins](https://inlang.com/c/plugins) connect that model to the files your app uses, including JSON and i18next resources. Tools can use the [SDK](https://www.npmjs.com/package/@inlang/sdk) instead of each building its own parser and project model.

That gives tool builders a common format to work with. You can use an editor, add an automation, or build your own tool around the same localization model.

## Use your Git workflow

```text
my-app/
├── src/
├── messages/
│   ├── en.json
│   └── de.json
└── project.inlang/
    └── settings.json
```

In this setup, Git tracks the translation files and project settings. A configured plugin reads and writes the message files. Localization changes can follow the same path as code changes:

```text
Change source text → update translations → run CI → review the pull request → ship
```

For example, CI can check that the project loads:

```bash
npx @inlang/cli validate --project ./project.inlang
```

An optional automation can create draft translations with a configured provider:

```bash
npx @inlang/cli machine translate --project ./project.inlang
```

The resulting translation files can be committed and reviewed in a pull request. `validate` checks project setup; it does not check translation completeness or placeholder quality. Generated translations need review before shipping. See the [CLI documentation](https://inlang.com/m/2qj2w8pu/app-inlang-cli) for provider setup.

## Get started

- [Set up an inlang project](https://inlang.com/documentation)
- [Use the CLI in CI](https://inlang.com/m/2qj2w8pu/app-inlang-cli)
- [Build with the SDK](https://www.npmjs.com/package/@inlang/sdk)
- [Explore inlang tools](https://inlang.com/c/apps)

## Contributing

Found a problem or have an idea? [Open an issue](https://github.com/opral/inlang/issues). To contribute code, see the [contributing guide](https://github.com/opral/inlang/blob/main/CONTRIBUTING.md).
