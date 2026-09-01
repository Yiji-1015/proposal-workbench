# Responsive Asset Curator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one reusable asset-curation module that discovers block-level native PowerPoint candidates from PPTX/POTX, keeps source material local, promotes only explicitly approved sanitized assets, and reflows approved assets inside variable-size slide blocks.

**Architecture:** Put all OOXML discovery, qualitative curation, sanitization, and promotion logic in one Python CLI at `tools/asset-curator/asset_curator.py`. PPT ingest, the HitL bridge, and the new Agent Skill call that CLI instead of implementing parallel extractors. Keep the existing JSON catalog and renderer pipeline; add one `responsive_native_template` renderer that reads approved JSON recipes and uses artifact-tool native shapes, connectors, custom paths, text, and explicitly selected photos.

**Tech Stack:** Python 3 standard library (`zipfile`, `xml.etree.ElementTree`, `hashlib`, `json`, `pathlib`) plus existing `python-pptx`; Node.js standard library and built-in test runner; existing `@oai/artifact-tool`; plain HTML/CSS/JavaScript.

**Spec:** `docs/superpowers/specs/2026-09-01-responsive-asset-curator-design.md`

## Global Constraints

- Keep `tools/pattern-library/unified-visual-module-catalog.json` empty during implementation and automated tests. Promote synthetic fixtures only into temporary pattern roots.
- Never copy a source `.pptx` or `.potx` into the repository, candidate output, approved asset folders, or plugin bundle.
- Discovery may write only under `storage/asset_candidates/`; selection-only runs must not change `tools/pattern-library/`.
- Promotion requires explicit approval, a sanitized candidate, metadata validation, native-editability validation, and atomic catalog/template replacement.
- Use direct OOXML element tags to distinguish `p:grpSp`, `p:cxnSp`, `p:pic`, `p:sp`, and `p:graphicFrame`. Never classify by descendant XML text.
- Keep qualitative verdicts (`selected`, `deferred`, `rejected`) and short reasons. Do not add scores, weights, a database, a service, or a generalized constraint solver.
- Flatten source group hierarchy to native child primitives when rendering if the runtime has no grouping API; preserve group paths in names and never rasterize the group.
- Permit `p:pic` only for an explicitly selected `photo_asset`. Block, diagram, and icon assets remain native shapes.
- Keep existing renderer keys and zero-asset fallback behavior working.
- Do not commit or push user assets automatically.

Resolve the repository Python once per PowerShell session:

```powershell
$assetPython = node --input-type=module -e "import { detectPythonCommand } from './tools/verify-workbench.mjs'; const found = detectPythonCommand(); if (!found) process.exit(1); process.stdout.write(found.cmd)"
```

## File Responsibility Map

| File | Responsibility |
|---|---|
| `tools/asset-curator/asset_curator.py` | Single shared OOXML reader, block candidate discovery, curation, sanitization, promotion, CLI, and native PPTX verifier |
| `tools/asset-curator/test_asset_curator.py` | Synthetic PPTX/POTX fixtures plus core and ingest regression checks |
| `tools/ppt-ingest/extract_slide_structure.py` | Existing PPTX text/HTML path plus POTX fallback using the curator reader |
| `tools/ppt-ingest/ingest_pipeline.py` | Source type and slide/layout/master identity in the ingest manifest |
| `tools/hitl-bridge/bridge_server.mjs` | Validated `discover` and `promote` HTTP adapters that invoke the Python CLI |
| `tools/hitl-bridge/public/ingest.html` | Native candidate overlay, selection report, metadata editor, final approval |
| `tools/hitl-bridge/public/style.css` | Overlay, candidate list, and dialog styling |
| `tools/pattern-library/asset-manifest.schema.json` | Permanent metadata and per-kind contract; local source provenance stays out |
| `tools/pattern-library/README.md` | Approved storage layout and source-deck exclusion policy |
| `tools/slide-renderer/src/asset-recipes.mjs` | `responsive_native_template` interpreter and wide/compact/tall layout |
| `tools/slide-renderer/src/compile-render-model.mjs` | Optional `photo_id` mapping and fixed-node compatibility checks |
| `tools/slide-renderer/src/render-presentation.mjs` | Safe template/photo loading, native application, runtime fallback, picture count |
| `tools/slide-renderer/bin/build-proposal.mjs` | Honest asset, fallback, and picture-use verification report |
| `skills/proposal-asset-curator/SKILL.md` | Natural-language target resolution, selection-only behavior, approval gate |
| `skills/proposal-asset-curator/references/selection-playbook.md` | Practical block detection, triage, slotting, dedupe, and known failure cases |
| `skills/proposal-ppt-ingest/SKILL.md` | PPTX/POTX ingest and optional curator handoff |
| `skills/proposal-ppt-maker/SKILL.md` and references | Approved responsive asset and explicit photo-use contract |
| `tools/verify-workbench.mjs`, `.codex-plugin/plugin.json`, `README.md` | Eighth skill discovery, new catalog contract, documented workflow |

