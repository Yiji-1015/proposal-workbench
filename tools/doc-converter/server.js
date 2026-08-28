import express from "express";
import multer from "multer";
import { parse } from "kordoc";
import path from "path";

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
});

app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>?? ? Markdown ???</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 520px; margin: 80px auto; line-height: 1.5; }
    h2 { margin-bottom: 8px; }
    input, button { margin-top: 16px; }
    button { padding: 8px 18px; cursor: pointer; background: #1d4ed8; color: #fff; border: 0; border-radius: 6px; }
    #status { margin-top: 16px; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <h2>?? ? Markdown ??</h2>
  <p>HWP, HWPX, PDF, DOCX ??? ????? .md ??? ???????.</p>
  <input type="file" id="file" accept=".hwp,.hwpx,.pdf,.docx,.pptx" />
  <br />
  <button onclick="uploadFile()">?? ? ????</button>
  <div id="status"></div>
  <script>
    async function uploadFile() {
      const file = document.getElementById("file").files[0];
      const status = document.getElementById("status");
      if (!file) { alert("??? ?????."); return; }
      status.textContent = "?? ?...";
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch("/parse", { method: "POST", body: form });
      if (!resp.ok) {
        status.textContent = "?? ??: " + (await resp.text());
        return;
      }
      const blob = await resp.blob();
      const downloadName = file.name.replace(/\.[^.]+$/, ".md");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = downloadName;
      a.click();
      URL.revokeObjectURL(a.href);
      status.textContent = "??!";
    }
  </script>
</body>
</html>`);
});

app.post("/parse", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("file ??? ?????.");
    }
    const result = await parse(req.file.buffer);
    if (!result.success) {
      return res.status(500).send(String(result.error ?? "?? ?? ??"));
    }
    const originalName = Buffer.from(req.file.originalname, "latin1").toString("utf8");
    const stem = path.basename(originalName, path.extname(originalName));
    const outputName = encodeURIComponent(stem + ".md");

    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${outputName}`);
    res.send(result.markdown);
  } catch (err) {
    res.status(500).send("?? ??: " + err.message);
  }
});

const PORT = 8888;
const HOST = "127.0.0.1";
app.listen(PORT, HOST, () => {
  console.log(`?? ?? ?? ?? ?: http://${HOST}:${PORT}`);
});
