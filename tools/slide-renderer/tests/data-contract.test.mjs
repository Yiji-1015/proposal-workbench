import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { listBlockTypeDefinitions } from "../src/block-types.mjs";

const workbenchRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const contractPath = path.join(workbenchRoot, "references", "data-contract-v2.md");
const contract = await fs.readFile(contractPath, "utf8");

// 계약 문서가 코드와 갈라지면 조용히 틀린 청사진이 나온다. 실제로 문서는 블록 타입을
// 6종만 열거하고 block_pool_auto도 structure_approved도 없는 상태로 남아 있었고,
// 스킬은 그 문서를 필수 참조로 가리키고 있었다.
test("계약 문서의 블록 타입 표가 렌더러 등록 내용과 같다", () => {
  const defs = listBlockTypeDefinitions();
  const rows = [...contract.matchAll(/^\| `(\w+)` \| .*? \| (full|half) \| (\d+)~(\d+) \| (\w+) \|$/gm)]
    .map(([, id, span, min, max, kind]) => ({ id, span, min: Number(min), max: Number(max), kind }));

  assert.deepEqual(rows.map((r) => r.id), defs.map((d) => d.id), "표에 실린 타입 목록이 다르다");
  for (const [i, d] of defs.entries()) {
    assert.equal(rows[i].span, d.preferredSpan, `${d.id} span이 다르다`);
    assert.equal(rows[i].min, d.minItems, `${d.id} minItems가 다르다`);
    assert.equal(rows[i].max, d.maxItems, `${d.id} maxItems가 다르다`);
    assert.equal(rows[i].kind, d.contentKind, `${d.id} contentKind가 다르다`);
  }
  assert.match(contract, new RegExp(`등록된 ${defs.length}종`), "표 제목의 개수가 다르다");
});

test("계약 문서가 렌더러의 레이아웃 패밀리와 승인 상태를 담는다", () => {
  assert.match(contract, /block_pool_auto/);
  assert.match(contract, /"draft" \| "structure_approved" \| "approved"/);
  assert.match(contract, /span\?: "full" \| "half"/);
});

test("계약 문서 사본은 하나뿐이다", async () => {
  const skillDirs = await fs.readdir(path.join(workbenchRoot, "skills"), { withFileTypes: true });
  const copies = [];
  for (const dir of skillDirs.filter((d) => d.isDirectory())) {
    const candidate = path.join(workbenchRoot, "skills", dir.name, "references", "data-contract-v2.md");
    try {
      await fs.access(candidate);
      copies.push(candidate);
    } catch { /* 없으면 정상 */ }
  }
  assert.deepEqual(copies, [], "스킬 안에 계약 사본이 생기면 루트본과 갈라진다");
});
