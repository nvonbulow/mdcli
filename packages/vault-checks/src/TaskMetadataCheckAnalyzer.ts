import { MarkdownProcessor } from "@kb/markdown-ast"
import { Chunk, Context, Effect, Layer } from "effect"
import { type MarkdownModel } from "@kb/vault-core"
import { isIsoDate, taskRecordsForFile } from "@kb/vault-tasks"
import { CheckFinding } from "./CheckModel"
import type { CheckAnalyzer } from "./CheckAnalyzer"

const dateFieldNames = ["scheduled", "due", "completed"] as const

const analyzeFile = Effect.fnUntraced(function* (file: MarkdownModel.MarkdownFile) {
  const path = file.path ?? ""
  let findings = Chunk.empty<CheckFinding>()

  const tasks = yield* taskRecordsForFile(path, file).pipe(Effect.provide(MarkdownProcessor.layer))
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
