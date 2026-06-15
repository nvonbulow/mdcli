import { MarkdownProcessor } from "@kb/markdown-ast"
import { Chunk, Context, DateTime, Duration, Effect, Layer } from "effect"
import { type MarkdownModel } from "@kb/vault-core"
import {
  IsoDate,
  isIsoDate,
  ParsedTaskRecurrence,
  TaskRecurrenceParseResult,
  TaskRecurrenceService,
  taskRecordsForFile,
  type VaultTaskRecord
} from "@kb/vault-tasks"
import { CheckContext, CheckFinding } from "./CheckModel"
import type { CheckAnalyzer } from "./CheckAnalyzer"

const dateFieldNames = ["scheduled", "due", "completed"] as const

const allowedTaskFieldNames: Record<string, true> = {
  scheduled: true,
  due: true,
  completed: true,
  depends: true,
  repeat: true,
  repeatFrom: true,
  area: true,
  project: true,
  source: true,
  priority: true,
  person: true
}
const priorityValues: Record<string, true> = { high: true, medium: true, low: true }

const makeAnalyzeFile = (recurrence: TaskRecurrenceService) =>
  Effect.fnUntraced(function* (file: MarkdownModel.MarkdownFile) {
    const context = yield* CheckContext
    const path = file.path ?? ""
    let findings = Chunk.empty<CheckFinding>()

    const tasks = yield* taskRecordsForFile(path, file).pipe(Effect.provide(MarkdownProcessor.layer))
    for (const record of Chunk.toReadonlyArray(tasks)) {
      const recurrenceResult = yield* recurrence.parseTask(record.task)
      findings = Chunk.appendAll(findings, dateFieldFindings(record))
      findings = Chunk.appendAll(findings, completionStateFindings(record))
      findings = Chunk.appendAll(findings, openTaskPlanningFindings(record))
      findings = Chunk.appendAll(findings, linkShapeFindings(record))
      findings = Chunk.appendAll(findings, priorityFindings(record))
      findings = Chunk.appendAll(findings, unknownFieldFindings(record))
      findings = Chunk.appendAll(
        findings,
        yield* recurrenceFindings(record, recurrenceResult, context.taskRecords, recurrence)
      )
    }

    return findings
  })

const dateFieldFindings = (record: VaultTaskRecord): Chunk.Chunk<CheckFinding> => {
  let findings = Chunk.empty<CheckFinding>()
  for (const fieldName of dateFieldNames) {
    const value = record.fields[fieldName]
    if (value !== undefined && !isIsoDate(value)) {
      findings = Chunk.append(
        findings,
        finding(record, "error", `Invalid ${fieldName} date: ${value}`, "Use a valid YYYY-MM-DD date.")
      )
    }
  }
  return findings
}

const completionStateFindings = (record: VaultTaskRecord): Chunk.Chunk<CheckFinding> => {
  if (record.done && record.task.completed === undefined) {
    return Chunk.of(
      finding(
        record,
        "error",
        "Completed task is missing [completed:: YYYY-MM-DD] metadata",
        "Add [completed:: YYYY-MM-DD] matching the completion date."
      )
    )
  }

  if (!record.done && record.task.completed !== undefined) {
    return Chunk.of(
      finding(
        record,
        "error",
        "Open task has [completed:: ...] metadata",
        "Mark the task complete or remove [completed:: ...]."
      )
    )
  }

  return Chunk.empty()
}

const openTaskPlanningFindings = (record: VaultTaskRecord): Chunk.Chunk<CheckFinding> => {
  if (record.done) {
    return Chunk.empty()
  }

  let findings = Chunk.empty<CheckFinding>()
  if (record.task.area === undefined || record.task.area.length === 0) {
    findings = Chunk.append(
      findings,
      finding(record, "error", "Open task is missing [area:: ...] metadata", "Add [area:: [[...]]] metadata.")
    )
  }

  if (record.task.project === undefined || record.task.project.length === 0) {
    findings = Chunk.append(
      findings,
      finding(record, "error", "Open task is missing [project:: ...] metadata", "Add [project:: [[...]]] metadata.")
    )
  }

  if (record.task.scheduled === undefined && record.task.due === undefined && record.task.repeat === undefined) {
    findings = Chunk.append(
      findings,
      finding(
        record,
        "warning",
        "Open task has no scheduled, due, or repeat metadata, so planning views will not surface it",
        "Add [scheduled:: YYYY-MM-DD], [due:: YYYY-MM-DD], or supported [repeat:: ...] metadata."
      )
    )
  }

  if (record.task.scheduled !== undefined && record.task.due !== undefined && record.task.scheduled > record.task.due) {
    findings = Chunk.append(
      findings,
      finding(
        record,
        "warning",
        `Task scheduled date is after due date: ${record.task.scheduled} > ${record.task.due}`,
        "Move [scheduled:: ...] on or before [due:: ...], or correct the due date."
      )
    )
  }

  return findings
}

