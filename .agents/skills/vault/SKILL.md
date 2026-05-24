---
name: vault
description: Top-level router for this repository's vault workflows; choose and invoke start-of-day, end-of-day, ingestion, or shared vault workflow guidance.
---

# Vault Router Skill

Use this skill for broad vault requests when the user has not named a more specific workflow, including daily planning, daily closeout, ingestion, task review, or “what is coming up”.

Load [vault-workflow-reference](../vault-workflow-reference/SKILL.md) for shared `kb` CLI defaults, vault editing rules, task metadata conventions, daily-log conventions, resource-import conventions, and verification whenever a routed workflow will query or edit the vault.

## Route selection

Choose exactly one primary workflow unless the user asks for a combined flow.

1. Start of day / planning → [vault-start-of-day](../vault-start-of-day/SKILL.md)
   - Triggers: “start my day”, “plan today”, “what’s today”, “what’s coming up today”, “daily focus”, “morning review”.

2. End of day / closeout → [vault-end-of-day](../vault-end-of-day/SKILL.md)
   - Triggers: “end of day”, “shutdown”, “close out”, “review today”, “check off what I did”, “plan tomorrow”.

3. Ingestion / triage / imports → [vault-ingest](../vault-ingest/SKILL.md)
   - Triggers: “ingest”, “process dump”, “clear dump”, “triage inbox”, “organize these notes”, “archive this capture”, “import this article”, “process this file”, “turn this reminder into tasks”.
   - Use for `vault/dump.md`, pasted notes, scratch captures, reminders, local files, URLs, articles, and mixed-source inbox material.

4. Shared mechanics only → [vault-workflow-reference](../vault-workflow-reference/SKILL.md)
   - Use only when the user asks about conventions, commands, task metadata, PARA structure, resource storage, or verification practices.

## Ambiguity rules

- If the user says “what’s coming up” without a date, run the start-of-day workflow for the session date and include relevant near-future items from the week query.
- If the user says “tomorrow”, use the start-of-day workflow with tomorrow as the requested date.
- If the user asks to “check off” or “mark done”, use end-of-day mechanics for confirmed completions even outside a full closeout.
- If the request combines ingestion with daily review, ingest first when the captured material may affect the review; otherwise run the daily workflow first and mention the inbox material as a follow-up.
- If the request includes both source cleanup and daily closeout, keep `vault-ingest` as the primary workflow when captured material still needs triage.
- Do not ask which skill to use unless the request has two materially different interpretations that tools cannot resolve.

## Execution contract

After routing:

1. Load the selected workflow skill.
2. Load `vault-workflow-reference` if the selected skill points to it or if vault commands/edits are needed.
3. Follow the selected workflow’s verification rules.
4. Report the workflow used only if it clarifies the result; otherwise answer directly.
