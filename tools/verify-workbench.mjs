#!/usr/bin/env node
/**
 * verify-workbench.mjs
 * Proposal Workbench Doctor: runtime, skills, SQLite, catalog, offline UI checks.
 */

import fs from "node:fs/promises";
import { readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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

function detectPythonCommand() {
  const localPython = process.platform === "win32"
    ? path.join(workbenchRoot, ".venv", "Scripts", "python.exe")
    : path.join(workbenchRoot, ".venv", "bin", "python");
  const candidates = [
    process.env.PROPOSAL_WORKBENCH_PYTHON,
    localPython,
    ...discoverBundledPythonCommands(),
    ...(process.platform === "win32" ? ["py", "python", "python3"] : ["python3", "python"]),
  ].filter(Boolean);
  for (const cmd of candidates) {
    const res = spawnSync(cmd, ["-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"], { encoding: "utf8", windowsHide: true });
    if (res.status === 0 && res.stdout.trim()) {
      return { cmd, version: res.stdout.trim() };
    }
  }
  return null;
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
  const py = detectPythonCommand();
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
        : `win32com not available. For PowerPoint COM rendering, run:\n${pythonInstallCommand(pyCmd)}\nOtherwise headless text/structure extraction will be used.`,
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

  // 4. Skills Discovery & Frontmatter Check (All 7 skills)
  const expectedSkills = [
    "document-converter",
    "rfp-analyzer",
    "proposal-ppt-ingest",
    "proposal-reference-search",
    "proposal-slide-planner",
    "proposal-ppt-maker",
    "proposal-reviewer"
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

  // 5. Pattern Library Catalog Check
  const catalogPath = path.join(workbenchRoot, "tools", "pattern-library", "unified-visual-module-catalog.json");
  try {
    const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
    const count = Array.isArray(catalog) ? catalog.length : 0;
    addCheck("pattern_catalog", count >= 40, `Found ${count} native visual modules`);
  } catch (err) {
    addCheck("pattern_catalog", false, `Catalog read failed: ${err.message}`);
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

runDoctor();
