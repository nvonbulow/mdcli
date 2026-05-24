---
name: vault-workflow-reference
description: Shared reference for repository-local vault workflows: kb CLI defaults, vault editing rules, task metadata, daily-log conventions, resource-import conventions, and verification practices.
---

# Vault Workflow Reference

Use this as shared context for repo-local vault workflow skills. It is not the primary skill for a user request; load the start-of-day, end-of-day, or ingest skill first, then use this for common rules.

## Repository and CLI defaults

1. Run from the repository root (`~/Documents/braindump`) unless the user explicitly says otherwise.
2. Use the direct `kb` command, not `aube run kb`.
3. Use JSON output for tool consumption.
4. Do not pass `--vault` or `--source` for normal use; repo-root defaults are intended to work.

Common commands:

```bash
kb --format json check
kb --format json check --file PATH
kb --format json check --files 'GLOB'
kb --format json task today --date YYYY-MM-DD
kb --format json task due --date YYYY-MM-DD
kb --format json task week --start YYYY-MM-DD
kb --format json task open
```

Deferred future CLI workflow aids belong in `ROADMAP.md`, not in this skill.

## Vault source-of-truth rules

1. Read `vault/AGENTS.md` before editing vault content.
2. Treat `vault/30-Projects/` as the source of truth for tasks.
3. Treat dashboards as views and planning aids; keep Dataview fences intact.
4. Preserve Markdown structure, inline fields, task checkboxes, block IDs, existing wikilinks, and frontmatter.
5. Use `jj -R vault` or run Jujutsu commands with `cwd: vault` for vault version-control checks.
6. Never mark a task complete unless the user explicitly confirms it was done.
7. PARA here means Projects (`30-Projects/`), Areas (`20-Areas/`), Resources (`40-Resources/`), and Archive (`90-Archive/`), plus dashboards, logs, and the active dump.
8. Archive Markdown files need unique top-level `#` headings; archived dumps should use timestamped archive headings instead of generic `# Personal` or `# Work` headings.

## Task metadata conventions

Preserve existing metadata conventions when already in use:

- `[scheduled:: YYYY-MM-DD]`
- `[due:: YYYY-MM-DD]`
- `[area:: [[...]]]`
- `[project:: [[...]]]`
- `[completed:: YYYY-MM-DD]`
- `[repeat:: ...]`

Additional metadata is optional and should be added only when the source, existing local patterns, or the user confirms it:

- priority: `[priority:: high|medium|low]` or another user-confirmed scale
- tags such as `#task`, topic tags, work/personal tags, or retrieval tags only when they add search value
- recurrence via `[repeat:: ...]` only when explicit or confirmed

Behavior rules:

- Completion: change `- [ ]` to `- [x]` and add `[completed:: YYYY-MM-DD]`.
- Reschedule: update `[scheduled:: YYYY-MM-DD]` on the source task line.
- Due dates: do not change `[due:: YYYY-MM-DD]` unless the user asks or the due date itself is wrong.
- Carryover: if an item is overdue but intentionally left alone, do not silently move it.
- Follow-up: if a completed item creates a next action, add a concrete task in the appropriate project file.
- Dates: infer exact dates only when the source is unambiguous. Ask before guessing vague timing such as “soon”, “next week”, “after processing”, or “3-5 days”, unless the user clearly wants a conservative scheduled reminder.
- Work/personal separation: confirm it when it changes where the item should be reviewed or owned.

## Daily-log conventions

1. Use dated daily files under `vault/60-Logs/daily/YYYY-MM-DD.md`.
2. Create the dated file on demand during ingestion or end-of-day only when there is daily-log material worth saving.
3. Append bullets for observations, decisions, events, source summaries, and other non-task narrative context.
4. Link related projects or areas when the destination is clear.
5. Keep completed task history in `vault/60-Logs/Task Completion History.md`; do not duplicate checkoff records in the daily log unless narrative context adds value.
6. Weekly and monthly summaries may be generated later during maintenance from the daily files; do not maintain a separate append-only daily-log file.

## Resource import conventions

1. Store resource notes under `vault/40-Resources/<Topic>/`.
2. Search for an existing summary note and full-copy note before creating a new pair.
3. If a resource already exists, update it in place instead of creating a sibling duplicate.
4. Ask before creating a new topic folder when the destination is not obvious.
5. Read the source link first, then create or update:
   - a summary note with frontmatter such as:

```markdown
---
type: resource
topic: <Topic>
created: YYYY-MM-DD
source: <URL when applicable>
retrieved: YYYY-MM-DD
full_copy: [[sources/<slug>-full]]
---
```

   - and a separate full-copy note with frontmatter such as:

```markdown
---
type: source-copy
topic: <Topic>
source: <URL when applicable>
retrieved: YYYY-MM-DD
summary: [[<Summary Note>]]
---
```

6. Include an executive summary, key ideas, and links to related projects or areas in the summary note.
7. Save the full source copy or best available extract separately so the material remains useful offline.
8. If extraction is partial or blocked, say so explicitly in the saved note and preserve the best available copy plus source metadata.

## Index guidance

1. Before creating new index files, search existing dashboards, projects, areas, and resource notes.
2. Update existing index-like sections when they already exist.
3. Propose a new index only when repeated ingestion reveals real retrieval friction or a stable category that needs navigation support.
4. Do not create new index files silently.

## Verification

After material vault edits:

1. Run `kb --format json check` after any vault content change. Treat a nonzero exit with well-formed JSON findings as a completed check; inspect findings and fix any errors or newly introduced warnings before yielding.
2. Re-run the relevant `kb --format json ...` task query when tasks, dates, or task metadata changed.
3. Use `search` only for targeted confirmation that edited lines contain the expected metadata, daily-log entry, or resource link.
4. Run `jj status` in `vault/` before yielding when vault content changed.

## Reporting style

- Report tasks as `Project — Task`, with scheduled or due notes only when relevant.
- Distinguish `overdue`, `today`, `tomorrow`, and `later this week`.
- Be explicit when an exact-date CLI query excludes something because of its date.
- For ingestion, report source type, destination, duplicate handling, follow-up suggestions, and any archive or source-copy actions.
