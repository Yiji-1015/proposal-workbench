#!/usr/bin/env node
/**
 * search_cli.mjs
 * SQLite3 슬라이드 검색 결과를 HitL Reference Picker 세션으로 저장한다.
 */

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { searchSlides, createReferenceSession } from "./search_engine.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

export async function executeSearch(query, size = 7, sessionId = null, dataDir = null) {
  const searchResult = await searchSlides(query, { size, dataDir });
  const { session, sessionFilePath, sessionId: sid } = await createReferenceSession(
    query,
    searchResult,
    dataDir,
    sessionId
  );
  return { session, sessionFilePath, sid };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const query = args.query || args.q;
  if (!query || typeof query !== "string" || !query.trim()) {
    console.error("Error: --query <search_text> is required and cannot be empty.");
    process.exit(1);
  }

  const size = Number(args.size || 7);
  const sessionId = args.session || null;
  const dataDir = args["data-dir"] || null;

  const { session, sessionFilePath, sid } = await executeSearch(query, size, sessionId, dataDir);

  console.log(`\n==========================================`);
  console.log(`[Reference Search Complete] Session ID: ${sid}`);
  console.log(`[Search Mode] ${session.search_mode}`);
  if (session.embedding_model) console.log(`[Embedding Model] ${session.embedding_model}`);
  if (session.search_note) console.log(`[Note] ${session.search_note}`);
  console.log(`[Candidates Found] ${session.candidates.length} slides`);
  console.log(`[Session File] ${sessionFilePath}`);
  console.log(`[HitL URL] http://127.0.0.1:5274/picker.html?session=${sid}`);
  console.log(`==========================================\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(`[Error] Search CLI failed: ${err.message}`);
    process.exit(1);
  });
}
