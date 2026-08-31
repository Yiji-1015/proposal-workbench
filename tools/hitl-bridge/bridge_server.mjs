#!/usr/bin/env node
/**
 * bridge_server.mjs
 * Human-in-the-loop (HitL) 브라우저 검토 화면과 세션 API를 제공한다.
 * - 포트: 5274 (고정)
 * - 호스트: 127.0.0.1
 * - Zero-dependency & Offline: 외부 CDN 없이 동작
 * - 보호: 경로 탐색, XSS, 과도한 JSON 요청 방어
 */

import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { searchSlides } from "../reference-search/search_engine.mjs";
import { detectPythonCommand } from "../verify-workbench.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workbenchRoot = path.resolve(__dirname, "..", "..");
const publicDir = path.join(__dirname, "public");
const PORT = 5274;
const HOST = "127.0.0.1";

function getDataDir() {
  if (process.env.PROPOSAL_WORKBENCH_DATA_DIR) {
    return path.resolve(process.env.PROPOSAL_WORKBENCH_DATA_DIR);
  }
  return path.join(workbenchRoot, "storage");
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
  });
  res.end(JSON.stringify(data));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

async function readBodyJson(req, maxBytes = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error("Request body too large."));
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error(`Invalid JSON in request: ${e.message}`));
      }
    });
  });
}

export function isValidIdentifier(id) {
  return typeof id === "string" && /^[\p{L}\p{N}_-]{1,128}$/u.test(id);
}

export function isSafePath(baseDir, targetPath) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget === resolvedBase || resolvedTarget.startsWith(`${resolvedBase}${path.sep}`);
}

export function getSelectedSlides(session) {
  const selectedIds = Array.isArray(session?.selected_slide_ids) ? session.selected_slide_ids : [];
  if (selectedIds.length === 0) throw new Error("No slides selected.");
  if (new Set(selectedIds).size !== selectedIds.length) throw new Error("Duplicate slide selection.");

  const candidates = new Map((session.candidates || []).map((candidate) => [candidate.slide_id, candidate]));
  const selected = selectedIds.map((slideId) => {
    const candidate = candidates.get(slideId);
    if (!candidate) throw new Error(`Selected slide not found in session: ${slideId}`);
    const sourceKey = candidate.source_key || String(slideId).replace(/_s\d+$/u, "");
    const slideNo = Number(candidate.slide_no);
    if (!isValidIdentifier(sourceKey) || !Number.isInteger(slideNo) || slideNo < 1) {
      throw new Error(`Invalid selected slide metadata: ${slideId}`);
    }
    return { sourceKey, slideNo };
  });

  const sourceKeys = new Set(selected.map((slide) => slide.sourceKey));
  if (sourceKeys.size !== 1) throw new Error("PPTX export supports one source deck at a time.");
  return {
    sourceKey: selected[0].sourceKey,
    slideNumbers: selected.map((slide) => slide.slideNo).sort((a, b) => a - b),
  };
}

function runProcess(command, args, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: workbenchRoot, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => finish(error));
    child.once("close", (code) => {
      if (timedOut) finish(new Error(`PPTX export timed out after ${timeoutMs / 1000} seconds.`));
      else if (code === 0) finish(null, stdout.trim());
      else finish(new Error(stderr.trim() || stdout.trim() || `Exporter exited with code ${code}.`));
    });
  });
}

