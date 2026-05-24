---
name: vault-start-of-day
description: Run a start-of-day review for this repository's vault, surfacing today's tasks, overdue carryover, dated commitments, and a narrow focus plan.
---

# Vault Start-of-Day Skill

Use this skill when the user asks to start the day, plan today, review what is coming up today, or choose a daily focus from the vault.

Load [vault-workflow-reference](../vault-workflow-reference/SKILL.md) for shared `kb` CLI defaults, vault editing rules, task metadata conventions, and verification.

## Workflow

Goal: give the user a small, accurate plan for today.

1. Establish dates.
   - Use the session date as `TODAY` unless the user specifies another date.
   - Compute tomorrow only if it helps explain upcoming work.

2. Query the vault from repo root.

```bash
kb --format json task today --date TODAY
kb --format json task due --date TODAY
kb --format json task week --start TODAY
```

3. Build the briefing.
   - Include tasks scheduled for today.
   - Include overdue tasks from `task due --date TODAY`, clearly labeled as overdue/carryover.
   - Include dated commitments/events from the task results even if the user describes them as “not really a task”.
   - Use the week view to mention important upcoming items only when they affect today’s choices.
   - Keep the plan narrow; do not turn every open item into today’s focus.

4. Ask for focus selection only when useful.
   - Good prompts: “Which 1–3 should be the day’s focus?” or “Do you want to defer any of these?”
   - Do not ask questions whose answer is already in `kb` output.

5. If the user chooses a plan, update `vault/10-Dashboards/Today.md` Manual Focus to match.
   - Keep Dataview fences intact.
   - Do not make dashboards the source of truth; update project task dates when rescheduling.

6. Verify after edits using the shared reference rules.

## Output

Give the user a concise briefing grouped as needed:

- Overdue / carryover
- Today
- Later this week, only if relevant
- Suggested focus, if the user asked for one or the answer is obvious