---

### Task 1: Build the direct OOXML package reader

**Files:**
- Create: `tools/asset-curator/asset_curator.py`
- Create: `tools/asset-curator/test_asset_curator.py`

**Interfaces:**
- Consumes: `inspect_package(source_path: Path) -> dict`
- Produces: `{source_type, slide_size, masters, layouts, slides, media}` with effective master → layout → slide shape paths, normalized bounds, direct element kinds, text, placeholder identity, connector endpoints, and media relationships.

- [ ] **Step 1: Add a synthetic package writer and failing package-reader tests**

Use `zipfile.ZipFile` in the test itself to create minimal PPTX and POTX packages under `tempfile.TemporaryDirectory()`. Cover:

```python
def test_reads_potx_master_layout_and_slide_inheritance(self):
    package = inspect_package(self.potx_path)
    effective = package["slides"][0]["effective_shapes"]
    self.assertEqual(package["source_type"], "potx")
    self.assertEqual([s["source_scope"] for s in effective], ["master", "layout", "slide"])

def test_direct_group_tag_wins_over_descendant_connector(self):
    package = inspect_package(self.pptx_path)
    group = next(s for s in package["slides"][0]["local_shapes"] if s["shape_id"] == "10")
    self.assertEqual(group["kind"], "group")
    self.assertEqual(group["children"][1]["kind"], "connector")
```

The fixture must also include one `p:ph` picture placeholder, one actual `p:pic`, one `p:graphicFrame`, one `a:custGeom`, and group transforms using `a:off`, `a:ext`, `a:chOff`, and `a:chExt`.

- [ ] **Step 2: Run the focused test and confirm the import fails**

```powershell
& $assetPython tools/asset-curator/test_asset_curator.py AssetCuratorPackageTests
```

Expected: failure because `asset_curator.py` does not exist.

- [ ] **Step 3: Implement the smallest package reader**

Keep dictionaries and pure functions; do not introduce model classes. The direct-tag rule must be explicit:

```python
NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}

def local_name(element: ET.Element) -> str:
    return element.tag.rsplit("}", 1)[-1]

def shape_kind(element: ET.Element) -> str:
    return {
        "grpSp": "group",
        "cxnSp": "connector",
        "pic": "picture",
        "graphicFrame": "unsupported_graphic",
        "sp": "shape",
    }.get(local_name(element), "unsupported")
```

Implement relationship resolution relative to each OOXML part, recursive group transforms, preset/custom geometry extraction, text runs, placeholder type/index, direct connector references, picture relationship targets, and later-scope placeholder replacement. Reject paths that escape the ZIP package namespace.

- [ ] **Step 4: Add and pass reader edge-case tests**

Assert that zero-size and off-canvas shapes are marked excluded, custom paths contain only `moveTo`, `lineTo`, and `close`, picture placeholders are not pictures, and unsupported graphics stay explicit.

```powershell
& $assetPython tools/asset-curator/test_asset_curator.py AssetCuratorPackageTests
```

Expected: all package-reader tests pass.

- [ ] **Step 5: Commit the package reader**

```powershell
git add tools/asset-curator/asset_curator.py tools/asset-curator/test_asset_curator.py
git commit -m "feat: read native PowerPoint asset structure"
```

---

### Task 2: Add block discovery, qualitative curation, sanitization, and promotion

**Files:**
- Modify: `tools/asset-curator/asset_curator.py`
- Modify: `tools/asset-curator/test_asset_curator.py`
- Modify: `.gitignore`
- Create: `storage/asset_candidates/.gitkeep`
- Create: `tools/pattern-library/templates/.gitkeep`
- Create: `tools/pattern-library/icons/.gitkeep`
- Create: `tools/pattern-library/media-frames/.gitkeep`
- Create: `tools/pattern-library/photos/.gitkeep`
- Modify: `tools/pattern-library/asset-manifest.schema.json`
- Modify: `tools/pattern-library/README.md`

