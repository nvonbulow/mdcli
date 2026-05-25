---
name: vault-ingest
description: Run an interactive vault triage workflow for dump notes, pasted text, local files, reminders, and resource imports without losing tasks, context, or source material.
---

# Vault Ingest Skill

Use this skill when the user asks to ingest, process, triage, import, clear, archive, or organize captured vault material.

Load [vault-workflow-reference](../vault-workflow-reference/SKILL.md) for shared `kb` CLI defaults, vault editing rules, task metadata conventions, daily-log conventions, resource-import conventions, and verification.

## Workflow goal

Turn arbitrary captured material into durable vault records without losing intent, source context, follow-up work, or the raw source when it still has value.

## Supported source types

Handle all of these through this one workflow:

- `vault/dump.md` or other active scratch/inbox text
- pasted notes, reminders, or brain dumps
- local files inside or outside the vault
- URLs, articles, and other reference imports
- mixed captures that contain tasks, notes, decisions, and background material together

## Phase 1: Source intake

1. Identify the source type before editing anything.
2. Read `vault/AGENTS.md` before editing vault content.
3. Read or fetch the source material.
   - For `vault/dump.md`, read the active dump at the vault root.
   - For pasted text, preserve the pasted source in working context until all meaningful content is placed.
   - For other local files, read the file but do not move or delete it unless the user explicitly asks.
   - For URLs/articles/resources, use the URL reader first and use the browser only if reader mode fails or the page requires JavaScript.
4. Detect empty or no-op sources early.
   - If the source is empty, already processed, or contains only headings with no meaningful content, say so and stop.
5. Preserve raw source text until all meaningful tasks, context, and resource material are moved or intentionally archived.

## Phase 2: Parse and classify

Classify each item before deciding where it goes.

- follow-up task
- completion evidence
- project context or project log material
- area note material
- resource/reference material
- daily-log observation, event, decision, or notable context
- waiting-for or dependency note
- raw archive material worth preserving verbatim

For article/resource imports, classify both the source itself and any extracted tasks or context. A saved full-copy note is required even when the import produces no tasks.

## Phase 3: Search existing vault context

Before creating or editing records:

1. Search likely project destinations in `vault/30-Projects/`.
2. Search likely areas in `vault/20-Areas/`.
3. Search existing resources in `vault/40-Resources/`.
4. Search relevant logs in `vault/60-Logs/`, including the dated daily log for the resolved local workflow date when daily context is involved.
5. Search similar open and completed tasks before adding a new one.
6. Reuse existing project, area, resource, and tag names when they already fit.

## Phase 4: Canonicalize proposed records

Normalize proposals before editing.

- Rewrite task names into concrete, action-oriented form.
- Preserve the user’s meaning; do not over-normalize proper nouns or domain-specific wording.
- Propose `[project:: [[...]]]`, `[area:: [[...]]]`, `[scheduled:: YYYY-MM-DD]`, `[due:: YYYY-MM-DD]`, `[priority:: high|medium|low]`, tags, and `[repeat:: ...]` only when the source or existing vault patterns justify them.
- Confirm work/personal separation when it affects which project, area, or review surface should own the item.
- Gather enough surrounding context to place notes in the right existing section instead of scattering fragments.

## Phase 5: Detect duplicates and related records

1. Check for exact duplicate tasks.
2. Check for likely duplicates or closely related open/completed tasks.
3. Prefer merge, update, or append decisions over creating sibling duplicates.
4. Link related project context to the existing file rather than creating parallel notes.

## Phase 6: Propose destinations and follow-ups

Before editing, build a compact proposal when confidence is not high, and always build one for medium/large dump ingests.

- Show the likely destination for each task or note.
- Suggest follow-up tasks as suggestions, never as facts.
- Suggest creating a new project only when several items point to a shared outcome, deadline, or multi-step lifecycle that does not fit existing project files.
- Do not create new Markdown index files silently. Search for existing dashboards, context sections, or index-like notes first. Propose a new index only when repeated ingestion shows real retrieval friction.
- Separate candidate extraction from state changes:
  - Create obvious new tasks directly when the source text names a clear action and destination.
  - Treat natural-language completion evidence as a candidate completion; ask before changing `- [ ]` to `- [x]` unless the user explicitly says the task is done.
  - For project-vs-area or other structural decisions, give a short recommendation with rationale and ask before creating or moving records.

