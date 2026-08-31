import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import {
  initDatabase,
  getDataDir,
  blobToFloat32Array,
  cosineSimilarity,
  workbenchRoot
} from "./sqlite_db.mjs";

// Optional deterministic exceptions. Ordinary search must not depend on manual registration.
let QUERY_CONCEPTS = [];
try {
  const config = JSON.parse(fsSync.readFileSync(
    path.join(workbenchRoot, "tools", "reference-search", "query_concepts.json"),
    "utf8"
  ));
  QUERY_CONCEPTS = Array.isArray(config.concepts) ? config.concepts : [];
} catch {
  QUERY_CONCEPTS = [];
}

export function generateSessionId() {
  const now = new Date();
  const timeStr = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const randomStr = Math.random().toString(36).substring(2, 6);
  return `ref_${timeStr}_${randomStr}`;
}

async function requestJson(urlStr, options = {}, postData = null, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const client = url.protocol === "https:" ? https : http;
    const reqOptions = {
      method: options.method || "GET",
      headers: options.headers || {},
      timeout: timeoutMs,
    };

    const req = client.request(url, reqOptions, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Invalid JSON response: ${e.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Timeout connecting to ${urlStr}`));
    });

    if (postData) {
      req.write(typeof postData === "string" ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function fetchQueryEmbedding(embeddingApiUrl, query, modelName = "BAAI/bge-m3") {
  if (!embeddingApiUrl) return null;
  try {
    const payload = { input: query, model: modelName };
    const res = await requestJson(embeddingApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }, payload);

    if (res.data && Array.isArray(res.data) && res.data[0]?.embedding) {
      return new Float32Array(res.data[0].embedding);
    }
    if (res.embedding && Array.isArray(res.embedding)) {
      return new Float32Array(res.embedding);
    }
    return null;
  } catch (err) {
    return null;
  }
}

function containsTerm(text, term) {
  const haystack = String(text || "").toLowerCase();
  const needle = String(term || "").toLowerCase();
  if (/^[a-z0-9]+$/i.test(needle)) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`).test(haystack);
  }
  return haystack.includes(needle);
}

function normalizeAlias(value) {
  return value.toLowerCase().replace(/[\s-]+/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
}

function containsAlias(text, alias) {
  return /^[a-z0-9]+$/i.test(alias)
    ? containsTerm(text, alias)
    : normalizeAlias(text).includes(normalizeAlias(alias));
}

function findQueryConcept(query) {
  return QUERY_CONCEPTS.find((concept) => concept.aliases.some((alias) => {
    return containsAlias(query, alias);
  })) || null;
}

function isConceptOnlyQuery(query, concept) {
  const normalized = normalizeAlias(query);
  return concept.aliases.some((alias) => normalized === normalizeAlias(alias));
}

function canonicalizeQuery(query) {
  let canonical = query;
  for (const concept of QUERY_CONCEPTS) {
    for (const alias of [...concept.aliases].sort((a, b) => b.length - a.length)) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = /^[a-z0-9]+$/i.test(alias)
        ? `\\b${escaped}\\b`
        : escaped.replace(/\s+/g, "\\s*");
      canonical = canonical.replace(new RegExp(pattern, "gi"), concept.canonical);
    }
  }
  return canonical;
}

function calculateLexicalScore(query, slide) {
  const concept = findQueryConcept(query);
  const qClean = canonicalizeQuery(query).trim().toLowerCase();
  const terms = qClean.split(/\s+/).filter((t) => t.length >= 2);
  if (terms.length === 0) return 0;

  const title = (slide.title || "").toLowerCase();
  const content = (slide.content_text || "").toLowerCase();
  const desc = (slide.image_description || "").toLowerCase();
  const slideType = slide.slide_type || "";
  let tags = [];
  try {
    tags = JSON.parse(slide.tags_json || "[]").map((t) => String(t).toLowerCase());
  } catch {}

  let score = 0;
  const maxPossible = 10 + terms.length * 8;

  // 1. Exact query match in title
  if (containsTerm(title, qClean)) {
    score += 10.0;
  }

  // 2. Term matches
  for (const term of terms) {
    if (containsTerm(title, term)) score += 4.0;
    if (tags.some((tag) => containsTerm(tag, term))) score += 3.0;
    if (containsTerm(desc, term)) score += 1.5;
    if (containsTerm(content, term)) score += 1.0;
  }

  if (concept) {
    const aliases = (concept.aliases || []).filter(
      (alias) => normalizeAlias(alias) !== normalizeAlias(concept.canonical)
    );
    if (aliases.some((alias) => containsAlias(title, alias))) score += 4.0;
    if (aliases.some((alias) => tags.some((tag) => containsAlias(tag, alias)))) score += 3.0;
    if (aliases.some((alias) => containsAlias(desc, alias))) score += 1.5;
    if (aliases.some((alias) => containsAlias(content, alias))) score += 1.0;
  }

  // 3. Keyword weights (architecture/process diagrams)
  const coreKeywords = ["아키텍처", "구성도", "흐름도", "프로세스", "단계", "연계"];
  for (const kw of coreKeywords) {
    if (qClean.includes(kw)) {
      if (title.includes(kw) || tags.some((t) => t.includes(kw))) {
        score += 2.0;
      }
    }
  }

  // Generic structure prior: an unregistered term found only in body text is
  // more useful from a structure/strategy slide than from a broad overview.
  if (score > 0 && terms.length === 1 && slideType && slideType !== "overview") {
    const titleMatch = containsTerm(title, terms[0]);
    const tagMatch = tags.some((tag) => containsTerm(tag, terms[0]));
    if (!titleMatch && !tagMatch) {
      if (slideType === "architecture") score += 1.5;
      else if (slideType === "strategy") score += 0.75;
    }
  }

  // ponytail: acronym-only intent boost; replace with BGE-M3/reranker when semantic search is available.
  if (score > 0 && concept && isConceptOnlyQuery(query, concept)) {
    for (const { term: keyword, weight } of concept.context_signals || []) {
      if (containsTerm(title, keyword)) score += weight * 2;
      else if (containsTerm(content, keyword) || containsTerm(desc, keyword)) score += weight;
    }
    if (slide.layout === "diagram") score += 0.5;
  }

  const normalized = score === 0 ? 0 : Math.min(0.98, Math.max(0.1, score / maxPossible));
  return Number(normalized.toFixed(2));
}

