import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workbenchRoot = path.resolve(skillRoot, "..", "..");

function resolveFirst(paths) {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return paths[0];
}

const renderer = resolveFirst([
  path.join(workbenchRoot, "tools", "slide-renderer", "bin", "build-proposal.mjs"),
  path.join(skillRoot, "scripts", "proposal-slide-renderer", "bin", "build-proposal.mjs"),
]);

const patternLibrary = resolveFirst([
  path.join(workbenchRoot, "tools", "pattern-library"),
  path.join(skillRoot, "assets", "proposal-pattern-library"),
]);
const args = process.argv.slice(2);
const projectIndex = args.indexOf("--project");
const projectArg = projectIndex >= 0 ? args[projectIndex + 1] : null;
if (projectArg) {
  const blueprintPath = path.join(path.resolve(projectArg), "blueprint", "slide-blueprint.json");
  if (fs.existsSync(blueprintPath)) {
    const blueprint = JSON.parse(fs.readFileSync(blueprintPath, "utf8"));
    if (blueprint.status !== "approved") {
      throw new Error("Final PPTX rendering requires an explicitly approved blueprint. Show the wireframe and wait for user approval first.");
    }
  }
}
const rendererArgs = args.includes("--pattern-library")
  ? args
  : ["--pattern-library", patternLibrary, ...args];

const result = spawnSync(process.execPath, [renderer, ...rendererArgs], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
