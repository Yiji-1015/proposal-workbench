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
const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
const nodeSupported = nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 5);
add("node", nodeSupported, `Node.js ${process.versions.node} (>= 22.5 required for node:sqlite)`);

const renderer = await resolveFirst([
  path.join(workbenchRoot, "tools", "slide-renderer", "bin", "build-proposal.mjs"),
  path.join(skillRoot, "scripts", "proposal-slide-renderer", "bin", "build-proposal.mjs"),
]);
add("renderer", await exists(renderer), await exists(renderer) ? "canonical renderer found" : "renderer is missing");

const catalogPath = await resolveFirst([
  path.join(workbenchRoot, "tools", "pattern-library", "unified-visual-module-catalog.json"),
  path.join(skillRoot, "assets", "proposal-pattern-library", "unified-visual-module-catalog.json"),
]);
const manifestPath = await resolveFirst([
  path.join(workbenchRoot, "tools", "pattern-library", "asset-manifest.schema.json"),
  path.join(skillRoot, "assets", "proposal-pattern-library", "asset-manifest.schema.json"),
]);
try {
  const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  const items = Array.isArray(catalog) ? catalog : (catalog.modules ?? catalog.items ?? []);
  add("catalog", Array.isArray(items), `asset catalog contains ${items.length} imported items; empty is allowed before user import`);
} catch (error) {
  add("catalog", false, `asset catalog cannot be read: ${error.message}`);
}
try {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const required = ["module_id", "module_type", "purpose", "flow_direction", "aspect_ratio", "step_count", "visual_tags", "semantic_tags", "template", "source", "supported_slide_orientations", "aspect_ratio_semantics", "orientation_adaptations", "usage_mode", "render_mode"];
  const fields = new Set(manifest.asset_required_fields ?? []);
  const sourceFields = new Set(manifest.source_required_fields ?? []);
  const valid = required.every((field) => fields.has(field)) && ["provider", "original_file", "license"].every((field) => sourceFields.has(field));
  add("asset-contract", valid, valid ? "empty baseline and future import fields are defined" : "asset manifest contract is incomplete");
} catch (error) {
  add("asset-contract", false, `asset manifest contract cannot be read: ${error.message}`);
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
