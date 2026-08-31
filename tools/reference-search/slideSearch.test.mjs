import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { initDatabase, upsertDeckSlides } from "./sqlite_db.mjs";
import { searchSlides, createReferenceSession } from "./search_engine.mjs";

test("SQLite DB init and upsert deck slides with transaction", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ref-search-test-"));
  const db = initDatabase(tempDir);

  try {
    const sampleSlides = [
      {
        slide_id: "deckA_1",
        slide_no: 1,
        source_pptx: "deckA.pptx",
        title: "보안 아키텍처 구성도",
        content_text: "데이터 수집과 검색 서비스를 연계한다",
        image_description: "보안 경계와 시스템 흐름",
        tags: ["아키텍처", "구성도", "MSA"],
        layout: "diagram",
        vector: [0.1, 0.2, 0.3, 0.4]
      },
      {
        slide_id: "deckA_2",
        slide_no: 2,
        source_pptx: "deckA.pptx",
        title: "품질 관리 프로세스",
        content_text: "ISO 27001 기준으로 품질을 점검한다",
        image_description: "운영 품질 단계",
        tags: ["프로세스", "품질", "ISO"],
        layout: "process",
        vector: [0.5, 0.1, 0.0, 0.2]
      }
    ];

    upsertDeckSlides(db, "deckA", sampleSlides);

    const res = await searchSlides("보안 아키텍처", { dataDir: tempDir });
    assert.equal(res.search_mode, "lexical");
    assert.equal(res.candidates.length, 2);
    assert.equal(res.candidates[0].slide_id, "deckA_1");
    assert.ok(res.candidates[0].similarity > res.candidates[1].similarity);

    // Test session creation
    const { session, sessionFilePath } = await createReferenceSession("보안 아키텍처", res, tempDir);
    assert.equal(session.search_mode, "lexical");
    assert.equal(session.candidates.length, 2);
    const saved = JSON.parse(await fs.readFile(sessionFilePath, "utf8"));
    assert.equal(saved.session_id, session.session_id);
  } finally {
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("rejects empty search query", async () => {
  await assert.rejects(async () => {
    await searchSlides("");
  }, /empty/i);
});

test("returns empty candidates on empty database", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ref-search-empty-"));
  try {
    const res = await searchSlides("검색어 없음", { dataDir: tempDir });
    assert.equal(res.candidates.length, 0);
    assert.equal(res.search_mode, "none");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});