**Interfaces:**
- Consumes: `discover_from_manifest(manifest_path: Path, data_dir: Path, slide_no: int | None = None) -> dict`
- Produces: a safe selection report plus `storage/asset_candidates/{candidate_id}/candidate.json`
- Consumes: `promote_asset(candidate_id: str, request: dict, data_dir: Path, pattern_root: Path) -> dict`
- Produces: exactly one approved asset file/catalog item and candidate lifecycle `promoted`, or no permanent changes on failure.

- [ ] **Step 1: Add failing block-level discovery tests**

Extend the synthetic slide to contain two independent blocks, title/footer/page decorations, a raster icon mixed into one native block, and a duplicate block on another slide. Assert:

```python
report = discover_from_manifest(manifest_path, data_dir, slide_no=None)
self.assertEqual(len([c for c in report["candidates"] if c["duplicate_of"] is None]), 2)
self.assertNotIn("SAMPLE", json.dumps(report, ensure_ascii=False))
self.assertIn("icon_slot", report["candidates"][0]["cleanup_actions"])
self.assertEqual(report["candidates"][1]["duplicate_of"], report["candidates"][0]["candidate_id"])
```

Also assert that one slide containing a process and a table yields separate candidates, no numeric score field exists, and catalog bytes/file listings are identical before and after selection-only discovery. Add evidence fixtures where a renderer exits nonzero after writing every expected file (`warning`) and where one expected file is missing (`partial`).

- [ ] **Step 2: Run the discovery tests and confirm they fail**

```powershell
& $assetPython tools/asset-curator/test_asset_curator.py AssetCuratorDiscoveryTests
```

- [ ] **Step 3: Implement deterministic block maps and qualitative verdicts**

Use this order only: explicit group → containing shell → connector component → spatial cluster. Merge exact shape-set duplicates and high-overlap candidates before curation. Keep threshold constants next to the functions, not in a config layer.

Implement these exact callable boundaries: `discover_candidates(package: dict, slide_no: int | None) -> list[dict]`, `build_block_candidates(scope: dict) -> list[dict]`, `infer_module_type(shapes: list[dict]) -> str`, `curate_candidate(candidate: dict) -> tuple[str, str, list[str]]`, and `candidate_signature(candidate: dict) -> str`.

The signature must hash rounded normalized bounds/aspect, shape-kind counts, connector degree sequence, inferred topology, and text-slot signature. `selection_reason` stays one or two sentences. Unsupported core media is `rejected`; useful fixed/complex structures are `deferred`; responsive native structures are `selected`.

Add `assess_selection_evidence(manifest: dict, package: dict, data_dir: Path) -> dict`. A renderer/inspector nonzero exit with every expected render/layout file, complete manifest counts, and complete direct OOXML extraction returns `warning`; missing evidence returns `partial`, never `complete`.

- [ ] **Step 4: Implement sanitization and deterministic metadata drafts**

Normalize all geometry to candidate-local `0..1` coordinates, replace source text with `title`, `steps[]`, `items[]`, `metrics[]`, or `conclusion`, map colors to theme roles, and turn removable images into `icon_slot`/`media_slot`. Store raw source data only in the local candidate.

```python
def sanitize_candidate(candidate: dict) -> dict:
    template = build_native_template(candidate)
    validate_native_template(template)
    return template

def draft_metadata(candidate: dict) -> dict:
    return {
        "display_name": DISPLAY_NAMES[candidate["module_type"]],
        "description": DESCRIPTIONS[candidate["module_type"]],
        "design_traits": infer_design_traits(candidate),
        "use_cases": USE_CASES[candidate["module_type"]],
        "search_tags": SEARCH_TAGS[candidate["module_type"]],
    }
```

Only `process_chain` may vary node count in the first version; fixed hub/mapping candidates retain their approved node count. Generate `wide`, `compact`, and `tall` rules only when the structure remains meaningful.

- [ ] **Step 5: Add failing promotion and privacy tests**

Cover all six kinds and storage paths. Include duplicate module IDs, missing metadata, unsupported topology, source filename/raw text/path leakage, user-confirmed photo license, photo content-hash dedupe, and a mocked second rename failure that leaves the catalog and target directory unchanged.

```python
with self.assertRaisesRegex(ValueError, "source text"):
    promote_asset(candidate_id, leaking_request, data_dir, pattern_root)
self.assertEqual(json.loads(catalog.read_text("utf-8")), [])
self.assertEqual(list((pattern_root / "templates").glob("*.json")), [])
```

