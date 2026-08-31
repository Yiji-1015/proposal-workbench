import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import path from "node:path";

import { getSelectedSlides, isSafePath, isValidIdentifier } from "./bridge_server.mjs";

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
  assert.match(picker, /id="btnExportPptx"/);
  assert.match(picker, /\/export-pptx/);

  const exportHandler = picker.slice(
    picker.indexOf("document.getElementById('btnExportPptx').onclick"),
    picker.indexOf("loadSession();"),
  );
  assert.doesNotMatch(exportHandler, /await saveSelection\(\)/);
  assert.match(exportHandler, /selected_slide_ids/);
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
