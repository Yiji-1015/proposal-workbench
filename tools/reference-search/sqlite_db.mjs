import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const workbenchRoot = path.resolve(__dirname, "..", "..");

export function getDataDir(customDataDir = null) {
  if (customDataDir) return path.resolve(customDataDir);
  if (process.env.PROPOSAL_WORKBENCH_DATA_DIR) {
    return path.resolve(process.env.PROPOSAL_WORKBENCH_DATA_DIR);
  }
  return path.join(workbenchRoot, "storage");
}

export function getDbPath(customDataDir = null) {
  const dataDir = getDataDir(customDataDir);
  return path.join(dataDir, "index", "slides.sqlite3");
}

export function initDatabase(customDataDir = null) {
  const dbPath = getDbPath(customDataDir);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS slides (
      slide_id TEXT PRIMARY KEY,
      source_key TEXT NOT NULL,
      source_pptx TEXT NOT NULL,
      slide_no INTEGER NOT NULL,
      title TEXT,
      content_text TEXT,
      image_description TEXT,
      tags_json TEXT,
      layout TEXT,
      slide_type TEXT,
      image_ref TEXT,
      html_ref TEXT,
      vector BLOB,
      vector_dim INTEGER,
      embedding_model TEXT,
      render_status TEXT,
      embedding_status TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_slides_source_key ON slides(source_key);
  `);
  try {
    db.exec("ALTER TABLE slides ADD COLUMN slide_type TEXT");
  } catch (err) {
    if (!String(err.message || err).toLowerCase().includes("duplicate column name")) throw err;
  }

  return db;
}

export function blobToFloat32Array(blob) {
  if (!blob) return null;
  const buffer = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
}

export function float32ArrayToBuffer(float32Arr) {
  if (!float32Arr) return null;
  return Buffer.from(float32Arr.buffer, float32Arr.byteOffset, float32Arr.byteLength);
}

export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function upsertDeckSlides(db, source_key, slides) {
  db.exec("BEGIN TRANSACTION;");
  try {
    const delStmt = db.prepare("DELETE FROM slides WHERE source_key = ?");
    delStmt.run(source_key);

    const insertStmt = db.prepare(`
      INSERT INTO slides (
        slide_id, source_key, source_pptx, slide_no, title,
        content_text, image_description, tags_json, layout, slide_type,
        image_ref, html_ref, vector, vector_dim, embedding_model,
        render_status, embedding_status, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?
      )
    `);

    for (const s of slides) {
      let vecBuf = null;
      let vecDim = 0;
      if (s.vector) {
        if (s.vector instanceof Float32Array) {
          vecBuf = float32ArrayToBuffer(s.vector);
          vecDim = s.vector.length;
        } else if (Array.isArray(s.vector)) {
          const f32 = new Float32Array(s.vector);
          vecBuf = float32ArrayToBuffer(f32);
          vecDim = s.vector.length;
        } else if (Buffer.isBuffer(s.vector)) {
          vecBuf = s.vector;
          vecDim = s.vector_dim || (s.vector.length / 4);
        }
      }

      insertStmt.run(
        s.slide_id,
        source_key,
        s.source_pptx || "",
        s.slide_no || 0,
        s.title || "",
        s.content_text || "",
        s.image_description || "",
        typeof s.tags_json === "string" ? s.tags_json : JSON.stringify(s.tags || []),
        s.layout || "diagram",
        s.slide_type || "content",
        s.image_ref || "",
        s.html_ref || "",
        vecBuf,
        vecDim,
        s.embedding_model || "",
        s.render_status || "completed",
        s.embedding_status || "skipped",
        s.updated_at || new Date().toISOString()
      );
    }
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}