## Phase 7: Ask focused questions only where needed

Use one `ask` call when possible.

Ask when:

- multiple projects or areas fit
- a new project or new resource topic folder may be warranted
- dates, recurrence, tags, priority, or work/personal classification are ambiguous
- a likely duplicate could be merged in more than one reasonable way
- article/resource destination is unclear
- natural-language evidence suggests an existing task was completed, but the source does not explicitly say to mark it complete
- a structural choice such as project vs area, project split/merge, or new resource topic needs judgment

Auto-apply only when source semantics and destination are obvious from the source text and existing vault context.

## Phase 8: Apply edits

Apply the confirmed triage decisions.

- Update project tasks and context in `vault/30-Projects/`.
- Update area notes in `vault/20-Areas/`.
- Update or create resource notes in `vault/40-Resources/`.
- Append meaningful observations, decisions, events, source summaries, and links to dump archives or ingestion artifacts to `vault/60-Logs/daily/YYYY-MM-DD.md` when the material belongs in the day’s narrative.
- Append checkoff records to `vault/60-Logs/Task Completion History.md` when confirmed completions are part of the ingestion.
- Archive raw material under `vault/90-Archive/` only when preserving the source verbatim is useful.

### Dump-specific cleanup

When the source is `vault/dump.md`:

1. Move all meaningful content first.
2. Archive the original dump under `vault/90-Archive/dumps/` using the existing timestamped filename convention.
   - Copy the dump content verbatim whenever possible; do not manually rewrite the body.
   - Ensure the archive has a unique top-level heading matching the archive filename, such as `# dump-YYYYMMDD-HHMMSS`, then keep the dump's own structure under lower-level headings.
3. Add or update the dated daily log with a link to the archive file and any other ingestion artifacts created from the dump.
4. Keep `vault/dump.md` at the vault root as the active inbox/scratch file.
5. Reset `vault/dump.md` from the fenced Markdown template in `vault/40-Resources/Vault/Dump Template.md`.
   - The reset content must have a unique top-level `#` heading matching `dump.md`, currently `# Dump`, with editable lower-level sections such as `## Personal` and `## Work`.
   - Update the template file when changing the desired active dump structure; do not hardcode the reset shape in the skill.

For pasted text, no source cleanup is needed.

For other local files, do not move or delete the source unless the user explicitly asks.

## Phase 9: Resource import handling

When the source is a URL, article, paper, or other reference material:

1. Read the source link with the URL reader first.
2. Create or update a concise resource summary note under the best-fitting `vault/40-Resources/<Topic>/` path when the destination is clear.
3. Save the full source copy or best available extract separately, defaulting to `vault/40-Resources/<Topic>/sources/<slug>-full.md`.
4. Search before creating a new resource summary or full-copy note to avoid duplicates.
5. Ask before creating a new topic folder when the destination is not obvious.
6. Include, at minimum, source URL, retrieved date, executive summary, key ideas, links to related projects or areas, and a link to the saved full-copy note in the summary note.
7. Preserve the full copy verbatim enough to be useful offline. If the extract is partial or blocked, say so and save the best available copy plus source metadata.
8. Add daily-log context only when the import materially matters to the day; do not duplicate the entire resource note in the daily log.

## Phase 10: Verify

After edits:

1. Run `kb --format json check` after any vault content change. Treat a nonzero exit with well-formed JSON findings as a completed check; inspect findings and fix any errors or newly introduced warnings before yielding. If only pre-existing findings remain, report them separately and offer to clean them up interactively.
2. Run targeted `kb --format json task today`, `task due`, `task week`, or `task open` queries when scheduled or due dates changed.
3. Use targeted `search` to confirm edited task metadata, resource links, or daily-log entries when needed.
4. Run `jj status` in `vault/` before yielding when vault content changed.

## Output

Report:

- source processed and source type
- items created or updated and their destinations
- duplicate/merge decisions
- questions asked and the answers applied
- tasks added, completed, rescheduled, or left unchanged
- daily-log, resource, archive, and source-cleanup actions
- verification command results