- [ ] **Step 6: Implement validation and rollback-safe promotion**

Permanent common metadata is:

```json
{
  "module_id": "process_chain_001",
  "display_name": "단계형 프로세스 블록",
  "asset_kind": "composite_block",
  "module_type": "process_chain",
  "description": "업무 단계를 순차적으로 설명하는 반응형 블록 도식",
  "design_traits": ["라운드 카드", "헤더 분리"],
  "use_cases": ["업무 흐름", "추진 절차"],
  "search_tags": ["프로세스", "단계", "순차"],
  "renderer_key": "responsive_native_template",
  "template": "templates/process_chain_001.json",
  "usage_mode": "structural",
  "render_mode": "native_powerpoint_shapes",
  "provenance_ref": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  "license": "user-provided",
  "license_status": "user_confirmed",
  "approved_at": "2026-09-01T00:00:00Z"
}
```

Change the manifest to version 2 with these exact contract groups:

```json
{
  "version": 2,
  "asset_required_fields": [
    "module_id", "display_name", "asset_kind", "module_type", "description",
    "design_traits", "use_cases", "search_tags", "renderer_key", "template",
    "usage_mode", "render_mode", "provenance_ref", "license", "license_status", "approved_at"
  ],
  "asset_kind_values": [
    "block_shell", "diagram_recipe", "composite_block", "icon_asset", "media_frame", "photo_asset"
  ],
  "forbidden_permanent_fields": ["source_path", "original_file", "raw_text", "raw_texts"],
  "renderer_key_values": ["responsive_native_template", "photo_asset_reference"]
}
```

Keep per-kind required fields in `kind_required_fields`: shell/diagram/composite/icon/media assets require JSON-native structure fields; photos require `mime_type`, `width_px`, `height_px`, `aspect_ratio`, `transparent`, and `content_sha256`.

Use temporary sibling files plus `os.replace`; if catalog or candidate-status replacement fails after asset replacement, restore the old catalog and remove the new asset before re-raising. A `photo_asset` without `user_confirmed` or a more specific allowed license must fail. Hash-identical photos reuse the existing photo entry and bytes.

All catalog entries retain `template`. For `photo_asset`, it points to `photos/{content_sha256}.{ext}` and `renderer_key` is `photo_asset_reference`; direct block selection remains invalid. Other kinds use `responsive_native_template`. Read PNG/JPEG dimensions and PNG transparency with small standard-library header parsers.

- [ ] **Step 7: Add the CLI and pass all core tests**

Expose only:

```text
asset_curator.py discover --manifest MANIFEST [--slide-no N] [--data-dir DIR]
asset_curator.py promote --candidate-id ID --request-json FILE_OR_DASH [--data-dir DIR] [--pattern-root DIR]
asset_curator.py verify-pptx --pptx FILE [--allow-pictures N]
```

`--request-json -` reads one request object from stdin for the bridge. Print one JSON object to stdout and diagnostics to stderr. Use stable nonzero exits: `2` invalid request, `3` missing source/candidate, `4` duplicate/conflict, `5` internal failure.

```powershell
& $assetPython tools/asset-curator/test_asset_curator.py
```

- [ ] **Step 8: Commit the curation core and contract**

```powershell
git add .gitignore storage/asset_candidates/.gitkeep tools/asset-curator/asset_curator.py tools/asset-curator/test_asset_curator.py tools/pattern-library/asset-manifest.schema.json tools/pattern-library/README.md tools/pattern-library/templates/.gitkeep tools/pattern-library/icons/.gitkeep tools/pattern-library/media-frames/.gitkeep tools/pattern-library/photos/.gitkeep
git commit -m "feat: curate and promote responsive proposal assets"
```

---

### Task 3: Attach the curator to PPTX/POTX ingest

**Files:**
- Modify: `tools/ppt-ingest/extract_slide_structure.py`
- Modify: `tools/ppt-ingest/ingest_pipeline.py`
- Modify: `tools/asset-curator/test_asset_curator.py`

**Interfaces:**
- Consumes: `extract_index_slides(source_path: Path) -> list[dict]` from the curator for POTX fallback.
- Produces: existing ingest outputs plus `source_type`, and per-slide `layout_id`/`master_id`; existing `--pptx` calls remain valid.

- [ ] **Step 1: Add failing PPTX/POTX source-contract tests**

Reuse the fixture writer already in `test_asset_curator.py`; do not add another fixture helper or binary files. Load the ingest modules with `importlib.util.spec_from_file_location`. Test that `.pptx` and `.potx` are accepted, another suffix fails, and POTX extraction returns searchable slide text plus layout/master IDs.

