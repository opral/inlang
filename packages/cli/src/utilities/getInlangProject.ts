import fs from "node:fs";
import { loadProjectFromDirectory, type InlangProject } from "@inlang/sdk";
import { resolve } from "node:path";

/** The project couldn't be opened, e.g. because `settings.json` is missing. */
export class ProjectLoadError extends Error {
  override name = "ProjectLoadError";
}

/**
 * Opens the inlang project. Throws a {@link ProjectLoadError} if it can't be opened.
 */
export async function getInlangProject(args: {
  projectPath: string;
}): Promise<InlangProject> {
  try {
    const baseDirectory = process.cwd();
    const projectPath = resolve(baseDirectory, args.projectPath);

    const project = await loadProjectFromDirectory({
      path: projectPath,
      fs: fs,
    });

    return project;
  } catch (err) {
    throw new ProjectLoadError(
      `Couldn't open the inlang project at ${args.projectPath}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}
