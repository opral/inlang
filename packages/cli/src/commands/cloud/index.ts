import { Command } from "commander";
import { spawn } from "node:child_process";
import fs from "node:fs";
import nodePath from "node:path";
import { capture } from "../../telemetry/capture.js";
import { styles } from "../../utilities/styles.js";

/** The hosted features, as Parrot's Cloud tab and Fink present them. */
export const CLOUD_FEATURES: {
  title: string;
  features: { name: string; description: string }[];
}[] = [
  {
    title: "Design and code in sync",
    features: [
      {
        name: "Automatic handoff between designers, developers, and translators",
        description:
          "Through a CLI, REST API, or your CI. No more sending JSON files around.",
      },
    ],
  },
  {
    title: "AI",
    features: [
      {
        name: "AI translation",
        description: "Fill in every missing language at once.",
      },
      {
        name: "Your terminology and tone",
        description:
          "Product names stay as they are. Your style guide is followed.",
      },
      {
        name: "Translations that fit the design",
        description:
          "Knows buttons from headings and keeps text within its space.",
      },
      {
        name: "Smart message keys",
        description:
          "Meaningful keys like checkout.continue_button, generated for you.",
      },
    ],
  },
];

/** The shared "Interest in Cloud" form, also linked from Parrot, Fink, Sherlock and Paraglide JS. */
const FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSdwui1r1rFu1AXMPKa-g2ggDHOTvNFrmrxWDubaaYLHv8_4Mg/viewform";
/** "Which product brought you here?" Its options are Parrot, Fink, Sherlock and Paraglide JS. */
const PRODUCT_ENTRY = "entry.14901479";

/**
 * The interest form, with "Paraglide JS" pre-selected for Paraglide projects.
 * The form has no option for the CLI itself, so nothing is pre-selected otherwise.
 */
export function cloudFormUrl(product: "Paraglide JS" | undefined): string {
  if (!product) return FORM_URL;
  const params = new URLSearchParams({
    usp: "pp_url",
    [PRODUCT_ENTRY]: product,
  });
  return `${FORM_URL}?${params}`;
}

/**
 * Whether the project in `cwd` uses Paraglide JS: an `@inlang/paraglide*`
 * dependency (including adapters) in the nearest package.json, or the
 * m-function matcher Paraglide installs in the inlang project's settings.
 */
export function usesParaglide(args: {
  cwd: string;
  project?: string;
}): boolean {
  const read = (path: string) => {
    try {
      return fs.readFileSync(nodePath.resolve(args.cwd, path), "utf8");
    } catch {
      return undefined;
    }
  };
  let directory = nodePath.resolve(args.cwd);
  let packageJson = read(nodePath.join(directory, "package.json"));
  while (
    packageJson === undefined &&
    nodePath.dirname(directory) !== directory
  ) {
    directory = nodePath.dirname(directory);
    packageJson = read(nodePath.join(directory, "package.json"));
  }
  if (packageJson) {
    try {
      const manifest = JSON.parse(packageJson);
      const dependencies = [
        "dependencies",
        "devDependencies",
        "peerDependencies",
      ].flatMap((field) => Object.keys(manifest?.[field] ?? {}));
      if (dependencies.some((name) => name.startsWith("@inlang/paraglide")))
        return true;
    } catch {
      // not JSON: no answer from package.json
    }
  }
  const settings = read(
    nodePath.join(args.project ?? "project.inlang", "settings.json"),
  );
  return settings?.includes("plugin-m-function-matcher") ?? false;
}

export type CloudOptions = {
  project?: string;
  open: boolean;
  json?: boolean;
};

export const cloud = new Command()
  .command("cloud")
  .description("See what's coming in inlang Cloud and tell us what you need.")
  .option(
    "--project <path>",
    "Path to the inlang project, to tell us which product you use.",
  )
  .option("--no-open", "Print the form's URL instead of opening the browser.")
  .option("--json", "Print the features and the form's URL as JSON.")
  .action(async (options: CloudOptions) => {
    await cloudCommandAction(options, {
      cwd: process.cwd(),
      interactive: isInteractive({
        isTTY: Boolean(process.stdout.isTTY),
        env: process.env,
      }),
      color: Boolean(process.stdout.isTTY) && !process.env.NO_COLOR,
      write: (text) => process.stdout.write(text),
      open: openInBrowser,
      capture,
    });
  });

/**
 * A user at a terminal who can see a browser: not CI, not piped, and on Linux
 * not a session without a display (SSH, containers).
 */
export function isInteractive(args: {
  isTTY: boolean;
  env: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
}): boolean {
  const platform = args.platform ?? process.platform;
  return (
    args.isTTY &&
    !args.env.CI &&
    (platform === "darwin" ||
      platform === "win32" ||
      Boolean(args.env.DISPLAY || args.env.WAYLAND_DISPLAY))
  );
}

export async function cloudCommandAction(
  options: CloudOptions,
  env: {
    cwd: string;
    /** A user at a terminal, not CI or a pipe: only then the browser opens. */
    interactive: boolean;
    color: boolean;
    write: (text: string) => void;
    open: (url: string) => Promise<boolean>;
    capture: typeof capture;
  },
): Promise<void> {
  const paraglide = usesParaglide({ cwd: env.cwd, project: options.project });
  const url = cloudFormUrl(paraglide ? "Paraglide JS" : undefined);
  if (options.json) {
    env.write(
      JSON.stringify({ features: CLOUD_FEATURES, formUrl: url }, undefined, 2) +
        "\n",
    );
  } else {
    const s = styles(env.color);
    const lines = [
      "",
      `${s.bold("inlang Cloud")} ${s.dim("· coming soon")}`,
      "",
    ];
    for (const group of CLOUD_FEATURES) {
      lines.push(s.bold(group.title));
      for (const feature of group.features)
        lines.push(
          `  ${s.cyan("•")} ${feature.name}`,
          `    ${s.dim(feature.description)}`,
        );
      lines.push("");
    }
    lines.push(
      "Tell us what your team needs (it takes a minute):",
      `  ${url}`,
      "",
    );
    env.write(lines.join("\n"));
  }
  const opened =
    options.open && !options.json && env.interactive
      ? await env.open(url)
      : false;
  if (opened) env.write("Opening the form in your browser…\n");
  await env.capture({
    event: "CLI cloud viewed",
    properties: {
      opened_form: opened,
      interactive: env.interactive,
      json: Boolean(options.json),
      product: paraglide ? "Paraglide JS" : "unknown",
    },
  });
}

/** Opens `url` with the platform's opener. Resolves `false` if that isn't possible. */
export function openInBrowser(url: string): Promise<boolean> {
  const [command, args]: [string, string[]] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
        : ["xdg-open", [url]];
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, {
        stdio: "ignore",
        detached: true,
        windowsHide: true,
      });
      child.once("error", () => resolve(false));
      child.once("spawn", () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}