```powershell
& $assetPython tools/asset-curator/test_asset_curator.py AssetCuratorIngestContractTests
```

- [ ] **Step 2: Add POTX fallback without rewriting the PPTX path**

Keep the existing `python-pptx` flow for PPTX. On the known POTX content-type error, call `extract_index_slides`; pass its text boxes through the existing `build_slide_html` function. Do not catch unrelated extraction errors.

Add `tools/asset-curator` to `sys.path` once from the resolved workbench root and import only `describe_source`/`extract_index_slides`; do not duplicate the OOXML reader in ingest.

- [ ] **Step 3: Enrich the manifest and preserve CLI compatibility**

Use one argparse destination for both spellings:

```python
parser.add_argument("--source", "--pptx", dest="source_path", required=True,
                    help="Path to a .pptx or .potx file")
```

Add `source_type`, `layout_id`, and `master_id`; keep `source_pptx`, `source_path`, `source_key`, image/HTML references, indexing, and COM partial-status behavior unchanged.

- [ ] **Step 4: Pass focused ingest tests**

```powershell
& $assetPython tools/asset-curator/test_asset_curator.py AssetCuratorIngestContractTests
& $assetPython tools/ppt-ingest/test_caption_and_index.py
& $assetPython tools/ppt-ingest/test_export_selected_slides.py
```

- [ ] **Step 5: Commit ingest integration**

```powershell
git add tools/ppt-ingest/extract_slide_structure.py tools/ppt-ingest/ingest_pipeline.py tools/asset-curator/test_asset_curator.py
git commit -m "feat: ingest PPTX and POTX asset sources"
```

---

### Task 4: Add discover/promote APIs and the ingest selection UI

**Files:**
- Modify: `tools/hitl-bridge/bridge_server.mjs`
- Modify: `tools/hitl-bridge/bridge_server.test.mjs`
- Modify: `tools/hitl-bridge/public/ingest.html`
- Modify: `tools/hitl-bridge/public/style.css`

**Interfaces:**
- Consumes: `POST /api/assets/discover` with `{source_key, slide_no?}`.
- Produces: safe candidate reports without `source_path`, raw text, or package member paths.
- Consumes: `POST /api/assets/promote` with `{candidate_id, approved: true, module_id, display_name, module_type, asset_kind, description, design_traits, use_cases, search_tags, usage_mode, license, license_status}`.
- Produces: `{success, candidate_id, module_id, status: "promoted", native_editability_verified: true}`.

- [ ] **Step 1: Add failing bridge and static-UI contract tests**

Export and test pure validators for asset requests. Add HTML assertions for whole-deck discovery, per-slide discovery, overlay labels, native `<dialog>`, metadata fields, and an explicit final-approval control.

```js
assert.deepEqual(validateDiscoverRequest({ source_key: "deck_123", slide_no: 7 }), {
  sourceKey: "deck_123", slideNo: 7,
});
assert.throws(() => validatePromoteRequest({ candidate_id: "ok", approved: false }), /approval/i);
assert.match(ingestHtml, /\/api\/assets\/discover/);
assert.match(ingestHtml, /\/api\/assets\/promote/);
```

```powershell
node --test tools/hitl-bridge/bridge_server.test.mjs
```

- [ ] **Step 2: Generalize the existing process runner only enough for JSON stdin**

Preserve current export behavior and timeout handling. Change `runProcess` to accept one optional options object with `input`, call `child.stdin.end(input)`, and attach `exitCode`, `stdout`, and `stderr` to nonzero-exit errors; do not add a process abstraction.

- [ ] **Step 3: Implement the two HTTP adapters**

Resolve source only from `storage/ingest_data/{source_key}/manifest.json`; never accept a client source path. Validate identifier, slide number, body sizes, array/string lengths, candidate/module IDs, compatible candidate/asset kinds, and safe paths before invoking Python. Discovery passes the manifest path; promotion passes the body through stdin with `--request-json -`. Parse exactly one JSON stdout object. Map curator exits 2/3/4 to HTTP 400/404/409 and all other failures to 500.

- [ ] **Step 4: Add the native overlay and approval dialog**

Use normalized candidate bounds as percentages over the existing preview; do not generate asset preview files. A slide button calls discovery for that slide; the top action omits `slide_no` for whole-deck block selection. Show verdict, reason, cleanup actions, duplicate representative, source scope, asset kind, and variants. Only selected/sanitized candidates expose the promotion form.

