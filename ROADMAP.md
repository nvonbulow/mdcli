# ROADMAP

## Deferred vault CLI workflow aids

These are intentionally deferred. Do not implement them as part of the current vault-skill/documentation change.

## Prioritized implementation plan

- [x] P0: Finish vault catalog/search foundation in `packages/vault`
  - Expose catalog and Markdown parser/model APIs through package services, including the catalog service and remark-backed Markdown plugin milestone.
  - Extract notes, top-level headings, frontmatter, wikilinks, tags, tasks, inline fields, folders, source paths, and fenced blocks.
  - Keep this in package services so CLI commands stay thin.
- [x] P0: Add baseline read-only `kb check`
  - Start with broken wikilinks, ambiguous wikilinks from top-level headings, duplicate top-level headings, title/path/frontmatter drift, archive heading uniqueness, and stranded `vault/dump.md` content.
- [x] P0: Fix `kb check` parser/analyzer false positives
  - Treat wikilinks such as `[[sources/resource-name]]` as valid relative links when they resolve from the linking note's directory.
  - Restrict title-drift frontmatter matching to canonical title fields such as `title`; do not require `topic` to match the note basename.
  - Replace the current `topic` title-drift behavior with a resource-location sanity check: `topic` should agree with the resource folder/category convention, not the file title.
  - Add a vault check ignore file, similar to `.gitignore`, for intentional non-note files and specific findings; use it to exclude files such as `AGENTS.md` from note title-drift checks without weakening checks globally.
  - Add regression tests for relative source-copy links, resource `topic` metadata, and ignore-file behavior.
