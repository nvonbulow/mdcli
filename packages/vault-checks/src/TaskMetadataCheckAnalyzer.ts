import { Chunk, Context, Effect, Layer } from "effect"
import { fromPath } from "@kb/vault-core"
import { isIsoDate, taskRecordsForTreeNoDeps } from "@kb/vault-tasks"
import { CheckContext, CheckFinding } from "./CheckModel"
import type { CheckAnalyzer } from "./CheckAnalyzer"

const dateFieldNames = ["scheduled", "due", "completed"] as const

const analyzeFile = Effect.fnUntraced(function* (path: string) {
  const context = yield* CheckContext
  let findings = Chunk.empty<CheckFinding>()

  const tasks = yield* taskRecordsForTreeNoDeps(fromPath(path), context.vault.tree)
  for (const record of tasks) {
    for (const fieldName of dateFieldNames) {
      const value = record.fields[fieldName]
      if (value !== undefined && !isIsoDate(value)) {
        findings = Chunk.append(
          findings,
          new CheckFinding({
            category: "tasks",
            severity: "error",
            path: record.path,
            position: record.position,
            message: `Invalid ${fieldName} date: ${value}`,
            suggestedFix: "Use a valid YYYY-MM-DD date.",
            triggerPath: record.path
          })
        )
      }
    }

    if (record.done) {
      continue
    }

    if (record.task.area === undefined || record.task.area.length === 0) {
      findings = Chunk.append(
        findings,
        new CheckFinding({
          category: "tasks",
          severity: "error",
          path: record.path,
          position: record.position,
          message: "Open task is missing [area:: ...] metadata",
          suggestedFix: "Add [area:: [[...]]] metadata.",
          triggerPath: record.path
        })
      )
    }

    if (record.task.project === undefined || record.task.project.length === 0) {
      findings = Chunk.append(
        findings,
        new CheckFinding({
          category: "tasks",
          severity: "error",
          path: record.path,
          position: record.position,
          message: "Open task is missing [project:: ...] metadata",
          suggestedFix: "Add [project:: [[...]]] metadata.",
          triggerPath: record.path
        })
      )
    }
  }

  return findings
})

export class TaskMetadataCheckAnalyzer extends Context.Service<TaskMetadataCheckAnalyzer, CheckAnalyzer>()(
  "@kb/vault-checks/TaskMetadataCheckAnalyzer"
) {
  static readonly layer: Layer.Layer<TaskMetadataCheckAnalyzer> = Layer.succeed(
    TaskMetadataCheckAnalyzer,
    TaskMetadataCheckAnalyzer.of({ analyzeFile })
  )
}
