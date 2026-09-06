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
  process.env.PROPOSAL_WORKBENCH_ROOT && path.join(process.env.PROPOSAL_WORKBENCH_ROOT, "tools", "slide-renderer", "bin", "build-proposal.mjs"),
  path.join(process.cwd(), "tools", "slide-renderer", "bin", "build-proposal.mjs"),
  path.join(workbenchRoot, "tools", "slide-renderer", "bin", "build-proposal.mjs"),
  path.join(skillRoot, "scripts", "proposal-slide-renderer", "bin", "build-proposal.mjs"),
].filter(Boolean));

// 승인 게이트는 build-proposal.mjs에 있다. 이 래퍼에만 두면 렌더러를 직접 호출해
// 우회할 수 있었고, 승인 자료인 와이어프레임까지 함께 막혀 승인 자체가 불가능했다.
const args = process.argv.slice(2);
const result = spawnSync(process.execPath, [renderer, ...args], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
