#!/usr/bin/env node
/**
 * bridge_server.mjs
 * Human-in-the-loop (HitL) ?? ??? ?? ?? ? ? ?? ?????.
 * - ?? ??: 5174
 * - ???: 127.0.0.1 (?? ??? ??)
 * - Zero-dependency & Offline 100%: ?? CDN ?? ?? ?? ??
 * - ??: ?? ??(Path Traversal) ??, XSS ??, ??? JSON ??
 */

import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workbenchRoot = path.resolve(__dirname, "..", "..");
const publicDir = path.join(__dirname, "public");
const PORT = Number(process.env.BRIDGE_PORT || 5174);
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

function isValidIdentifier(id) {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

function isSafePath(baseDir, targetPath) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget.startsWith(resolvedBase);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1:5174"}`);
  const dataDir = getDataDir();

  // 1. ?? ??: GET /api/sessions/:id
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

  // 1-1. Ingest Manifest ??: GET /api/ingest/:stem
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

  // 2. Reference Picker ?? ??: POST /api/sessions/:id/select
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

  // 3. Blueprint Review ??/?? ??: POST /api/sessions/:id/approve
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

  // 4. ???? ??? ? HTML ?? (/storage/ingest_data/...)
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

  // 5. ????
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

  // 6. HitL HTML ?? ? ?? CSS ??
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
