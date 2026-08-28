#!/usr/bin/env node
/**
 * search_cli.mjs
 * 자연어 질의로 Elasticsearch KNN 벡터 검색을 수행하고,
 * 결과를 HitL Reference Picker 세션 파일(storage/sessions/ref_<id>.json)로 저장합니다.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadSearchEnv, searchSlidesByKnn } from "./esSearch.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workbenchRoot = path.resolve(__dirname, "..", "..");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    args[key] = argv[i + 1];
  }
  return args;
}

function generateSessionId() {
  const now = new Date();
  const timeStr = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const randomStr = Math.random().toString(36).substring(2, 6);
  return `ref_${timeStr}_${randomStr}`;
}

async function findLocalIngestCandidates(query, size = 7) {
  // 로컬 storage/ingest_data 폴더 내의 manifest 파일들을 검색하는 fallback
  const ingestDir = path.join(workbenchRoot, "storage", "ingest_data");
  const candidates = [];
  try {
    const dirs = await fs.readdir(ingestDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const manifestPath = path.join(ingestDir, dir.name, "manifest.json");
      try {
        const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
        for (const slide of manifest.slides || []) {
          candidates.push({
            slide_id: slide.slide_id,
            source_pptx: slide.source_pptx,
            slide_no: slide.slide_no,
            title: slide.title,
            image_description: slide.image_description,
            tags: slide.tags || [],
            similarity: 0.85,
            image_ref: `/storage/ingest_data/${dir.name}${slide.image_ref}`,
            html_ref: `/storage/ingest_data/${dir.name}${slide.html_ref}`,
            layout: slide.layout || "diagram",
          });
        }
      } catch {}
    }
  } catch {}
  return candidates.slice(0, size);
}

export async function executeSearch(query, size = 7, sessionId = null) {
  const env = loadSearchEnv(workbenchRoot);
  const sid = sessionId || generateSessionId();
  let results = [];

  try {
    if (env.ELASTICSEARCH_URL && env.EMBEDDING_API_URL) {
      console.log(`[ES Search] Querying Elasticsearch KNN for: "${query}" (size=${size})`);
      results = await searchSlidesByKnn(env, query, size);
    } else {
      console.log(`[Local Fallback] Searching local ingest candidates for: "${query}"`);
      results = await findLocalIngestCandidates(query, size);
    }
  } catch (err) {
    console.warn(`[Search Warn] KNN search failed (${err.message}). Using local ingest fallback.`);
    results = await findLocalIngestCandidates(query, size);
  }

  // candidates 정규화
  const candidates = results.map((r, idx) => ({
    slide_id: r.slide_id || `s-${idx + 1}`,
    source_pptx: r.source_pptx || "제안서_참조.pptx",
    slide_no: r.slide_no || (idx + 1),
    title: r.title || `슬라이드 ${idx + 1}`,
    image_description: r.image_description || "",
    tags: r.tags || [],
    similarity: Number((r.score || r.similarity || (0.95 - idx * 0.05)).toFixed(2)),
    image_ref: r.image_ref || `/slides/slide-${idx + 1}.png`,
    html_ref: r.html_ref || `/html/slide_${String(idx + 1).padStart(2, "0")}.html`,
    layout: r.layout || "diagram",
  }));

  const session = {
    session_id: sid,
    created_at: new Date().toISOString(),
    query,
    candidates,
    selected_slide_ids: [],
    status: "pending",
  };

  const sessionDir = path.join(workbenchRoot, "storage", "sessions");
  await fs.mkdir(sessionDir, { recursive: true });
  const sessionFilePath = path.join(sessionDir, `${sid}.json`);
  await fs.writeFile(sessionFilePath, JSON.stringify(session, null, 2), "utf8");

  return { session, sessionFilePath, sid };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const query = args.query || args.q || "로그 수집 및 Elasticsearch 저장 아키텍처";
  const size = Number(args.size || 7);
  const sessionId = args.session || null;

  const { session, sessionFilePath, sid } = await executeSearch(query, size, sessionId);
  console.log(`\n==========================================`);
  console.log(`[Reference Search Complete] Session ID: ${sid}`);
  console.log(`[Candidates Found] ${session.candidates.length} slides`);
  console.log(`[Session File] ${sessionFilePath}`);
  console.log(`[HitL URL] http://localhost:5173/search?session=${sid}`);
  console.log(`==========================================\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(`[Error] Search CLI failed: ${err.message}`);
    process.exit(1);
  });
}
