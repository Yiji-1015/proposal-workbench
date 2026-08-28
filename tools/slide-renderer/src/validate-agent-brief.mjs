import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function nonEmptyArray(value, name) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${name} must be a non-empty array`);
  return value;
}
export function validateAgentBrief(brief) {
  if (!brief || typeof brief !== "object" || Array.isArray(brief)) throw new Error("agent brief must be an object");
  const requirementIds = nonEmptyArray(brief.requirement_ids, "requirement_ids").map((id) => String(id).trim()).filter(Boolean);
  if (requirementIds.length !== brief.requirement_ids.length) throw new Error("requirement_ids must contain non-empty IDs");
  if (!brief.slide_scope || !Number.isInteger(brief.slide_scope.count) || brief.slide_scope.count < 1) throw new Error("slide_scope.count must be a positive integer");
  if (!brief.palette || !/^#[0-9A-Fa-f]{6}$/.test(brief.palette.primary ?? "") || !/^#[0-9A-Fa-f]{6}$/.test(brief.palette.navy ?? "")) throw new Error("palette.primary and palette.navy must be #RRGGBB colors");
  nonEmptyArray(brief.approved_asset_mappings, "approved_asset_mappings");
  nonEmptyArray(brief.forbidden_actions, "forbidden_actions");
  if (!Number.isFinite(brief.time_budget_minutes) || brief.time_budget_minutes <= 0) throw new Error("time_budget_minutes must be positive");
  if (![0, 1].includes(brief.max_review_rounds)) throw new Error("max_review_rounds must be 0 or 1");
  nonEmptyArray(brief.completion_criteria, "completion_criteria");
  return { requirementIds, slideCount: brief.slide_scope.count, maxReviewRounds: brief.max_review_rounds };
}

async function main(argv) {
  const index = argv.indexOf("--brief");
  if (index < 0 || !argv[index + 1]) throw new Error("--brief <file.json> is required");
  const file = path.resolve(argv[index + 1]);
  const result = validateAgentBrief(JSON.parse(await fs.readFile(file, "utf8")));
  console.log(JSON.stringify({ valid: true, file, ...result }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
