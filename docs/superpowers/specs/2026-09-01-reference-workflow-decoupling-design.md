# Proposal Reference Workflow Decoupling

## Goal

Make PPT ingest and reference search independent utilities. Proposal planning must work from the RFP alone and may optionally use a user-provided image or an explicitly supplied search selection as a structure/layout reference.

## Decisions

- Ask the user to choose `portrait` or `landscape` for each proposal run.
- Do not ask for colors when the user has not supplied a palette. Use the existing blue theme: `primary #1769E0`, `navy #123B78`, `accent #4A8CF0`, `pale #EEF5FF`.
- An explicit user palette or template may override the built-in theme.
- A user-provided image influences structure and placement only. Ignore its colors, typography, wording, and business content.
- RFP evidence remains the sole content authority.

## Boundaries

### PPT ingest

`proposal-ppt-ingest` only extracts, renders, describes, embeds when configured, and indexes a deck. It reports its artifacts and stops. It does not start search or proposal planning.

### Reference search

`proposal-reference-search` only searches the existing index and lets the user select slides. It reports the selected slide IDs and stops. It does not gate or invoke proposal planning.

### Slide planning

`proposal-slide-planner` starts from the RFP and supports three optional reference modes:

1. no reference;
2. a user-attached image;
3. explicitly supplied selected slide IDs or a completed reference session.

The planner never starts ingest or search implicitly. For an attached image, it derives only reusable layout observations such as hierarchy, flow direction, grouping, relative emphasis, and density. It does not ingest the image or add it to the search index.

### PPT creation

`proposal-ppt-maker` asks for orientation, uses the fixed theme unless explicitly overridden, and renders approved content with editable native PowerPoint shapes. A reference image is not inserted into the final deck unless the user separately requests image placement.

## Data flow

```text
PPTX -> ingest -> SQLite index
                    |
explicit search -> selection report

RFP + optional attached image or explicit selection
    -> slide planner -> blueprint approval -> PPT maker -> reviewer
```

There is no automatic edge from ingest to search, from search to planning, or from planning back to search.

## Compatibility

- Keep the current ingest manifest, SQLite schema, reference session format, picker UI, selected slide IDs, and editable PPTX export.
- Existing completed reference sessions remain usable when the user explicitly supplies the session ID to the planner.
- No FAISS, embedding, database, or bridge API changes are required.

## Failure behavior

- If an attached image cannot be read, ask the user to attach it again; do not fall back to automatic search.
- If an explicitly requested reference session is missing or incomplete, report that state and ask whether to continue without a reference.
- If no reference is supplied, continue with RFP-only planning without warning or fabricated asset reuse.

## Implementation surface

- Clarify standalone behavior in `proposal-ppt-ingest/SKILL.md`.
- Remove planner coupling from `proposal-reference-search/SKILL.md`.
- Add optional structure-reference rules to `proposal-slide-planner/SKILL.md`.
- Change orientation and palette guidance in `proposal-ppt-maker/SKILL.md` and its UI metadata.
- Update the README workflow so ingest, search, and planning are parallel user choices rather than a mandatory chain.
- Add the smallest contract tests that prove separation, orientation prompting, fixed-theme behavior, and structure-only image use.

## Acceptance criteria

- RFP-only planning does not invoke ingest or search.
- Ingest completes without starting search.
- Search completes after reporting selection and does not invoke the planner.
- The planner asks for orientation but not color when no explicit palette is supplied.
- A supplied image changes layout decisions only; the approved theme and RFP content remain unchanged.
- Existing explicit reference sessions still work.
- Plugin validation, Node tests, and Workbench Doctor pass.
