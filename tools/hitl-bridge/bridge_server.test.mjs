import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import path from "node:path";

import { getSelectedSlides, isSafePath, isValidIdentifier, resolveSourcePptx } from "./bridge_server.mjs";

test("accepts Korean deck identifiers but rejects path syntax", () => {
  assert.equal(isValidIdentifier("제안서_테스트_abc123"), true);
  assert.equal(isValidIdentifier("bad/id"), false);
  assert.equal(isValidIdentifier("a".repeat(129)), false);
});

test("keeps sibling paths outside the protected directory", () => {
  const baseDir = path.resolve("storage");
  assert.equal(isSafePath(baseDir, path.join(baseDir, "sessions", "ok.json")), true);
  assert.equal(isSafePath(baseDir, `${baseDir}-sibling\u005csecret.json`), false);
});

test("picker keeps local selection across rerenders", async () => {
  const picker = await fs.readFile(new URL("./public/picker.html", import.meta.url), "utf8");
  const hydration = picker.match(/selectedIds = new Set\(sessionData\.selected_slide_ids \|\| \[\]\)/g) || [];
  assert.equal(hydration.length, 1);
  assert.match(picker, /card\.setAttribute\('role', 'checkbox'\)/);
  assert.match(picker, /download\.textContent = 'PNG 다운로드'/);
  assert.doesNotMatch(picker, /id="btnExportPptx"/);
  assert.doesNotMatch(picker, /getExportBlockReason/);
  assert.doesNotMatch(picker, /\/export-pptx/);
  assert.match(picker, /선택이 저장됐습니다\. Agent 채팅창/);
});

test("resolves selected slide numbers from one source deck", () => {
  const session = {
    selected_slide_ids: ["sample_deck_s028", "sample_deck_s003"],
    candidates: [
      { slide_id: "sample_deck_s003", source_key: "sample_deck", slide_no: 3 },
      { slide_id: "sample_deck_s028", source_key: "sample_deck", slide_no: 28 },
    ],
  };

  assert.deepEqual(getSelectedSlides(session), {
    sourceKey: "sample_deck",
    slideNumbers: [3, 28],
  });
});

test("rejects unknown or cross-deck PPTX selections", () => {
  assert.throws(
    () => getSelectedSlides({ selected_slide_ids: ["missing_s001"], candidates: [] }),
    /not found/i,
  );
  assert.throws(
    () => getSelectedSlides({
      selected_slide_ids: ["deck_a_s001", "deck_b_s002"],
      candidates: [
        { slide_id: "deck_a_s001", source_key: "deck_a", slide_no: 1 },
        { slide_id: "deck_b_s002", source_key: "deck_b", slide_no: 2 },
      ],
    }),
    /one source deck/i,
  );
});

test("파이썬 탐지는 필요한 모듈을 가진 인터프리터를 우선한다", async () => {
  // 첫 인터프리터를 무조건 고르면 pywin32 없는 파이썬이 잡혀 COM 렌더링과 PPTX
  // 추출이 조용히 실패한다. 실제로 번들 파이썬(3.12)이 먼저 잡혀 그렇게 됐다.
  const { detectPythonCommand } = await import("../verify-workbench.mjs");
  const plain = detectPythonCommand();
  if (!plain) return; // 파이썬이 없는 환경에서는 검사할 것이 없다.
  assert.equal(plain.satisfiesRequired, true, "요구 모듈이 없으면 항상 만족으로 본다");

  // 어떤 파이썬에도 없는 모듈을 요구하면 실행 가능한 후보로 물러나되 사실대로 알린다.
  const impossible = detectPythonCommand({ require: ["module_that_cannot_exist_9f3a"] });
  assert.ok(impossible, "요구를 만족하지 못해도 실행 가능한 파이썬은 돌려준다");
  assert.equal(impossible.satisfiesRequired, false, "만족하지 못했음을 숨기지 않는다");

  // 표준 라이브러리를 요구하면 만족하는 후보를 고른다.
  const stdlib = detectPythonCommand({ require: ["json"] });
  assert.equal(stdlib.satisfiesRequired, true);
});

test("names the recorded path when the original PPTX has moved", async () => {
  const missing = path.resolve("storage", "ingest_data", "nope", "gone.pptx");
  await assert.rejects(
    () => resolveSourcePptx({ source_path: missing }, "deck_key"),
    (err) => {
      assert.match(err.message, /not at the recorded path/);
      assert.ok(err.message.includes(missing), "기록된 경로를 알려주지 않는다");
      assert.match(err.message, /re-ingest "deck_key"/);
      assert.doesNotMatch(err.message, /ENOENT/);
      return true;
    },
  );
});

test("still tells the user to re-ingest when the path was never recorded", async () => {
  await assert.rejects(
    () => resolveSourcePptx({}, "deck_key"),
    /Original PowerPoint path is missing/,
  );
});

test("rejects a recorded source that is not a PPT or PPTX", async () => {
  await assert.rejects(
    () => resolveSourcePptx({ source_path: "deck.pdf" }, "deck_key"),
    /only when the original source is a PPT or PPTX file/,
  );
});

test("accepts a recorded legacy PPT source", async () => {
  const tmp = path.resolve(`__probe_${Date.now()}.ppt`);
  await fs.writeFile(tmp, "x");
  try {
    assert.equal(await resolveSourcePptx({ source_path: tmp }, "deck_key"), tmp);
  } finally {
    await fs.rm(tmp, { force: true });
  }
});

test("returns the resolved path when the original is still there", async () => {
  const tmp = path.resolve(`__probe_${Date.now()}.pptx`);
  await fs.writeFile(tmp, "x");
  try {
    assert.equal(await resolveSourcePptx({ source_path: tmp }, "deck_key"), tmp);
  } finally {
    await fs.rm(tmp, { force: true });
  }
});