```js
overlay.style.cssText = `left:${c.bounds.x * 100}%;top:${c.bounds.y * 100}%;width:${c.bounds.w * 100}%;height:${c.bounds.h * 100}%`;
```

The dialog edits `display_name`, `module_type`, `asset_kind`, `description`, `design_traits`, `use_cases`, `search_tags`, and `usage_mode`, displays removed source text, and sends `approved: true` only from the final button.

- [ ] **Step 5: Pass bridge/UI tests**

```powershell
node --test tools/hitl-bridge/bridge_server.test.mjs
```

- [ ] **Step 6: Commit the HitL entry point**

```powershell
git add tools/hitl-bridge/bridge_server.mjs tools/hitl-bridge/bridge_server.test.mjs tools/hitl-bridge/public/ingest.html tools/hitl-bridge/public/style.css
git commit -m "feat: review and approve reusable PPT assets"
```

---

### Task 5: Create the single asset-curator Skill and align plugin contracts

**Files:**
- Create: `skills/proposal-asset-curator/SKILL.md`
- Create: `skills/proposal-asset-curator/references/selection-playbook.md`
- Modify: `skills/proposal-ppt-ingest/SKILL.md`
- Modify: `skills/proposal-ppt-maker/SKILL.md`
- Modify: `skills/proposal-ppt-maker/references/asset-selection.md`
- Modify: `skills/proposal-ppt-maker/references/io-contract.md`
- Create: `tools/slide-renderer/tests/proposal-asset-curator-skill.test.mjs`
- Modify: `tools/slide-renderer/tests/proposal-ppt-maker-skill.test.mjs`
- Modify: `tools/verify-workbench.mjs`
- Modify: `.codex-plugin/plugin.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: natural-language selection or save requests plus one resolvable ingest source/slide/session.
- Produces: selection-only report with no permanent writes, or an approval preview followed by explicit promotion through the same CLI.

- [ ] **Step 1: Use the skill-creator workflow and add failing contract tests**

Before creating the Skill, read and follow `skill-creator`. Test frontmatter, triggers, target-resolution order, selection-only rules, explicit approval, six asset kinds, permanent completion gates, and the linked playbook.

```js
assert.match(skill, /골라줘.*선별 전용/s);
assert.match(skill, /tools\/pattern-library.*변경하지 않는다/s);
assert.match(skill, /승인.*promote/s);
for (const verdict of ["selected", "deferred", "rejected"]) assert.ok(playbook.includes(`\`${verdict}\``));
for (const kind of ["block_shell", "diagram_recipe", "composite_block", "icon_asset", "media_frame", "photo_asset"]) assert.ok(skill.includes(`\`${kind}\``));
```

```powershell
node --test tools/slide-renderer/tests/proposal-asset-curator-skill.test.mjs
```

- [ ] **Step 2: Write the concise orchestration Skill**

`SKILL.md` contains only target resolution, CLI calls, selection-only routing, approval preview, and completion wording. It must not duplicate extraction heuristics. If target resolution is ambiguous, ask only whether to use the whole source, one slide, or one layout.

- [ ] **Step 3: Write the practical selection playbook**

Include direct-tag group detection, block-level splitting, title/footer/stamp exclusion, removable raster slotting, native-but-fixed deferral, duplicate representative choice, renderer-completeness warning rules, and the actual failure patterns observed during template review. Keep verdict reasons qualitative and short.

- [ ] **Step 4: Align ingest/maker documentation and contract checks**

Document PPTX/POTX ingest and optional curation. Replace the old provider/original-file permanent contract with sanitized provenance. Add `responsive_native_template`, six kinds, explicit `photo_id`, and `selected`/`loaded`/`applied`/`fidelity_passed` reporting. Require asset selection to search `display_name`, `description`, `design_traits`, `use_cases`, and `search_tags`, never filenames. Update both existing schema assertions and verifier required fields.

- [ ] **Step 5: Register the eighth skill**

Add `proposal-asset-curator` to `expectedSkills`, change plugin text from 7 to 8 skills, and add README flow/directory entries. Follow `plugin-creator` for manifest validation and one cachebuster update, but do not reinstall or push in this task.

- [ ] **Step 6: Pass skill and doctor contract tests**

```powershell
node --test tools/slide-renderer/tests/proposal-asset-curator-skill.test.mjs tools/slide-renderer/tests/proposal-ppt-maker-skill.test.mjs
node tools/verify-workbench.mjs
```

- [ ] **Step 7: Commit the Skill and contract changes**

```powershell
git add skills/proposal-asset-curator skills/proposal-ppt-ingest/SKILL.md skills/proposal-ppt-maker/SKILL.md skills/proposal-ppt-maker/references/asset-selection.md skills/proposal-ppt-maker/references/io-contract.md tools/slide-renderer/tests/proposal-asset-curator-skill.test.mjs tools/slide-renderer/tests/proposal-ppt-maker-skill.test.mjs tools/verify-workbench.mjs .codex-plugin/plugin.json README.md
git commit -m "feat: add proposal asset curator skill"
```

---

### Task 6: Render approved templates responsively and report photo use honestly

**Files:**
- Modify: `tools/slide-renderer/src/asset-recipes.mjs`
- Modify: `tools/slide-renderer/src/compile-render-model.mjs`
- Modify: `tools/slide-renderer/src/render-presentation.mjs`
- Modify: `tools/slide-renderer/bin/build-proposal.mjs`
- Modify: `tools/slide-renderer/tests/asset-rendering.test.mjs`
- Modify: `tools/slide-renderer/tests/compile-render-model.test.mjs`
- Modify: `tools/slide-renderer/tests/build-proposal-cli.test.mjs`

**Interfaces:**
- Consumes: `createAssetRecipe({ rendererKey, block, frame, theme, template })` where `template` is required only for `responsive_native_template`.
- Produces: native primitives, selected variant, structural fingerprint, motifs, and zero or more explicit image primitives.
- Consumes: optional mapping `photo_id` when the selected template has a media slot.
- Produces: accurate `picture_shape_count`, asset application result, and runtime fallback reason.

- [ ] **Step 1: Add failing variant and node-count tests**

Use an in-memory sanitized process template. For frames with aspect ratios `2.0`, `1.0`, and `0.6`, assert `wide`, `compact`, and `tall`. For 2–8 steps assert ordered connectors, bounds inside the frame, and every text primitive `fontSize >= 9`.

```js
const recipe = createAssetRecipe({
  rendererKey: "responsive_native_template", block, frame, theme, template,
});
assert.equal(recipe.variant, "wide");
assert.ok(recipe.primitives.every((p) => p.position.left >= frame.left));
```

```powershell
node --test tools/slide-renderer/tests/asset-rendering.test.mjs
```

- [ ] **Step 2: Add the minimal template interpreter**

Add the renderer key to the existing set. Select variant by template thresholds or defaults `wide >= 1.35`, `tall <= 0.80`, otherwise compact. Render shell/body zones, explicit normalized native primitives, process repeat nodes, connectors, custom paths, and icon geometry. Bind only current block content; never emit source text.

```js
function selectResponsiveVariant(frame, template) {
  const ratio = frame.width / frame.height;
  const wide = template.constraints?.wide_min_ratio ?? 1.35;
  const tall = template.constraints?.tall_max_ratio ?? 0.80;
  return ratio >= wide ? "wide" : ratio <= tall ? "tall" : "compact";
}
```

Try one alternate declared variant when minimum node size or font size fails. If all declared variants fail, throw a typed `AssetLayoutError`; do not clip text.

- [ ] **Step 3: Validate photo mappings and fixed node counts in the render model**

When a selected template requires media, require `photo_id`, resolve it from the same catalog, and require `asset_kind: photo_asset` plus approved license status. Reject a direct photo mapping. For fixed hub/mapping templates, reject content counts that differ from the approved node count.

- [ ] **Step 4: Load approved JSON and photos through safe paths**

Parse JSON only for `responsive_native_template`; keep existing template hashing behavior for old renderers. Resolve template/photo paths under `patternRoot` and reject traversal. Pass the template to `createAssetRecipe`. Apply image primitives with the documented artifact-tool API only when a selected photo exists:

```js
slide.images.add({
  path: asset.photoPath,
  contentType: asset.photoContentType,
  alt: item.alt,
  fit: item.cropMode === "contain" ? "contain" : "cover",
  geometry: item.geometry ?? "rect",
  position: item.position,
});
```

All other primitives use `slide.shapes.add`; include `customPaths` for custom geometry. Group metadata remains in deterministic shape names.

- [ ] **Step 5: Record runtime fallback and real picture counts**

Catch only `AssetLayoutError`, render the existing native generic fallback, mark the selected asset `applied: false`, and append its reason to `runtimeFallbacks`. Let malformed templates and missing files fail closed. Replace the hard-coded report picture count with the rendered count.

- [ ] **Step 6: Add a temporary pattern-root CLI integration test**

The test creates `$tempPatternRoot`, writes a temporary catalog/template there, rewrites a copied project mapping to select it, and invokes `build-proposal.mjs --pattern-library $tempPatternRoot`. Assert `selected`, `loaded`, `applied`, and `fidelity_passed` are true, `renderer_key` is `responsive_native_template`, picture count is zero, and the output is a ZIP PPTX. Add a second run with a tiny approved photo and assert picture count is exactly one.

```powershell
node --test tools/slide-renderer/tests/asset-rendering.test.mjs tools/slide-renderer/tests/compile-render-model.test.mjs tools/slide-renderer/tests/build-proposal-cli.test.mjs
```

- [ ] **Step 7: Commit responsive rendering**

```powershell
git add tools/slide-renderer/src/asset-recipes.mjs tools/slide-renderer/src/compile-render-model.mjs tools/slide-renderer/src/render-presentation.mjs tools/slide-renderer/bin/build-proposal.mjs tools/slide-renderer/tests/asset-rendering.test.mjs tools/slide-renderer/tests/compile-render-model.test.mjs tools/slide-renderer/tests/build-proposal-cli.test.mjs
git commit -m "feat: render responsive native asset templates"
```

---

### Task 7: Run end-to-end privacy, editability, and regression verification

**Files:**
- Modify if a defect is found: files already listed above
- Do not add: source PPTX/POTX, previews, extracted company text, or real promoted assets

**Interfaces:**
- Consumes: synthetic fixtures plus the user's already-local PPTX/POTX through selection-only discovery.
- Produces: passing automated checks and evidence that permanent repository content contains no source decks or leaked source identifiers.

- [ ] **Step 1: Run every automated test**

```powershell
& $assetPython tools/asset-curator/test_asset_curator.py
& $assetPython tools/ppt-ingest/test_caption_and_index.py
& $assetPython tools/ppt-ingest/test_export_selected_slides.py
node --test
node skills/proposal-ppt-maker/scripts/verify-skill.mjs
node tools/verify-workbench.mjs
```

Expected: zero test failures; doctor recognizes eight skills and the version-2 asset contract.

- [ ] **Step 2: Verify generated synthetic PPTX packages directly**

Run the curator `verify-pptx` command against portrait and landscape no-photo outputs and the one-photo output created by the integration test. Assert native shape/text counts are nonzero, picture counts are respectively zero, zero, and one, and no source text appears in `ppt/slides/*.xml`.

When desktop PowerPoint COM is available, render those PPTX files with `tools/ppt-ingest/render_slides_com.py` and confirm every expected slide PNG exists. A COM-unavailable environment is reported as an explicit manual verification remainder, not a passing PowerPoint check.

- [ ] **Step 3: Run selection-only discovery on one local PPTX and one local POTX**

Use existing local ingest manifests or ingest the local files with `--source`. Confirm block-level candidates, master/layout scope on POTX, short reasons, cleanup actions, duplicate representatives, and complete/warning evidence status. Do not call `promote` and do not copy either source into the repository.

- [ ] **Step 4: Confirm the repository remains sanitized**

```powershell
git ls-files "*.pptx" "*.potx"
git diff --check
git status --short
```

Expected: no tracked PPTX/POTX; only intended code/docs changes or previously known unrelated untracked paths. Confirm `tools/pattern-library/unified-visual-module-catalog.json` is still `[]`.

- [ ] **Step 5: Self-review the implementation against the spec**

Check every validation item in spec §12, then scan changed files for unfinished language and leaked identifiers:

```powershell
rg -n "TODO|FIXME|TBD|original_file|source_path" tools/asset-curator tools/pattern-library skills/proposal-asset-curator tools/slide-renderer tools/hitl-bridge
```

Allowed: `source_path` only in local candidate/ingest handling code and documentation. Forbidden: source path, original filename, company/person names, or raw source text in approved templates/catalog.

- [ ] **Step 6: Validate and refresh the local plugin**

Follow `plugin-creator` to validate the final manifest and reinstall only this local `proposal-workbench` plugin. Confirm the installed copy exposes all eight skills and matches source hashes. Do not push.

- [ ] **Step 7: Close verification without broad staging**

If verification finds a defect, return to the owning task, rerun its focused test, and use that task's explicit file list and commit step. If no defect is found, make no extra commit. Do not use broad `git add`, and do not push until the user asks.