async function exportSelectedSlides(sessionId, session, dataDir) {
  const { sourceKey, slideNumbers } = getSelectedSlides(session);
  const manifestFile = path.join(dataDir, "ingest_data", sourceKey, "manifest.json");
  if (!isSafePath(dataDir, manifestFile)) throw new Error("Access denied.");
  const manifest = JSON.parse(await fs.readFile(manifestFile, "utf8"));
  if (!manifest.source_path) throw new Error("Original PPTX path is missing. Re-ingest this deck once.");

  const sourcePptx = path.resolve(manifest.source_path);
  if (path.extname(sourcePptx).toLowerCase() !== ".pptx") throw new Error("Original source is not a PPTX file.");
  await fs.access(sourcePptx);

  const python = detectPythonCommand();
  if (!python) throw new Error("Python runtime not found. Run node tools/verify-workbench.mjs.");

  const deliverablesDir = path.join(dataDir, "deliverables");
  const fileName = `${sessionId}-selected-${Date.now()}-${randomUUID().slice(0, 8)}.pptx`;
  const outputPptx = path.join(deliverablesDir, fileName);
  if (!isSafePath(deliverablesDir, outputPptx)) throw new Error("Invalid output path.");
  const normalizePath = (value) => process.platform === "win32"
    ? path.resolve(value).toLowerCase()
    : path.resolve(value);
  if (normalizePath(sourcePptx) === normalizePath(outputPptx)) {
    throw new Error("Source and output PPTX paths must be different.");
  }
  await fs.mkdir(deliverablesDir, { recursive: true });

  const exporter = path.join(workbenchRoot, "tools", "ppt-ingest", "export_selected_slides_com.py");
  await runProcess(python.cmd, [
    exporter,
    "--pptx", sourcePptx,
    "--output-pptx", outputPptx,
    "--slides", slideNumbers.join(","),
  ]);

  return { fileName, outputPptx, slideNumbers };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const dataDir = getDataDir();

  // 1. 세션 조회: GET /api/sessions/:id
  const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (req.method === "GET" && sessionMatch) {
    const sessionId = decodeURIComponent(sessionMatch[1]);
    if (!isValidIdentifier(sessionId)) {
      sendError(res, 400, "Invalid session ID format.");
      return;
    }
    const sessionFile = path.join(dataDir, "sessions", `${sessionId}.json`);
    if (!isSafePath(dataDir, sessionFile)) {
      sendError(res, 403, "Access denied.");
      return;
    }
    try {
      const data = JSON.parse(await fs.readFile(sessionFile, "utf8"));
      sendJson(res, 200, data);
    } catch {
      sendError(res, 404, `Session not found: ${sessionId}`);
    }
    return;
  }

  // 1-0. Reference Picker 자유 검색: POST /api/sessions/:id/search
  const searchMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/search$/);
  if (req.method === "POST" && searchMatch) {
    const sessionId = decodeURIComponent(searchMatch[1]);
    if (!isValidIdentifier(sessionId)) {
      sendError(res, 400, "Invalid session ID.");
      return;
    }
    const sessionFile = path.join(dataDir, "sessions", `${sessionId}.json`);
    if (!isSafePath(dataDir, sessionFile)) {
      sendError(res, 403, "Access denied.");
      return;
    }

    try {
      const body = await readBodyJson(req);
      const query = typeof body?.query === "string" ? body.query.trim() : "";
      if (!query) {
        sendError(res, 400, "Query string cannot be empty.");
        return;
      }
      if (query.length > 500) {
        sendError(res, 400, "Query string is too long.");
        return;
      }

      const requestedSize = Number(body?.size ?? 10);
      const size = Number.isInteger(requestedSize) && requestedSize > 0
        ? Math.min(requestedSize, 50)
        : 10;
      const session = JSON.parse(await fs.readFile(sessionFile, "utf8"));
      const searchResult = await searchSlides(query, { size, dataDir });

      session.query = query;
      session.search_mode = searchResult.search_mode;
      if (searchResult.embedding_model) session.embedding_model = searchResult.embedding_model;
      else delete session.embedding_model;
      if (searchResult.reason) session.search_note = searchResult.reason;
      else delete session.search_note;
      session.candidates = searchResult.candidates;
      session.selected_slide_ids = [];
      session.status = "pending";
      delete session.completed_at;

      const tmpFile = `${sessionFile}.tmp.${Date.now()}`;
      await fs.writeFile(tmpFile, JSON.stringify(session, null, 2), "utf8");
      await fs.rename(tmpFile, sessionFile);

      sendJson(res, 200, { success: true, session });
    } catch (err) {
      sendError(res, 500, `Failed to search slides: ${err.message}`);
    }
    return;
  }

  // 1-1. 인제스트 매니페스트 조회: GET /api/ingest/:stem
  const ingestMatch = url.pathname.match(/^\/api\/ingest\/([^/]+)$/);
  if (req.method === "GET" && ingestMatch) {
    const stem = decodeURIComponent(ingestMatch[1]);
    if (!isValidIdentifier(stem)) {
      sendError(res, 400, "Invalid deck identifier.");
      return;
    }
    const manifestFile = path.join(dataDir, "ingest_data", stem, "manifest.json");
    if (!isSafePath(dataDir, manifestFile)) {
      sendError(res, 403, "Access denied.");
      return;
    }
    try {
      const data = JSON.parse(await fs.readFile(manifestFile, "utf8"));
      sendJson(res, 200, data);
    } catch {
      sendError(res, 404, `Ingest manifest not found: ${stem}`);
    }
    return;
  }

  // 2. Reference Picker 선택 저장: POST /api/sessions/:id/select
  const selectMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/select$/);
  if (req.method === "POST" && selectMatch) {
    const sessionId = decodeURIComponent(selectMatch[1]);
    if (!isValidIdentifier(sessionId)) {
      sendError(res, 400, "Invalid session ID.");
      return;
    }
    const sessionFile = path.join(dataDir, "sessions", `${sessionId}.json`);
    if (!isSafePath(dataDir, sessionFile)) {
      sendError(res, 403, "Access denied.");
      return;
    }
    try {
      const body = await readBodyJson(req);
      const selectedIds = Array.isArray(body.selected_slide_ids) ? body.selected_slide_ids : (body.selectedIds || []);
      const session = JSON.parse(await fs.readFile(sessionFile, "utf8"));
      session.selected_slide_ids = selectedIds;
      session.status = "completed";
      session.completed_at = new Date().toISOString();

      const tmpFile = `${sessionFile}.tmp.${Date.now()}`;
      await fs.writeFile(tmpFile, JSON.stringify(session, null, 2), "utf8");
      await fs.rename(tmpFile, sessionFile);

      console.log(`[Bridge Server] Session ${sessionId} selected: ${selectedIds.join(", ")}`);
      sendJson(res, 200, { success: true, session_id: sessionId, selected_slide_ids: selectedIds });
    } catch (err) {
      sendError(res, 500, "Failed to update session.");
    }
    return;
  }

  // 3. Blueprint 검토/승인: POST /api/sessions/:id/approve
  const approveMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/approve$/);
  if (req.method === "POST" && approveMatch) {
    const sessionId = decodeURIComponent(approveMatch[1]);
    if (!isValidIdentifier(sessionId)) {
      sendError(res, 400, "Invalid session ID.");
      return;
    }
    const sessionFile = path.join(dataDir, "sessions", `${sessionId}.json`);
    if (!isSafePath(dataDir, sessionFile)) {
      sendError(res, 403, "Access denied.");
      return;
    }
    try {
      const body = await readBodyJson(req);
      const session = JSON.parse(await fs.readFile(sessionFile, "utf8"));
      if (body.blueprint) {
        session.blueprint = body.blueprint;
      }
      session.status = "approved";
      session.approved_at = new Date().toISOString();

      const tmpFile = `${sessionFile}.tmp.${Date.now()}`;
      await fs.writeFile(tmpFile, JSON.stringify(session, null, 2), "utf8");
      await fs.rename(tmpFile, sessionFile);

      console.log(`[Bridge Server] Blueprint Session ${sessionId} approved!`);
      sendJson(res, 200, { success: true, session_id: sessionId, status: "approved" });
    } catch (err) {
      sendError(res, 500, "Failed to approve blueprint.");
    }
    return;
  }

  // 3-1. 선택한 원본 장표를 편집 가능한 PPTX로 추출
  const exportMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/export-pptx$/);
  if (req.method === "POST" && exportMatch) {
    const sessionId = decodeURIComponent(exportMatch[1]);
    if (!isValidIdentifier(sessionId)) {
      sendError(res, 400, "Invalid session ID.");
      return;
    }
    const sessionFile = path.join(dataDir, "sessions", `${sessionId}.json`);
    if (!isSafePath(dataDir, sessionFile)) {
      sendError(res, 403, "Access denied.");
      return;
    }
    try {
      const body = await readBodyJson(req);
      const session = JSON.parse(await fs.readFile(sessionFile, "utf8"));
      const selectedIds = Array.isArray(body.selected_slide_ids)
        ? body.selected_slide_ids
        : session.selected_slide_ids;
      const exportSession = { ...session, selected_slide_ids: selectedIds };
      const exported = await exportSelectedSlides(sessionId, exportSession, dataDir);

      session.selected_slide_ids = selectedIds;
      session.status = "completed";
      session.completed_at = new Date().toISOString();
      const tmpFile = `${sessionFile}.tmp.${Date.now()}`;
      await fs.writeFile(tmpFile, JSON.stringify(session, null, 2), "utf8");
      await fs.rename(tmpFile, sessionFile);

      sendJson(res, 200, {
        success: true,
        file_name: exported.fileName,
        slide_numbers: exported.slideNumbers,
        download_url: `/storage/deliverables/${encodeURIComponent(exported.fileName)}`,
      });
    } catch (err) {
      sendError(res, 500, `Failed to export PPTX: ${err.message}`);
    }
    return;
  }

  // 4. 인제스트 이미지와 HTML 제공 (/storage/ingest_data/...)
  if (url.pathname.startsWith("/storage/ingest_data/")) {
    const relPath = decodeURIComponent(url.pathname.replace(/^\/storage\/ingest_data\//, ""));
    const filePath = path.join(dataDir, "ingest_data", relPath);
    if (!isSafePath(path.join(dataDir, "ingest_data"), filePath)) {
      sendError(res, 403, "Access denied.");
      return;
    }
    try {
      const data = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const contentType = ext === ".png" ? "image/png" : (ext === ".html" ? "text/html; charset=utf-8" : "application/octet-stream");
      res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "public, max-age=3600" });
      res.end(data);
      return;
    } catch {
      sendError(res, 404, "File not found.");
      return;
    }
  }

  // 4-1. 생성된 PPTX 다운로드
  if (url.pathname.startsWith("/storage/deliverables/")) {
    const relPath = decodeURIComponent(url.pathname.replace(/^\/storage\/deliverables\//, ""));
    const deliverablesDir = path.join(dataDir, "deliverables");
    const filePath = path.join(deliverablesDir, relPath);
    if (path.basename(relPath) !== relPath || !isSafePath(deliverablesDir, filePath) || path.extname(filePath).toLowerCase() !== ".pptx") {
      sendError(res, 403, "Access denied.");
      return;
    }
    try {
      const data = await fs.readFile(filePath);
      res.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(filePath))}`,
        "Content-Length": data.length,
        "Cache-Control": "no-store",
      });
      res.end(data);
      return;
    } catch {
      sendError(res, 404, "PPTX file not found.");
      return;
    }
  }

  // 5. 헬스체크
  if (url.pathname === "/health") {
    sendJson(res, 200, {
      status: "ok",
      app: "proposal-workbench-bridge",
      name: "HitL Bridge Server",
      port: PORT,
      version: "2.1.0"
    });
    return;
  }

  // 6. HitL HTML 및 정적 CSS 제공
  let staticFile = url.pathname;
  if (staticFile === "/" || staticFile === "") staticFile = "index.html";
  else if (staticFile === "/search") staticFile = "picker.html";
  else if (staticFile === "/planning") staticFile = "planner.html";
  else if (staticFile === "/ingest") staticFile = "ingest.html";
  else staticFile = staticFile.replace(/^\//, "");

  const filePath = path.join(publicDir, staticFile);
  if (!isSafePath(publicDir, filePath)) {
    sendError(res, 403, "Access denied.");
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".svg": "image/svg+xml",
    };
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "text/plain; charset=utf-8" });
    res.end(content);
    return;
  } catch {}

  sendError(res, 404, "Not found.");
});

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  server.listen(PORT, HOST, () => {
    console.log(`[HitL Bridge Server] Running securely at http://${HOST}:${PORT}`);
  });
}
