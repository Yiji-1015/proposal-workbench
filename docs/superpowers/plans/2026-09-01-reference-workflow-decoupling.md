# Reference Workflow Decoupling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate PPT ingest and reference search from proposal planning while preserving optional explicit references, orientation approval, and the built-in blue palette.

**Architecture:** Keep all existing storage, search, picker, and rendering code unchanged. Change only skill routing contracts, UI prompt metadata, README workflow text, and contract tests so planning never invokes ingest/search implicitly and attached images affect structure/layout only.

**Tech Stack:** Markdown Agent Skills, YAML skill metadata, Node.js built-in test runner, Codex plugin CLI.

**Spec:** `docs/superpowers/specs/2026-09-01-reference-workflow-decoupling-design.md`

## Global Constraints

- Ask for `portrait` or `landscape` on every proposal run.
- Use `#1769E0`, `#123B78`, `#4A8CF0`, and `#EEF5FF` unless the user explicitly provides another palette or template.
- Treat user images as structure/layout references only; ignore their colors, typography, wording, and business content.
- Do not change ingest manifests, SQLite schemas, reference sessions, picker APIs, or editable PPTX export.
- Do not add dependencies or new runtime abstractions.

---

### Task 1: Add workflow contract coverage

**Files:**
- Modify: `tools/slide-renderer/tests/proposal-ppt-maker-skill.test.mjs`

**Interfaces:**
- Consumes: skill Markdown and README text.
- Produces: one Node test that fails when ingest/search/planner are recoupled or image/palette boundaries disappear.

- [ ] **Step 1: Extend the existing skill contract test**

Read `proposal-ppt-ingest/SKILL.md`, `proposal-reference-search/SKILL.md`, `proposal-slide-planner/SKILL.md`, and `README.md` alongside the existing maker files. Add assertions equivalent to:

```js
assert.match(ingest, /독립.*인제스트/);
assert.match(ingest, /검색이나 장표 기획을 호출하지 않는다/);
assert.match(search, /선택 결과를 보고하고 종료/);
assert.match(search, /proposal-slide-planner.*호출하지 않는다/);
assert.match(planner, /레퍼런스 없이/);
assert.match(planner, /첨부 이미지/);
assert.match(planner, /구조와 배치/);
assert.match(planner, /색상.*타이포그래피.*문구.*무시/);
assert.match(planner, /검색이나 인제스트를 호출하지 않는다/);
assert.match(maker, /방향을 승인받는다/);
assert.match(maker, /색상을 묻지 않는다/);
assert.match(readme, /인제스트와 검색은 각각 독립 실행/);
```

Update the existing maker gate assertion from `방향과 색상을 승인받는다` to `방향을 승인받는다`.

- [ ] **Step 2: Run the focused test and confirm the new assertions fail**

Run:

```powershell
node --test tools/slide-renderer/tests/proposal-ppt-maker-skill.test.mjs
```

Expected: at least one new workflow assertion fails because the current skills still couple search to planning and still ask for color approval.

---

### Task 2: Decouple the four skill contracts

**Files:**
- Modify: `skills/proposal-ppt-ingest/SKILL.md`
- Modify: `skills/proposal-reference-search/SKILL.md`
- Modify: `skills/proposal-slide-planner/SKILL.md`
- Modify: `skills/proposal-ppt-maker/SKILL.md`
- Modify: `skills/proposal-ppt-maker/agents/openai.yaml`
- Modify: `README.md`

**Interfaces:**
- Consumes: unchanged RFP analysis, optional user image, or explicitly supplied completed reference session.
- Produces: an approved slide blueprint using the chosen orientation and fixed theme without automatic ingest/search.

- [ ] **Step 1: Make ingest standalone**

Add an `독립 실행 경계` section stating that ingest reports its manifest/index/render status and stops. It must not start search or planning.

- [ ] **Step 2: Make search standalone**

Replace the current planner handoff rule with: report candidates, picker URL, and selected IDs; then stop. State that a later planner may use a completed session only when the user explicitly supplies it. Keep picker download and session contracts unchanged.

- [ ] **Step 3: Make planner accept optional structure references**

Update the description and workflow to support no reference, an attached image, or an explicitly supplied completed search session. Ask for orientation before building the blueprint. Use the fixed blue theme unless an explicit palette/template is provided. State that attached images contribute hierarchy, flow, grouping, emphasis, and density only; ignore their colors, typography, wording, and business content. Never invoke ingest or search implicitly.

- [ ] **Step 4: Update maker orientation, palette, and image rules**

Keep orientation approval. Replace color approval with the built-in blue theme and no color question unless an explicit override exists. Add a non-negotiable rule that user images are structure/layout references only and do not trigger ingest/search or insertion into the final deck.

- [ ] **Step 5: Align UI metadata and README**

Change the maker default prompt to ask for orientation and use the built-in palette unless overridden. Document ingest and search as independent optional operations and planning as RFP-first with optional attached-image or explicit-selection references.

- [ ] **Step 6: Run the focused test and confirm it passes**

Run:

```powershell
node --test tools/slide-renderer/tests/proposal-ppt-maker-skill.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 7: Commit the contract change**

```powershell
git add docs/superpowers/plans/2026-09-01-reference-workflow-decoupling.md README.md skills/proposal-ppt-ingest/SKILL.md skills/proposal-reference-search/SKILL.md skills/proposal-slide-planner/SKILL.md skills/proposal-ppt-maker/SKILL.md skills/proposal-ppt-maker/agents/openai.yaml tools/slide-renderer/tests/proposal-ppt-maker-skill.test.mjs
git commit -m "feat: decouple proposal reference workflow"
```

---

### Task 3: Validate, refresh the plugin, and publish

**Files:**
- Modify: `.codex-plugin/plugin.json`

**Interfaces:**
- Consumes: the updated local plugin source.
- Produces: a new Codex cachebuster, installed cache, and matching `origin/master` commit.

- [ ] **Step 1: Run all repository checks**

Run:

```powershell
node --test
python tools/ppt-ingest/test_caption_and_index.py
python tools/ppt-ingest/test_export_selected_slides.py
node tools/verify-workbench.mjs
```

Expected: Node tests have zero failures, both Python scripts exit successfully, and Doctor reports `HEALTHY` with `18/18` checks.

- [ ] **Step 2: Validate each changed skill and the plugin**

Run the installed `skill-creator/scripts/quick_validate.py` against each changed skill folder, then run `plugin-creator/scripts/validate_plugin.py` against the repository root. Expected: every validator exits successfully.

- [ ] **Step 3: Refresh the cachebuster through the plugin helper**

Run `plugin-creator/scripts/update_plugin_cachebuster.py` against the repository root. Confirm only `.codex-plugin/plugin.json` changes and the base version remains `2.1.0`.

- [ ] **Step 4: Commit the cachebuster**

```powershell
git add .codex-plugin/plugin.json
git commit -m "chore: refresh plugin cachebuster"
```

- [ ] **Step 5: Reinstall and verify the local plugin**

Remove only `proposal-workbench@proposal-workbench-local`, add it again, and confirm `codex plugin list` reports the new manifest version. Compare the installed skill files with source hashes.

- [ ] **Step 6: Push and verify origin**

```powershell
git push origin master
```

Confirm local `HEAD`, `origin/master`, and the GitHub branch SHA are identical and the source worktree is clean.
