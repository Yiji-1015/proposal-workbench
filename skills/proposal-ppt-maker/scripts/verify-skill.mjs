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
  const required = ["module_id", "display_name", "asset_kind", "module_type", "description", "design_traits", "use_cases", "search_tags", "renderer_key", "template", "usage_mode", "render_mode", "provenance_ref", "license", "license_status", "approved_at"];
  const fields = new Set(manifest.asset_required_fields ?? []);
  const kinds = ["block_shell", "diagram_recipe", "composite_block", "icon_asset", "media_frame", "photo_asset"];
  const forbidden = ["source_path", "original_file", "raw_text", "raw_texts"];
  const valid = manifest.version === 2
    && required.every((field) => fields.has(field))
    && kinds.every((kind) => manifest.asset_kind_values?.includes(kind))
    && forbidden.every((field) => manifest.forbidden_permanent_fields?.includes(field));
  add("asset-contract", valid, valid ? "version-2 editable asset contract is ready" : "asset manifest contract is incomplete");
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
