import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workbenchRoot = path.resolve(skillRoot, "..", "..");

async function resolveFirst(paths) {
  for (const p of paths) {
    if (await exists(p)) return p;
  }
  return paths[0];
}

const artifactRuntimePath = await resolveFirst([
  path.join(workbenchRoot, "tools", "slide-renderer", "src", "artifact-tool-runtime.mjs"),
  path.join(skillRoot, "scripts", "proposal-slide-renderer", "src", "artifact-tool-runtime.mjs"),
]);
const { discoverArtifactTools } = await import(`file://${artifactRuntimePath.replace(/\\/g, "/")}`);

const checks = [];
const add = (name, passed, detail) => checks.push({ name, passed, detail });
const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
add("node", nodeMajor >= 20, `Node.js ${process.versions.node}`);

const renderer = await resolveFirst([
  path.join(workbenchRoot, "tools", "slide-renderer", "bin", "build-proposal.mjs"),
  path.join(skillRoot, "scripts", "proposal-slide-renderer", "bin", "build-proposal.mjs"),
]);
add("renderer", await exists(renderer), await exists(renderer) ? "canonical renderer found" : "renderer is missing");

const catalogPath = await resolveFirst([
  path.join(workbenchRoot, "tools", "pattern-library", "unified-visual-module-catalog.json"),
  path.join(skillRoot, "assets", "proposal-pattern-library", "unified-visual-module-catalog.json"),
]);
try {
  const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  const items = Array.isArray(catalog) ? catalog : (catalog.modules ?? catalog.items ?? []);
  add("catalog", items.length > 0, `pattern catalog contains ${items.length} items`);
} catch (error) {
  add("catalog", false, `pattern catalog cannot be read: ${error.message}`);
}

const runtimes = await discoverArtifactTools();
add(
  "artifact-tool",
  runtimes.length > 0,
  runtimes.length > 0 ? `@oai/artifact-tool ${runtimes[0].version} found` : "Codex-bundled @oai/artifact-tool was not found",
);

const report = {
  skillRoot,
  passed: checks.every((check) => check.passed),
  checks,
};
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