export async function searchSlides(query, options = {}) {
  if (!query || typeof query !== "string" || !query.trim()) {
    throw new Error("Query string cannot be empty.");
  }

  const size = Number(options.size || 7);
  const dataDir = getDataDir(options.dataDir);
  const db = initDatabase(dataDir);

  const stmt = db.prepare(`
    SELECT slide_id, source_key, source_pptx, slide_no, title,
           content_text, image_description, tags_json, layout, slide_type,
           image_ref, html_ref, vector, vector_dim, embedding_model,
           render_status, embedding_status
    FROM slides
  `);
  let allSlides = [];
  try {
    allSlides = stmt.all();
  } finally {
    db.close();
  }

  if (!allSlides || allSlides.length === 0) {
    return {
      search_mode: "none",
      reason: "No slides indexed in SQLite database.",
      candidates: []
    };
  }

  const embeddingApiUrl = options.embeddingApiUrl || process.env.EMBEDDING_API_URL;
  const embeddingModel = options.embeddingModel || process.env.EMBEDDING_MODEL || "BAAI/bge-m3";

  let queryVector = null;
  if (embeddingApiUrl) {
    queryVector = await fetchQueryEmbedding(embeddingApiUrl, query, embeddingModel);
  }

  const vectorSlides = allSlides.filter((slide) => slide.vector);
  if (queryVector && vectorSlides.length > 0) {
    // Semantic Vector Search
    const scored = [];
    for (const slide of vectorSlides) {
      const slideVec = blobToFloat32Array(slide.vector);
      const sim = cosineSimilarity(queryVector, slideVec);
      scored.push({ slide, score: Number(sim.toFixed(4)) });
    }
    scored.sort((a, b) => b.score - a.score);

    const candidates = scored.slice(0, size).map(({ slide, score }) => {
      let tags = [];
      try { tags = JSON.parse(slide.tags_json || "[]"); } catch {}
      return {
        slide_id: slide.slide_id,
        source_key: slide.source_key,
        source_pptx: slide.source_pptx,
        slide_no: slide.slide_no,
        title: slide.title,
        image_description: slide.image_description,
        tags,
        similarity: Number(score.toFixed(2)),
        image_ref: slide.image_ref,
        html_ref: slide.html_ref,
        layout: slide.layout || "diagram",
        slide_type: slide.slide_type || "content"
      };
    });

    return {
      search_mode: "semantic",
      embedding_model: embeddingModel,
      candidates
    };
  } else {
    // Lexical Fallback Search
    const scored = allSlides.map((slide) => ({
      slide,
      score: calculateLexicalScore(query, slide)
    })).filter(({ score }) => score > 0);
    scored.sort((a, b) => b.score - a.score);

    const candidates = scored.slice(0, size).map(({ slide, score }) => {
      let tags = [];
      try { tags = JSON.parse(slide.tags_json || "[]"); } catch {}
      return {
        slide_id: slide.slide_id,
        source_key: slide.source_key,
        source_pptx: slide.source_pptx,
        slide_no: slide.slide_no,
        title: slide.title,
        image_description: slide.image_description,
        tags,
        similarity: score,
        image_ref: slide.image_ref,
        html_ref: slide.html_ref,
        layout: slide.layout || "diagram",
        slide_type: slide.slide_type || "content"
      };
    });

    return {
      search_mode: "lexical",
      reason: scored.length === 0
        ? "No lexical matches found."
        : queryVector && vectorSlides.length === 0
          ? "No slide embeddings indexed; used lexical ranking. Unregistered synonyms require BGE-M3 slide embeddings."
          : embeddingApiUrl ? "Embedding API returned error; used lexical ranking" : "EMBEDDING_API_URL not configured; used lexical ranking",
      candidates
    };
  }
}

export async function createReferenceSession(query, searchResult, customDataDir = null, customSessionId = null) {
  const sid = customSessionId || generateSessionId();
  const dataDir = getDataDir(customDataDir);
  const sessionDir = path.join(dataDir, "sessions");
  await fs.mkdir(sessionDir, { recursive: true });

  const session = {
    session_id: sid,
    created_at: new Date().toISOString(),
    query,
    search_mode: searchResult.search_mode,
    ...(searchResult.embedding_model ? { embedding_model: searchResult.embedding_model } : {}),
    ...(searchResult.reason ? { search_note: searchResult.reason } : {}),
    candidates: searchResult.candidates,
    selected_slide_ids: [],
    status: "pending"
  };

  const tempFile = path.join(sessionDir, `${sid}.tmp.${Date.now()}`);
  const targetFile = path.join(sessionDir, `${sid}.json`);
  await fs.writeFile(tempFile, JSON.stringify(session, null, 2), "utf8");
  await fs.rename(tempFile, targetFile);

  return { session, sessionFilePath: targetFile, sessionId: sid };
}
