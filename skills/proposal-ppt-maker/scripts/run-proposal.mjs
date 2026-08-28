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
const rendererArgs = args.includes("--pattern-library")
  ? args
  : ["--pattern-library", patternLibrary, ...args];

const result = spawnSync(process.execPath, [renderer, ...rendererArgs], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
