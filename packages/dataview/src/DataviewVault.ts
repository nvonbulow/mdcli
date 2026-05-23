import { Effect } from "effect"
import type { FileSystem } from "effect/FileSystem"
import type { Path } from "effect/Path"
import { type ParsedTask, readProjectTasks, ReadVaultOptions } from "@kb/vault"
import { DataviewRecord, type DataviewScalar, type DataviewValue } from "./DataviewResult"
import { evaluateExpression } from "./DataviewEngine"
import type { DataviewExpression } from "./DataviewAst"
import type { EvaluationContext } from "./DataviewEngine"

export type VaultSourceOptions = {
  readonly root: string
  readonly source: DataviewExpression | undefined
  readonly context: EvaluationContext
}

export const taskRecord = (task: ParsedTask): DataviewRecord =>
  new DataviewRecord({
    original: task,
    fields: {
      ...task.fields,
      completed: task.done,
      tags: task.tags,
      text: task.text,
      path: task.source.path,
      line: task.source.lineNumber,
      "file.link": task.source.path,
      "file.path": task.source.path,
      "file.line": task.source.lineNumber
    }
  })

export const tasksFromRecords = (records: ReadonlyArray<DataviewRecord>): ReadonlyArray<ParsedTask> =>
  records.flatMap((record) => (isParsedTask(record.original) ? [record.original] : []))

export const readVaultRecords = (
  options: VaultSourceOptions
): Effect.Effect<ReadonlyArray<DataviewRecord>, Error, FileSystem | Path> => {
  const value =
    options.source === undefined ? undefined : evaluateExpression(options.source, emptyRecord, options.context)
  const source = sourceText(value)
  if (source === undefined) {
    return Effect.fail(new Error("Dataview query needs a source expression or an explicit caller-provided record set"))
  }
  return readProjectTasks(new ReadVaultOptions({ root: options.root, projectsPath: source })).pipe(
    Effect.map((tasks) => tasks.map(taskRecord)),
    Effect.mapError((cause) => new Error(`${cause}`))
  )
}

const emptyRecord = new DataviewRecord({ fields: {}, original: undefined })

const sourceText = (value: DataviewValue | undefined): string | undefined => {
  if (value === undefined || value === null || Array.isArray(value)) {
    return undefined
  }
  return `${value}`
}

const isParsedTask = (value: unknown): value is ParsedTask =>
  typeof value === "object" && value !== null && "source" in value && "fields" in value

export const scalarValue = (value: DataviewValue): DataviewScalar => (isScalarArray(value) ? (value[0] ?? null) : value)
const isScalarArray = (value: DataviewValue): value is ReadonlyArray<DataviewScalar> => Array.isArray(value)
