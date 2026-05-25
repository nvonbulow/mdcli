---
name: vault-end-of-day
description: Run an end-of-day vault closeout, including reflection, task checkoffs, completion logging, carryover scheduling, overdue-task auditing, and tomorrow focus planning.
---

# Vault End-of-Day Skill

Use this skill when the user asks to end the day, shut down, review today, check off completed work, plan tomorrow, or close out the vault.

Load [vault-workflow-reference](../vault-workflow-reference/SKILL.md) for shared `kb` CLI defaults, vault editing rules, task metadata conventions, daily-log conventions, and verification.

If `vault/dump.md` contains fresh capture relevant to the closeout, use [vault-ingest](../vault-ingest/SKILL.md) for ingestion rules before or during the closeout when that material would change the review.

## Workflow

Goal: close the loop, record completion, resolve overdue ambiguity, and reduce tomorrow’s surface area.

1. Establish dates.
   - Resolve `TODAY` using the shared local date and timezone policy; do not trust the harness/session UTC date when it differs from `America/New_York`.
   - If the local time is between 00:00 and 03:00 and the user has not given an explicit date, ask whether this closeout is for the previous calendar day or the new calendar day before querying or editing.
   - Compute `TOMORROW` as the next calendar day after the resolved `TODAY`.

2. Query today and nearby context.

```bash
kb --format json task today --date TODAY
kb --format json task due --date TODAY
kb --format json task week --start TODAY
```

3. Review likely completed work and overdue items.
   - Present today’s scheduled and due tasks.
   - Present overdue tasks separately from today, tomorrow, and later-this-week work.
   - Include relevant carryover and focus items from `vault/10-Dashboards/Today.md` if they are not already in the CLI result.
   - Mention any fresh `vault/dump.md` notes that look like completion evidence or follow-up material.

4. Ask the closeout questions in one `ask` call when possible.
   - Which tasks did you complete today? (multi-select plus free text)
   - For each overdue task, should it be completed, rescheduled, left intentionally overdue, rewritten, or left untouched for now?
   - What best describes the day?
   - What is your energy now?
   - What is one thing worth remembering?
   - What should tomorrow’s focus be?
   - Drop or delete overdue work only with explicit user confirmation.

5. Apply confirmed checkoffs.
   - In the owning project file, change `- [ ]` to `- [x]` and add `[completed:: TODAY]`.
   - Append entries to `vault/60-Logs/Task Completion History.md` under `## TODAY`.
   - Add concrete follow-up tasks when completion creates a next action.

6. Resolve unfinished and overdue work.
   - If the user wants carryover, update `[scheduled:: ...]` on the source task line.
   - If an overdue item is intentionally left alone, keep it overdue; do not silently move it.
   - If the task wording is no longer accurate, rewrite it to match the user’s current intent instead of carrying stale phrasing forward.
   - Delete or drop tasks only with explicit user confirmation.
   - For tomorrow planning, prefer 1–4 focus items.

7. Append closeout context to the daily log.
   - Create `vault/60-Logs/daily/YYYY-MM-DD.md` on demand when there is closeout narrative to record.
   - Append bullets for reflection, decisions, notable events, source summaries, and anything worth remembering.
   - Keep completed task checkoff records in `vault/60-Logs/Task Completion History.md`; do not duplicate them in the daily log unless narrative context adds value.

8. Prepare tomorrow.

```bash
kb --format json task today --date TOMORROW
kb --format json task week --start TOMORROW
```

   - Update `vault/10-Dashboards/Today.md` Manual Focus only after the user selects the focus or clearly asks you to set it.
   - Use tomorrow’s exact-date result for the main list, plus the week view for notable events soon after tomorrow.

9. Verify after edits using the shared reference rules.

## Output

Report what was checked off, what changed for overdue work, what moved to tomorrow, and what remains later this week. Distinguish overdue, tomorrow, and later-this-week items.
