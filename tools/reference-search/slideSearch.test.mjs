import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createServer } from "node:http";
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
    assert.equal(res.candidates.length, 1);
    assert.equal(res.candidates[0].slide_id, "deckA_1");

    // Test session creation
    const { session, sessionFilePath } = await createReferenceSession("보안 아키텍처", res, tempDir);
    assert.equal(session.search_mode, "lexical");
    assert.equal(session.candidates.length, 1);
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

test("lexical search excludes non-matching slides", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ref-search-filter-"));
  const db = initDatabase(tempDir);
  try {
    upsertDeckSlides(db, "deckB", [
      {
        slide_id: "deckB_1",
        slide_no: 1,
        source_pptx: "deckB.pptx",
        title: "프로젝트 일정",
        content_text: "RAG 관련 일정과 테스트 계획",
        image_description: "일정 관리",
        tags: ["RAG", "일정"],
        layout: "process",
        slide_type: "overview"
      },
      {
        slide_id: "deckB_2",
        slide_no: 2,
        source_pptx: "deckB.pptx",
        title: "AI 검색 아키텍처",
        content_text: "RAG 검색과 근거 재정렬 흐름",
        image_description: "검색 결과를 검증한다",
        tags: ["RAG", "검색"],
        layout: "diagram",
        slide_type: "architecture"
      },
      {
        slide_id: "deckB_3",
        slide_no: 3,
        source_pptx: "deckB.pptx",
        title: "개인정보 보안 통제",
        content_text: "PII 암호화와 접근제어를 적용한다",
        image_description: "보안 통제",
        tags: ["PII", "암호화"],
        layout: "diagram",
        slide_type: "content"
      },
      {
        slide_id: "deckB_4",
        slide_no: 4,
        source_pptx: "deckB.pptx",
        title: "벡터 저장소 운영",
        content_text: "벡터 색인과 운영 절차를 관리한다",
        image_description: "검색 인덱스 운영",
        tags: ["벡터", "운영"],
        layout: "process",
        slide_type: "strategy"
      }
    ]);

    const result = await searchSlides("RAG", { dataDir: tempDir, size: 10 });
    assert.deepEqual(result.candidates.map((candidate) => candidate.slide_id), ["deckB_2", "deckB_1"]);

    const koreanAlias = await searchSlides("검색증강생성", { dataDir: tempDir, size: 10 });
    assert.deepEqual(koreanAlias.candidates.map((candidate) => candidate.slide_id), ["deckB_2", "deckB_1"]);

    const spacedKoreanAlias = await searchSlides("검색 증강 생성", { dataDir: tempDir, size: 10 });
    assert.deepEqual(spacedKoreanAlias.candidates.map((candidate) => candidate.slide_id), ["deckB_2", "deckB_1"]);

    const privacyAlias = await searchSlides("개인정보", { dataDir: tempDir, size: 10 });
    assert.deepEqual(privacyAlias.candidates.map((candidate) => candidate.slide_id), ["deckB_3"]);

    const unregisteredTerm = await searchSlides("벡터", { dataDir: tempDir, size: 10 });
    assert.deepEqual(unregisteredTerm.candidates.map((candidate) => candidate.slide_id), ["deckB_4"]);

    const noMatch = await searchSlides("FAISS", { dataDir: tempDir, size: 10 });
    assert.equal(noMatch.candidates.length, 0);
  } finally {
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("falls back to lexical when query embedding exists but slides have no vectors", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ref-search-no-vectors-"));
  const db = initDatabase(tempDir);
  const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data: [{ embedding: [1, 0, 0] }] }));
  });

  try {
    upsertDeckSlides(db, "deckC", [{
      slide_id: "deckC_1",
      slide_no: 1,
      source_pptx: "deckC.pptx",
      title: "벡터 검색 구성",
      content_text: "벡터 저장소와 키워드 검색을 함께 사용한다",
      image_description: "검색 구성",
      tags: ["벡터", "검색"],
      layout: "diagram"
    }]);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const result = await searchSlides("벡터", {
      dataDir: tempDir,
      size: 10,
      embeddingApiUrl: `http://127.0.0.1:${address.port}/embed`
    });

    assert.equal(result.search_mode, "lexical");
    assert.match(result.reason, /No slide embeddings indexed/);
    assert.deepEqual(result.candidates.map((candidate) => candidate.slide_id), ["deckC_1"]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});
