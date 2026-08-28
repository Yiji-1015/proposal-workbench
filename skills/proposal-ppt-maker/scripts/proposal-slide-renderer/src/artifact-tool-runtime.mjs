import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

function compareVersionsDescending(left, right) {
  const a = left.version.split(".").map((value) => Number.parseInt(value, 10) || 0);
  const b = right.version.split(".").map((value) => Number.parseInt(value, 10) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (b[index] ?? 0) - (a[index] ?? 0);
  }
  return left.path.localeCompare(right.path);
}

async function readArtifactTool(candidatePath) {
  try {
    const packageJson = JSON.parse(await fs.readFile(path.join(candidatePath, "package.json"), "utf8"));
    if (packageJson.name !== "@oai/artifact-tool" || typeof packageJson.version !== "string") return null;
    const rootExport = packageJson.exports?.["."];
    const entry = typeof rootExport === "string"
      ? rootExport
      : (rootExport?.import ?? rootExport?.default ?? packageJson.module ?? packageJson.main ?? "./dist/artifact_tool.mjs");
    return { path: path.resolve(candidatePath), version: packageJson.version, entry };
  } catch {
    return null;
  }
}

export async function discoverArtifactTools({
  explicitPath = process.env.CODEX_ARTIFACT_TOOL_PATH,
  runtimeRoots = [path.join(os.homedir(), ".cache", "codex-runtimes")],
} = {}) {
  const paths = explicitPath ? [explicitPath] : [];
  for (const runtimeRoot of runtimeRoots) {
    let runtimes;
    try {
      runtimes = await fs.readdir(runtimeRoot, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const runtime of runtimes) {
      if (!runtime.isDirectory()) continue;
      paths.push(path.join(runtimeRoot, runtime.name, "dependencies", "node", "node_modules", "@oai", "artifact-tool"));
    }
  }
  const candidates = (await Promise.all(
    [...new Set(paths.map((candidate) => path.resolve(candidate)))].map(readArtifactTool),
  )).filter(Boolean);
  return candidates.sort(compareVersionsDescending);
}

export async function loadArtifactTool(options = {}) {
  const candidates = await discoverArtifactTools(options);
  if (candidates.length === 0) {
    throw new Error(
      "Codex-bundled @oai/artifact-tool runtime was not found. Start Codex once on this PC or set CODEX_ARTIFACT_TOOL_PATH to the package directory.",
    );
  }
  const selected = candidates[0];
  return import(pathToFileURL(path.resolve(selected.path, selected.entry)).href);
}
