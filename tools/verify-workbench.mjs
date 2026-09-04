#!/usr/bin/env node
/**
 * verify-workbench.mjs
 * Proposal Workbench Doctor: runtime, skills, SQLite, asset contract, offline UI checks.
 */

import fs from "node:fs/promises";
import { readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workbenchRoot = path.resolve(__dirname, "..");
const docConverterRoot = path.join(workbenchRoot, "tools", "doc-converter");
const pythonRequirementsPath = path.join(workbenchRoot, "tools", "ppt-ingest", "requirements.txt");

const checks = [];
function addCheck(name, passed, detail) {
  checks.push({ name, passed, detail });
}

function nodeVersionAtLeast(major, minor = 0) {
  const [currentMajor, currentMinor] = process.versions.node.split(".").map(Number);
  return currentMajor > major || (currentMajor === major && currentMinor >= minor);
}

function quotePowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function pythonInstallCommand(pythonCommand) {
  return `& ${quotePowerShell(pythonCommand)} -m pip install -r ${quotePowerShell(pythonRequirementsPath)}`;
}

function nodeInstallCommand() {
  return `npm --prefix ${quotePowerShell(docConverterRoot)} install`;
}

function discoverBundledPythonCommands() {
  const runtimeRoot = path.join(os.homedir(), ".cache", "codex-runtimes");
  const pythonPath = process.platform === "win32"
    ? path.join("dependencies", "python", "python.exe")
    : path.join("dependencies", "python", "bin", "python");
  try {
    return readdirSync(runtimeRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(runtimeRoot, entry.name, pythonPath));
  } catch {
    return [];
  }
}

function pythonVersionOf(cmd) {
  const res = spawnSync(cmd, ["-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"], { encoding: "utf8", windowsHide: true });
  return res.status === 0 && res.stdout.trim() ? res.stdout.trim() : null;
}

function pythonHasModules(cmd, modules) {
  if (!modules.length) return true;
  const probe = modules.map((name) => `import ${name}`).join("; ");
  return spawnSync(cmd, ["-c", probe], { encoding: "utf8", windowsHide: true }).status === 0;
}

// 후보 중 첫 번째로 실행되는 파이썬을 고르면, 그 인터프리터에 필요한 모듈이 없을 때
// 기능이 조용히 죽는다. 실제로 번들 파이썬(3.12)이 먼저 잡혀 pywin32가 없는 탓에
// PowerPoint COM 렌더링과 피커의 PPTX 추출이 실패했고, 정작 같은 PC의 py(3.13)에는
// pywin32가 있었다. require를 주면 그 모듈을 가진 후보를 우선 고르고, 하나도 없으면
// 기존처럼 실행 가능한 첫 후보로 물러난다.
export function detectPythonCommand({ require: requiredModules = [] } = {}) {
  const localPython = process.platform === "win32"
    ? path.join(workbenchRoot, ".venv", "Scripts", "python.exe")
    : path.join(workbenchRoot, ".venv", "bin", "python");
  const candidates = [
    process.env.PROPOSAL_WORKBENCH_PYTHON,
    localPython,
    ...discoverBundledPythonCommands(),
    ...(process.platform === "win32" ? ["py", "python", "python3"] : ["python3", "python"]),
  ].filter(Boolean);
  let firstWorking = null;
  for (const cmd of candidates) {
    const version = pythonVersionOf(cmd);
    if (!version) continue;
    if (!firstWorking) firstWorking = { cmd, version };
    if (pythonHasModules(cmd, requiredModules)) return { cmd, version, satisfiesRequired: true };
  }
  return firstWorking ? { ...firstWorking, satisfiesRequired: requiredModules.length === 0 } : null;
}

async function runDoctor() {
  console.log("=== Proposal Workbench Doctor Check ===\n");

  // 1. Node.js Version Check. node:sqlite was added in Node.js 22.5.0.
  addCheck("node_runtime", nodeVersionAtLeast(22, 5), `Node.js ${process.versions.node} (>= 22.5 required for node:sqlite)`);

  // 1-1. Document converter dependency check.
  const kordocCheck = spawnSync(
    process.execPath,
    ["-e", "import('kordoc').then(() => process.exit(0)).catch(() => process.exit(1));"],
    { cwd: docConverterRoot, encoding: "utf8", windowsHide: true },
  );
  addCheck(
    "doc_converter_kordoc",
    kordocCheck.status === 0,
    kordocCheck.status === 0
      ? "kordoc available for HWP/HWPX/PDF/DOCX/PPTX conversion"
      : `kordoc not installed. Run:\n${nodeInstallCommand()}`,
  );

  // 2. Python Version & Packages Check
  // 워크벤치 스크립트가 실제로 필요로 하는 모듈을 가진 인터프리터를 우선 고른다.
  // 그래야 Doctor가 보고하는 인터프리터와 인제스트·피커가 실제로 쓰는 인터프리터가 같다.
  const py = detectPythonCommand({ require: ["pptx", "win32com.client"] });
  if (py) {
    const pyCmd = typeof py === "string" ? py : py.cmd;
    const pyVer = typeof py === "string" ? "detected" : py.version;
    addCheck("python_runtime", true, `Python ${pyVer} (${pyCmd})`);

    // Check python-pptx
    const pptxCheck = spawnSync(pyCmd, ["-c", "import pptx; print(pptx.__version__)"], { encoding: "utf8" });
    addCheck(
      "python_pptx",
      pptxCheck.status === 0,
      pptxCheck.status === 0
        ? `python-pptx ${pptxCheck.stdout.trim()}`
        : `python-pptx not installed. Run:\n${pythonInstallCommand(pyCmd)}`,
    );

    // Check pywin32 COM
    const comCheck = spawnSync(pyCmd, ["-c", "import win32com.client; print('OK')"], { encoding: "utf8" });
    addCheck(
      "powerpoint_com",
      comCheck.status === 0,
      comCheck.status === 0
        ? "win32com available (PowerPoint COM rendering enabled)"
        : `win32com not available in ${pyCmd}. Install it there:\n${pythonInstallCommand(pyCmd)}\nOr point the workbench at an interpreter that already has it:\n$env:PROPOSAL_WORKBENCH_PYTHON = 'py'\nOtherwise headless text/structure extraction will be used.`,
    );
  } else {
    addCheck(
      "python_runtime",
      false,
      "Python 3 not found. Install Python 3, then rerun this check; or set PROPOSAL_WORKBENCH_PYTHON to the python.exe path.",
    );
  }

  // 3. SQLite Built-in Engine Check
  try {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE test (id INT, v BLOB);");
    db.exec("INSERT INTO test VALUES (1, x'00010203');");
    const row = db.prepare("SELECT * FROM test").get();
    db.close();
    addCheck("sqlite_engine", row.id === 1, "Built-in node:sqlite operational with BLOB support");
  } catch (err) {
    addCheck("sqlite_engine", false, `node:sqlite error: ${err.message}`);
  }

  // 4. Skills Discovery & Frontmatter Check (All 8 skills)
  const expectedSkills = [
    "document-converter",
    "rfp-analyzer",
    "proposal-ppt-ingest",
    "proposal-reference-search",
    "proposal-slide-planner",
    "proposal-ppt-maker",
    "proposal-reviewer",
    "proposal-asset-curator"
  ];
  for (const s of expectedSkills) {
    const skillMd = path.join(workbenchRoot, "skills", s, "SKILL.md");
    try {
      const content = await fs.readFile(skillMd, "utf8");
      if (!content.includes(`name: ${s}`)) {
        addCheck(`skill_${s}`, false, "Missing or invalid name frontmatter");
      } else {
        addCheck(`skill_${s}`, true, "Valid SKILL.md found");
      }
    } catch {
      addCheck(`skill_${s}`, false, "SKILL.md file missing");
    }
  }

  // 5. User asset catalog contract check. The initial catalog may be empty.
  const catalogPath = path.join(workbenchRoot, "tools", "pattern-library", "unified-visual-module-catalog.json");
  const manifestPath = path.join(workbenchRoot, "tools", "pattern-library", "asset-manifest.schema.json");
  try {
    const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    const count = Array.isArray(catalog) ? catalog.length : -1;
    const required = ["module_id", "display_name", "asset_kind", "module_type", "description", "design_traits", "use_cases", "search_tags", "renderer_key", "template", "usage_mode", "render_mode", "provenance_ref", "license", "license_status", "approved_at"];
    const fields = new Set(manifest.asset_required_fields ?? []);
    const valid = count >= 0 && manifest.version === 2 && required.every((field) => fields.has(field))
      && Array.isArray(manifest.asset_kind_values)
      && ["block_shell", "diagram_recipe", "composite_block", "icon_asset", "media_frame", "photo_asset"].every((kind) => manifest.asset_kind_values.includes(kind))
      && Array.isArray(manifest.forbidden_permanent_fields)
      && ["source_path", "original_file", "raw_text", "raw_texts"].every((field) => manifest.forbidden_permanent_fields.includes(field));
    addCheck("asset_catalog", valid, valid ? `Asset catalog contract ready (${count} imported items)` : "Asset catalog contract is incomplete");
  } catch (err) {
    addCheck("asset_catalog", false, `Asset catalog contract read failed: ${err.message}`);
  }

  // 6. Zero-CDN / Offline UI Integrity Check
  const htmlFiles = ["index.html", "picker.html", "planner.html", "ingest.html"];
  for (const h of htmlFiles) {
    const hp = path.join(workbenchRoot, "tools", "hitl-bridge", "public", h);
    try {
      const content = await fs.readFile(hp, "utf8");
      if (content.includes("cdn.tailwindcss.com") || content.includes("fonts.googleapis.com") || content.includes("unpkg.com")) {
        addCheck(`offline_ui_${h}`, false, "External CDN link detected");
      } else {
        addCheck(`offline_ui_${h}`, true, "100% Local & Offline compliant");
      }
    } catch (e) {
      addCheck(`offline_ui_${h}`, false, `File missing: ${e.message}`);
    }
  }

  // 7. Summary & Verdict
  const passedCount = checks.filter(c => c.passed).length;
  const totalCount = checks.length;
  const overallPassed = checks.every(c => c.passed || c.name === "powerpoint_com");

  console.log(JSON.stringify({
    workbenchRoot,
    overall_status: overallPassed ? "HEALTHY" : "NEEDS_ATTENTION",
    passed: `${passedCount}/${totalCount}`,
    checks
  }, null, 2));

  if (!overallPassed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runDoctor();
}
