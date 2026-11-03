// Build SDK and the format plugins before running this integration smoke test.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { loadProjectFromDirectory, loadProjectInMemory, newProject, saveProjectToDirectory, selectBundleNested } from "../packages/sdk/dist/index.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const formats = [
  { directory: "inlang-message-format", name: "messages/en.json", pattern: "./messages/{locale}.json", source: JSON.stringify({ save: [{ description: "Initial guidance", match: { "*": "Save" } }] }), targetName: "messages/de.json", target: '{"save":"Speichern"}', migratedName: "messages/de.json", native: true },
  { directory: "json", name: "messages/en.json", pattern: "./messages/{locale}.json", source: '{"save":"Save"}', native: false },
  { directory: "i18next", name: "messages/en.json", pattern: "./messages/{locale}.json", source: '{"save":"Save"}', native: false },
  { directory: "next-intl", name: "messages/en.json", pattern: "./messages/{locale}.json", source: '{"save":"Save"}', native: false },
  { directory: "icu1", name: "messages/en.json", pattern: "./messages/{locale}.json", source: '{"save":"Save"}', native: false },
  { directory: "apple-strings", name: "messages/en.strings", pattern: "./messages/{locale}.strings", source: '/* Initial guidance */\n"save" = "Save";\n', targetName: "messages/de.strings", target: '"save" = "Speichern";\n', migratedName: "messages/de.strings", native: true },
  { directory: "android", name: "res/values/strings.xml", pattern: "./res/values{locale}/strings.xml", source: '<resources>\n  <!-- Initial guidance -->\n  <string name="save">Save</string>\n</resources>\n', targetName: "res/values-de/strings.xml", target: '<resources>\n  <string name="save">Speichern</string>\n</resources>\n', native: true },
  { directory: "apple-xcstrings", name: "Localizable.xcstrings", pattern: "./Localizable.xcstrings", source: JSON.stringify({ sourceLanguage: "en", version: "1.0", strings: { save: { comment: "Initial guidance", localizations: { en: { stringUnit: {state:"translated", value:"Save"} }, de: { stringUnit: {state:"translated", value:"Speichern"} } } } } }), native: true },
];

for (const format of formats) {
  const module = await import(path.join(root, "packages/plugins", format.directory, "dist/index.js"));
  const plugin = module.default ?? module.plugin;
  assert(plugin?.key, `missing plugin export: ${format.directory}`);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "inlang-descriptions-"));
  const projectPath = path.join(directory, "project.inlang");
  let project;
  try {
    fs.mkdirSync(projectPath, {recursive:true});
    fs.mkdirSync(path.dirname(path.join(directory, format.name)), {recursive:true});
    fs.writeFileSync(path.join(directory, format.name), format.source);
    if (format.targetName) {
      fs.mkdirSync(path.dirname(path.join(directory, format.targetName)), {recursive:true});
      fs.writeFileSync(path.join(directory, format.targetName), format.target);
    }
    fs.writeFileSync(path.join(projectPath, "settings.json"), JSON.stringify({baseLocale:"en", locales:format.native ? ["en", "de"] : ["en"], modules:[], [plugin.key]:{pathPattern:format.pattern}}));
    const load = () => loadProjectFromDirectory({path:projectPath, fs, providePlugins:[plugin]});
    project = await load();
    const [bundle] = await selectBundleNested(project.db).execute();
    assert(bundle, `missing bundle: ${format.directory}`);
    if (format.native) assert.equal(bundle.description, "Initial guidance", format.directory);
    await project.db.updateTable("inlang_bundle").set({description:"Updated guidance"}).where("id","=",bundle.id).execute();
    await saveProjectToDirectory({project, path:projectPath, fs});
    const resource = fs.readFileSync(path.join(directory,format.name),"utf8");
    if (format.native) assert(resource.includes("Updated guidance"), format.directory);
    else {
      assert(!resource.includes("Updated guidance"), `${format.directory} runtime catalog leaked description`);
      assert.equal(JSON.parse(fs.readFileSync(path.join(projectPath,"descriptions.json"),"utf8")).descriptions[bundle.id],"Updated guidance");
    }
    await project.close(); project=await load();
    assert.equal((await selectBundleNested(project.db).execute())[0].description,"Updated guidance",format.directory);
    const portable = await project.exportFiles({pluginKey:plugin.key});
    if (!format.native) assert(portable.some((file)=>file.metadata?.inlangDescriptions),format.directory);
    const transferred = await loadProjectInMemory({blob:await newProject({settings:await project.settings.get()}),providePlugins:[plugin]});
    try {
      await transferred.importFiles({pluginKey:plugin.key,files:portable});
      assert.equal((await selectBundleNested(transferred.db).execute())[0].description,"Updated guidance",`${format.directory} portable reimport`);
    } finally { await transferred.close(); }

    // A supported source-locale change updates the loaded canonical project,
    // then saves native resources before a new directory load.
    if (format.native) {
      await project.settings.set({...await project.settings.get(), baseLocale:"de"});
      assert.equal((await selectBundleNested(project.db).execute())[0].description,"Updated guidance",`${format.directory} live source switch`);
      await saveProjectToDirectory({project,path:projectPath,fs});
      assert(fs.readFileSync(path.join(directory,format.migratedName ?? format.name),"utf8").includes("Updated guidance"),`${format.directory} new native source guidance`);
      await project.close(); project=await load();
      assert.equal((await selectBundleNested(project.db).execute())[0].description,"Updated guidance",`${format.directory} source switch save/reopen`);
    }
    await project.db.updateTable("inlang_bundle").set({description:null}).where("id","=",bundle.id).execute();
    await saveProjectToDirectory({project,path:projectPath,fs});
    await project.close(); project=await load();
    assert.equal((await selectBundleNested(project.db).execute())[0].description,null,format.directory);
    if (format.native) {
      await project.close(); project = undefined;
      fs.writeFileSync(path.join(projectPath,"descriptions.json"), JSON.stringify({version:1,descriptions:{[bundle.id]:"Fallback guidance"}}));
      fs.rmSync(path.join(projectPath,".meta.json"),{force:true});
      project=await load();
      assert.equal((await selectBundleNested(project.db).execute())[0].description,"Fallback guidance",format.directory);
      // Loading may write project metadata, but must not clear fallback before native export.
      await project.close(); project=await load();
      assert.equal((await selectBundleNested(project.db).execute())[0].description,"Fallback guidance",format.directory);
      await saveProjectToDirectory({project,path:projectPath,fs});
      assert(fs.readFileSync(path.join(directory,format.migratedName ?? format.name),"utf8").includes("Fallback guidance"),format.directory);
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(projectPath,"descriptions.json"),"utf8")).descriptions,{});
    }
    console.log(`PASS ${format.directory}: import, description-only edit, directory reopen, portable export, clear${format.native ? ", source-locale switch and fallback migration" : ""}`);
  } finally {
    await project?.close();
    fs.rmSync(directory,{recursive:true,force:true});
  }
}
