---
deck_id: hr_solution_visual_deck
kind: deck
category: scenario
summary: Proposal visual modules for staffing and service-operation recommendations
keywords: [proposal, visual-modules, process, comparison, metrics]
primary_color: "#1769E0"
canvas_format: ppt169
canvas_width: 1280
canvas_height: 720
canvas_viewbox: "0 0 1280 720"
source_canvas_width: 2560
source_canvas_height: 1440
source_viewbox: "0 0 2560 1440"
replication_mode: fidelity
native_structure_mode: structured
page_count: 7
placeholders:
  01_content_comparison: ["{{PAGE_TITLE}}"]
  02_content_decision_cards: ["{{PAGE_TITLE}}"]
  03_content_process_grid: ["{{PAGE_TITLE}}"]
  04_content_metric_table: ["{{PAGE_TITLE}}"]
  05_content_responsibility_matrix: ["{{PAGE_TITLE}}"]
  06_content_case_cards: ["{{PAGE_TITLE}}"]
  07_content_faq_rows: ["{{PAGE_TITLE}}"]
---

# HR Solution Visual Deck - Design Specification

## I. Template Overview

A reusable proposal deck for staffing and service-operation recommendations. It supports presentation, close reading, and handoff. The main goal is to reuse visual structures while replacing the words and numbers.

## II. Color Scheme

| Role | Color | Use |
|---|---|---|
| Navy | #0B1F4D | title, high-level hierarchy |
| Primary | #1769E0 | emphasis, flow, key result |
| Primary dark | #123B78 | section headers and strong bands |
| Secondary | #5BA7E8 | comparison axis and secondary flow |
| Secondary dark | #2F82C4 | secondary emphasis, connector, selected state |
| Surface | #F3F6FA | neutral cards and tables |
| Surface blue | #EEF5FF | selected cards and callouts |
| Text | #12213A | titles and key copy |
| Muted | #5B6B82 | supporting copy |
| Semantic accents | blue-gray only | success / warning / danger only when unavoidable |

The canonical token file is `proposal_design_tokens.json`. Blue is the default
visual language. Green, orange, and red should normally be absent; use blue,
navy, pale blue, and gray for almost all hierarchy. Non-blue status colors are
allowed only when the requirement explicitly demands a conventional status cue.

## II-A. Density Rules

- Default to high-density proposal composition: 2–5 visual columns or 4–6 repeated steps when the content supports it.
- Keep outer margins around 48 px and use compact repeated cards, tables, flows, and callouts rather than large empty hero areas.
- Body copy should normally be 13–15 px on the 1040×720 working canvas; titles 28–32 px.
- A card should carry a short heading plus up to five compact lines; long source text must be summarized before placement.
- Use semantic color sparingly. Structure, spacing, and line weight should carry most of the hierarchy.

## III. Typography

Arial, Malgun Gothic, sans-serif. Large single-message titles and short one-to-two-line descriptions are preferred.

## IV. Signature Design Elements

A left blue rule, rounded section pill, pale-blue cards, blue/cyan comparison, rounded rows, central nodes, and directional arrows.

## V. Page Roster

| File | Visual module | Reusable structure |
|---|---|---|
| `01_content_comparison.svg` | two_column_comparison | two comparison panels, central dual nodes, repeated rows |
| `02_content_decision_cards.svg` | three_column_decision_cards | three decision cards, downward arrows, result cards |
| `03_content_process_grid.svg` | six_step_process_grid | 2x3 process cards and row arrows |
| `04_content_metric_table.svg` | before_after_metric_table | metric rows, before/after values, improvement column |
| `05_content_responsibility_matrix.svg` | two_party_responsibility_matrix | two-party role mapping and stage pills |
| `06_content_case_cards.svg` | three_case_image_cards | three image cards and copy panels |
| `07_content_faq_rows.svg` | faq_qa_rows | question-answer rows and left illustration |

## VI. Assets

Optional source-derived bitmap references are retained under the sibling `images/` directory for future image-bearing variants.

## VII. Placeholder Overrides

Each prototype uses title and body slots. Repeated rows and cards have independent carriers so the visual structure can be reused with new content.