- [x] P0: set up config file/environment variables (using effect's config system) to set a default vault path instead of assuming `./vault`
- [ ] P0: Allow wikilinks to references headings within the linked file
  - For example `[[#heading]]` links to a heading within the same file. `[[#heading#subheading]]` references a subheading, and `[[Note#heading]]` references a heading in a different file. Checks will need to be updated to follow heading references.
  - Remark plugin should also be updated to parse new formats accordingly
- [ ] P0: Add safe `kb note rename <path-or-title> <new-title>`
  - Resolve source notes uniquely, update path/title/references, preserve aliases where possible, and support dry-run or preview before applying.
- [ ] P1: Add AI weekly/monthly summaries
  - Generate review drafts from daily logs, task history, and project context; keep this separate from deterministic checks.
- [ ] P1: Add AI missing-follow-up/theme detection
  - Produce suggestions only, not direct edits.
- [ ] P1: Add logging throughout the codebase (with different levels of course)
- [ ] P1: Add `kb task similar <text>`
  - Use deterministic token overlap to prevent duplicate tasks during ingestion.
- [ ] P1: Add richer fearless metadata edits through the remark plugin
  - Use Markdown AST-aware rewrites for frontmatter, headings, wikilinks, inline fields, and task metadata when deterministic mutations become safe.
- [ ] P1: Add project and area discovery commands
  - Implement `kb project list`, `kb project search <query>`, and `kb area list`.
- [ ] P1: Add `kb tag list`
  - List observed tags and counts so ingestion can reuse existing tags instead of inventing near-duplicates.
- [ ] P2: Add resource discovery commands
  - Implement `kb resource list` and `kb resource search <query>` across summaries and saved source copies.
- [ ] P2: Add resource integrity checks
  - Check orphaned source copies, missing `full_copy` links, missing core import metadata, and duplicate resource summaries.
- [ ] P2: Add safe `kb resource relink`
  - Reconnect summary notes and source-copy notes only when both sides are known deterministically.
- [ ] P3: Add `kb project archive`
  - Move clearly completed projects into archive locations while updating references.
- [ ] P3: Add guarded `kb task dedupe`
  - Keep preview/manual confirmation until duplicate resolution is deterministic enough to apply safely.
- [ ] P4: Add item-level event record parsing
  - Support list-item events with `[type:: event]`, typed date/start/end fields, and page-level inheritance.
- [ ] P4: Add `kb event today/week/open`
  - Render agenda/calendar-style views while keeping events out of task overdue, completion, and carryover semantics.

Suggested implementation sequence:

1. `packages/vault` catalog primitives
2. `kb check links`
3. `kb check headings`
4. `kb note rename --dry-run`, then apply mode
5. `kb task similar`
6. project/area/resource list and search commands
7. resource integrity checks
8. event model and query support

### Command wishlist

- `kb check`
  - run a bundled set of deterministic vault integrity and maintenance checks
  - support focused scopes such as links, tasks, resources, dashboards, logs, or all
  - report findings without mutating files by default
  - include checks for ambiguous links, broken links, metadata drift, duplicate tasks, overdue-task audit candidates, orphaned resource copies, stranded dump content, and stale dashboard/manual index content
- `kb note rename <path-or-title> <new-title>`
  - rename a note safely and update references to it across the vault
  - update the file path, top-level `# Heading`, and any metadata fields that should track the canonical title
  - rewrite wikilinks deterministically so aliases are preserved where possible and ambiguous matches are surfaced instead of guessed
  - refuse to proceed automatically when the source note cannot be resolved uniquely
- `kb project list`
  - list project notes from `vault/30-Projects/`
  - include path, title, area, status, and open task count when available
  - support filters such as `--area`, `--status`, and text query
- `kb project search <query>`
  - search project titles, paths, frontmatter, outcome/context/log text, and task text
- `kb area list`
  - list area notes from `vault/20-Areas/` with path and title
- `kb resource list`
  - list resource notes from `vault/40-Resources/` with topic, path, title, and source when available
- `kb resource search <query>`
  - search resource summaries and saved full-copy extracts
- `kb task search <query>`
  - search open and completed tasks by text, tags, project, area, path, and inline fields
- `kb task similar <text>`
  - return likely duplicate or related tasks using simple deterministic token-overlap scoring
- `kb tag list`
  - list observed tags and counts across tasks and Markdown files
- `kb event today/week/open`
  - future explicit event views once events are modeled separately from tasks
  - render agenda-style and calendar-style output from typed event date/time fields
  - keep events out of task completion, overdue, and carryover semantics

### Safe deterministic operation ideas

These should stay explicit operation commands rather than being folded into `check`.

- `kb note rename ...` for canonical note renames plus reference updates
- `kb task dedupe ...` to merge or rewrite clearly duplicate tasks only when the resolution is deterministic
- `kb resource relink ...` to reconnect summary notes and source-copy notes when both sides are known
- `kb project archive ...` to move clearly completed projects into archive locations while updating references

### AI-assisted workflow ideas

These are better framed as review or synthesis workflows than deterministic CLI rewrites.

- AI-powered daily-log to weekly-summary synthesis
- AI-powered weekly or monthly review generation from daily logs, task history, and project context
- AI-assisted detection of likely missing follow-up tasks or unresolved themes across logs and projects

### Dataview-inspired model ideas

Dataview separates page-level records from item-level records: page queries operate on notes, while task queries operate on indexed tasks that inherit page fields. Use that as the long-term shape for this vault: keep tasks as item-level records, add events later as a separate item-level record type, and let both inherit page-level project, area, tags, and source context.

Suggested future event definition:

- Storage: a normal Markdown list item with `[type:: event]`; avoid checkbox syntax because events are scheduled occurrences, not actions to complete.
- Required fields: title/text plus either `[date:: YYYY-MM-DD]` for all-day events or `[start:: YYYY-MM-DDTHH:mm]` for timed events.
- Optional fields: `[end:: ...]`, `[location:: ...]`, `[area:: [[...]]]`, `[project:: [[...]]]`, `[source:: ...]`, `[status:: planned|done|cancelled]`, `[repeat:: ...]`, tags, and notes.
- Semantics: events are scheduled occurrences, not commitments to complete. They should not participate in overdue-task logic, completion checkoffs, or task carryover unless they produce a follow-up task.
- Views: future `kb event today/week/open` or query views can render agendas and calendars from event date/time fields, while `kb task ...` remains action-focused.
- Migration: current events-as-tasks can remain valid until event support exists; migration should be explicit and deterministic, not inferred silently from arbitrary task text.

Suggested future core types:

- `task`: action with completion, overdue, carryover, and checkoff semantics.
- `event`: scheduled occurrence with date/time fields; no task completion semantics.
- `decision`: chosen direction with date, rationale, and optionally alternatives considered.
- `waiting`: dependency on a person, organization, system, or external event; review until resolved.
- `resource`: durable reference summary.
- `source-copy`: saved article, extract, or source material backing a resource note.
- `project`: outcome-driven multi-step effort.
- `area`: ongoing responsibility or standard.

Possible later types only if repeated retrieval friction appears:

- `observation` or `note`: dated context worth preserving but not actionable.
- `idea`: possible future work, not yet committed.
- `question`: unresolved question to answer later.
- `meeting`: subtype of event only if agenda/notes/action extraction needs its own handling.
- `habit` or `routine`: recurring behavior tracked differently from tasks.
- `metric`: measurement entry such as sleep, mood, focus, or spending.
- `contact`: person or organization reference.
- `bookmark`: weak link/reference that has not been promoted to a resource.

### Future implementation shape

- Add a package-level catalog/search service in `packages/vault/src/` that reads Markdown through `VaultService`.
- Build `check` on top of deterministic analyzers that return structured findings by category, severity, file, and suggested fix.
- Keep mutation commands separate from `check`: `check` reports, explicit operation commands perform changes.
- Keep AI summarization and reflection workflows separate from deterministic CLI checks and mutation commands.
- Use symbol- or title-resolution logic that derives canonical note names from the top-level heading, then reconciles path, frontmatter, and link targets before mutating anything.
- Keep CLI command files thin: parse flags and args, delegate to services, and render through the existing root `--format` policy where practical.
- Add focused package tests for catalog extraction, search, rename safety, check findings, tag listing, and duplicate or similar-task ranking.
- Add parser and record-source support for item-level event records only after the storage convention is explicit and migration from event-like tasks can be deterministic.

## Routine vault maintenance ideas

These are good candidates for future recurring maintenance workflows or CLI support. Many of them can be bundled into top-level `kb check` categories, while mutating follow-up actions should remain separate explicit commands.

- Check for ambiguous wikilinks by comparing each link target against note titles derived from the top-level file header and flag any link text that resolves to multiple notes.
- Check for broken wikilinks and missing note targets.
- Check for title/path drift where a file name, folder topic, frontmatter topic, and top-level `# Heading` no longer agree enough to be easily findable.
- Check for duplicate or near-duplicate tasks across projects before they accumulate.
- Audit overdue tasks that have remained untouched across multiple reviews.
- Audit tasks missing expected context such as project, area, scheduled, due, completed, or repeat metadata where the surrounding file conventions imply they should exist.
- Check for inconsistent priority values, tag spellings, and work/personal labels so near-duplicates do not accumulate.
- Check for orphaned resource source copies that are not linked from a summary note, and summary notes whose `full_copy` link is missing.
- Check for resource notes missing core fields such as `type`, `topic`, `source`, `retrieved`, or executive-summary sections when those notes came from imports.
- Check for project notes that appear inactive or stale because they have no open tasks, no recent log/context updates, and no clear completion/archive status.
- Check whether completed projects should be archived out of `30-Projects/`.
- Review daily logs for days with substantial narrative context but no related task updates, or vice versa, to catch missed follow-up actions.
- Review whether weekly and monthly summaries should be generated from the daily logs during maintenance.
- Check whether `vault/dump.md` has stranded content that never made it through triage.
- Check dashboards and index-like notes for stale manual lists that no longer match the task source-of-truth.
- Check for empty topic folders, one-off resource folders, or fragmented categories that should be merged instead of expanded.
- Check archive Markdown files for duplicate top-level headings and enforce unique archive names so archived dumps do not collide with active notes in link/title checks.
