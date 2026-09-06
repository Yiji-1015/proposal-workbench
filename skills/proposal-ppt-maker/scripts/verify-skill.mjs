import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
  for (const candidate of paths) if (await exists(candidate)) return candidate;
  return paths[0];
}

const artifactRuntimePath = await resolveFirst([
  process.env.PROPOSAL_WORKBENCH_ROOT && path.join(process.env.PROPOSAL_WORKBENCH_ROOT, "tools", "slide-renderer", "src", "artifact-tool-runtime.mjs"),
  path.join(process.cwd(), "tools", "slide-renderer", "src", "artifact-tool-runtime.mjs"),
  path.join(workbenchRoot, "tools", "slide-renderer", "src", "artifact-tool-runtime.mjs"),
  path.join(skillRoot, "scripts", "proposal-slide-renderer", "src", "artifact-tool-runtime.mjs"),
].filter(Boolean));
const checks = [];
const add = (name, passed, detail) => checks.push({ name, passed, detail });
const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
add("node", nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 5), `Node.js ${process.versions.node} (>= 22.5 required)`);

const renderer = await resolveFirst([
  process.env.PROPOSAL_WORKBENCH_ROOT && path.join(process.env.PROPOSAL_WORKBENCH_ROOT, "tools", "slide-renderer", "bin", "build-proposal.mjs"),
  path.join(process.cwd(), "tools", "slide-renderer", "bin", "build-proposal.mjs"),
  path.join(workbenchRoot, "tools", "slide-renderer", "bin", "build-proposal.mjs"),
  path.join(skillRoot, "scripts", "proposal-slide-renderer", "bin", "build-proposal.mjs"),
].filter(Boolean));
add("renderer", await exists(renderer), await exists(renderer) ? "native slide renderer found" : "native slide renderer is missing");
add("catalog-independent", true, "core rendering does not require ingest, search, SQLite, or embeddings");

try {
  const { discoverArtifactTools } = await import(pathToFileURL(artifactRuntimePath).href);
  const runtimes = await discoverArtifactTools();
  add("artifact-tool", runtimes.length > 0, runtimes.length > 0 ? `@oai/artifact-tool ${runtimes[0].version} found` : "Codex-bundled @oai/artifact-tool was not found");
} catch (error) {
  add("artifact-tool", false, `artifact-tool discovery failed: ${error.message}`);
}

const report = { skillRoot, passed: checks.every((check) => check.passed), checks };
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