const linkShapeFindings = (record: VaultTaskRecord): Chunk.Chunk<CheckFinding> => {
  let findings = Chunk.empty<CheckFinding>()
  findings = appendLinkShapeFinding(findings, record, "area", record.fields.area)
  findings = appendLinkShapeFinding(findings, record, "project", record.fields.project)
  findings = appendLinkShapeFinding(findings, record, "depends", record.fields.depends)
  findings = appendLinkShapeFinding(findings, record, "person", record.fields.person)
  findings = appendLinkShapeFinding(findings, record, "source", record.fields.source)
  return findings
}

const appendLinkShapeFinding = (
  findings: Chunk.Chunk<CheckFinding>,
  record: VaultTaskRecord,
  fieldName: "area" | "project" | "depends" | "person" | "source",
  value: string | undefined
): Chunk.Chunk<CheckFinding> =>
  value !== undefined && !isWikiLinkValue(value)
    ? Chunk.append(
        findings,
        finding(
          record,
          "warning",
          `Task ${fieldName} metadata should be a wikilink: ${value}`,
          "Use [[...]] around the metadata target."
        )
      )
    : findings

const isWikiLinkValue = (value: string): boolean => {
  const trimmed = value.trim()
  return trimmed.startsWith("[[") && trimmed.endsWith("]]")
}

const priorityFindings = (record: VaultTaskRecord): Chunk.Chunk<CheckFinding> => {
  const priority = record.fields.priority
  if (priority !== undefined && priorityValues[priority.trim().toLowerCase()] !== true) {
    return Chunk.of(
      finding(record, "warning", `Unsupported task priority: ${priority}`, "Use [priority:: high], [priority:: medium], or [priority:: low].")
    )
  }
  return Chunk.empty()
}

const unknownFieldFindings = (record: VaultTaskRecord): Chunk.Chunk<CheckFinding> => {
  let findings = Chunk.empty<CheckFinding>()
  for (const fieldName of Object.keys(record.fields).sort()) {
    if (allowedTaskFieldNames[fieldName] !== true) {
      findings = Chunk.append(
        findings,
        finding(
          record,
          "warning",
          `Unknown task metadata field: ${fieldName}`,
          "Use an existing task metadata field or add this field to the checker allowlist intentionally."
        )
      )
    }
  }
  return findings
}

const recurrenceFindings = (
  record: VaultTaskRecord,
  result: TaskRecurrenceParseResult,
  taskRecords: Chunk.Chunk<VaultTaskRecord>,
  recurrence: TaskRecurrenceService
): Effect.Effect<Chunk.Chunk<CheckFinding>> =>
  Effect.gen(function* () {
    let findings = Chunk.empty<CheckFinding>()

    switch (result._tag) {
      case "Unsupported":
        return Chunk.of(
          finding(
            record,
            "error",
            `Recurring task repeat text is not supported by planning views: ${result.original}`,
            recurrenceSuggestedFix(result.reason)
          )
        )
      case "Supported": {
        if (record.task.scheduled === undefined && record.task.due === undefined) {
          findings = Chunk.append(
            findings,
            finding(
              record,
              "warning",
              "Recurring task has no scheduled or due date, so planning views cannot expand it",
              "Add [scheduled:: YYYY-MM-DD] or [due:: YYYY-MM-DD]."
            )
          )
        }

        const completedSeedFinding = yield* completedRecurringSeedFinding(
          record,
          result.recurrence,
          taskRecords,
          recurrence
        )
        if (completedSeedFinding !== undefined) {
          findings = Chunk.append(findings, completedSeedFinding)
        }
        return findings
      }
      case "NoRepeat":
        return findings
    }
  })

