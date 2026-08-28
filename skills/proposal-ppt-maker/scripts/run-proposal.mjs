import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const renderer = path.join(skillRoot, "scripts", "proposal-slide-renderer", "bin", "build-proposal.mjs");
const patternLibrary = path.join(skillRoot, "assets", "proposal-pattern-library");
const args = process.argv.slice(2);
const rendererArgs = args.includes("--pattern-library")
  ? args
  : ["--pattern-library", patternLibrary, ...args];

const result = spawnSync(process.execPath, [renderer, ...rendererArgs], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
