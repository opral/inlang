/** Local cross-repository validation only. Does not edit manifests or lockfiles. */
import { lstat, readFile, readdir, realpath, symlink, unlink } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const inlang = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const products = process.argv.slice(2).map((path) => resolve(path));
if (!products.length) throw new Error("Usage: node rfcs/bundle-descriptions/link-local-workspaces.mjs <product-directory> [...]");
const packages = [join(inlang, "packages/sdk"), join(inlang, "packages/ui-components/editor-component")];
for (const name of await readdir(join(inlang, "packages/plugins"))) packages.push(join(inlang, "packages/plugins", name));

async function linkInstalled(directory, name, source) {
 const target = join(directory, "node_modules", name);
 let entry;
 try { entry = await lstat(target); } catch (error) { if (error.code === "ENOENT") return; throw error; }
 if (!entry.isSymbolicLink()) throw new Error(`Refusing to replace a real directory: ${target}. Install with pnpm first.`);
 await unlink(target);
 await symlink(relative(dirname(target), source), target, "dir");
 process.stdout.write(`Linked ${name} in ${relative(process.cwd(), directory)}\n`);
}
for (const product of products) {
 const consumers = [product];
 try { await lstat(join(product, "src/utilities/editor/sherlock-editor-app/node_modules")); consumers.push(join(product, "src/utilities/editor/sherlock-editor-app")); } catch (error) { if (error.code !== "ENOENT") throw error; }
 for (const source of packages) {
  let metadata;
  try { metadata = JSON.parse(await readFile(join(source, "package.json"), "utf8")); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
  for (const consumer of consumers) await linkInstalled(consumer, metadata.name, source);
 }
 // Kysely has private nominal types: the extension and the locally linked SDK
 // must resolve one copy while validating source packages across repositories.
 const kysely = await realpath(join(inlang, "packages/sdk/node_modules/kysely"));
 for (const consumer of consumers) await linkInstalled(consumer, "kysely", kysely);
}