const completedRecurringSeedFinding = (
  record: VaultTaskRecord,
  recurrence: ParsedTaskRecurrence,
  taskRecords: Chunk.Chunk<VaultTaskRecord>,
  recurrenceService: TaskRecurrenceService
): Effect.Effect<CheckFinding | undefined> =>
  Effect.gen(function* () {
    if (!record.done) {
      return undefined
    }

    const currentReference = recurrenceReferenceDate(record)
    if (currentReference === undefined) {
      return undefined
    }

    const seriesKey = recurrenceSeriesKey(record, recurrence)
    let latestCompletedReference = currentReference
    let hasFutureOpenSource = false

    for (const candidate of Chunk.toReadonlyArray(taskRecords)) {
      const candidateResult = yield* recurrenceService.parseTask(candidate.task)
      if (candidateResult._tag !== "Supported") {
        continue
      }
      if (recurrenceSeriesKey(candidate, candidateResult.recurrence) !== seriesKey) {
        continue
      }

      if (candidate.done) {
        const candidateReference = recurrenceReferenceDate(candidate)
        if (candidateReference !== undefined && candidateReference > latestCompletedReference) {
          latestCompletedReference = candidateReference
        }
      } else {
        const openReference = candidate.task.due ?? candidate.task.scheduled
        if (openReference !== undefined && openReference > currentReference) {
          hasFutureOpenSource = true
        }
      }
    }

    if (currentReference !== latestCompletedReference || hasFutureOpenSource) {
      return undefined
    }

    return finding(
      record,
      "warning",
      "Completed recurring task has no future open source row, so planning views will not show the next occurrence",
      "Add the next open occurrence, or leave an open seed task with the same supported [repeat:: ...] metadata."
    )
  })

const recurrenceSuggestedFix = (reason: "empty" | "when-done" | "parse-error"): string => {
  switch (reason) {
    case "empty":
      return "Add supported recurrence text such as [repeat:: every week], or remove the empty repeat field."
    case "when-done":
      return "Remove the 'when done' suffix; this runtime currently does not expand completion-based recurrences."
    case "parse-error":
      return "Use recurrence text accepted by rrule, such as [repeat:: every week] or [repeat:: every 2 weeks on Wednesday]."
  }
}

const recurrenceSeriesKey = (record: VaultTaskRecord, recurrence: ParsedTaskRecurrence): string =>
  [
    record.task.area ?? "",
    record.task.project ?? "",
    record.task.text,
    recurrence.rruleText,
    record.task.due === undefined ? "scheduled" : record.task.scheduled === undefined ? "due" : "scheduled+due",
    record.task.scheduled !== undefined && record.task.due !== undefined
      ? String(daysBetween(record.task.due, record.task.scheduled))
      : "0"
  ].join("\u0000")

const recurrenceReferenceDate = (record: VaultTaskRecord): IsoDate | undefined =>
  record.task.due ?? record.task.scheduled ?? record.task.completed

const daysBetween = (start: IsoDate, end: IsoDate): number => {
  const startDate = DateTime.make(start)
  const endDate = DateTime.make(end)
  if (startDate._tag === "None" || endDate._tag === "None") {
    return 0
  }
  return Duration.toMillis(DateTime.distance(startDate.value, endDate.value)) / 86_400_000
}

const finding = (
  record: VaultTaskRecord,
  severity: "error" | "warning",
  message: string,
  suggestedFix: string
): CheckFinding =>
  new CheckFinding({
    category: "tasks",
    severity,
    path: record.path,
    position: record.position,
    message,
    suggestedFix,
    triggerPath: record.path
  })

export class TaskMetadataCheckAnalyzer extends Context.Service<TaskMetadataCheckAnalyzer, CheckAnalyzer>()(
  "@kb/vault-checks/TaskMetadataCheckAnalyzer"
) {
  static readonly layer: Layer.Layer<TaskMetadataCheckAnalyzer, never, TaskRecurrenceService> = Layer.effect(
    TaskMetadataCheckAnalyzer,
    Effect.gen(function* () {
      const recurrence = yield* TaskRecurrenceService
      return TaskMetadataCheckAnalyzer.of({ analyzeFile: makeAnalyzeFile(recurrence) })
    })
  )
}
