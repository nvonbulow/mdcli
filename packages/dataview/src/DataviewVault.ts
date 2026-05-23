import { Effect } from "effect"
import type { FileSystem } from "effect/FileSystem"
import type { Path } from "effect/Path"
import { type ParsedTask, readProjectTasks, ReadVaultOptions } from "@kb/vault"
import {
  DataviewColumn,
  DataviewMetadata,
  DataviewRecord,
  DataviewResult,
  DataviewRow,
  type DataviewResult as DataviewResultType,
  type DataviewValue
} from "./DataviewResult"
import type { DataviewExpression } from "./DataviewAst"
import type { EvaluationContext } from "./DataviewEngine"
import { sourceFromExpression, taskRecord as makeTaskRecord } from "./DataviewRecordSource"
export { scalarValue, taskRecord } from "./DataviewRecordSource"

export type VaultSourceOptions = {
  readonly root: string
  readonly source: DataviewExpression | undefined
  readonly context: EvaluationContext
}

export const taskTableResult = (
  tasks: ReadonlyArray<ParsedTask>,
  query: string,
  source: DataviewValue | undefined = undefined
): DataviewResultType => {
  const columns = [
    new DataviewColumn({ key: "due", label: "Due" }),
    new DataviewColumn({ key: "scheduled", label: "Scheduled" }),
    new DataviewColumn({ key: "repeat", label: "Repeat" }),
    new DataviewColumn({ key: "area", label: "Area" }),
    new DataviewColumn({ key: "project", label: "Project" }),
    new DataviewColumn({ key: "task", label: "Task" }),
    new DataviewColumn({ key: "source", label: "Source" })
  ]
  const rows = tasks.map(
    (task) =>
      new DataviewRow({
        record: makeTaskRecord(task),
        cells: {
          due: task.due ?? null,
          scheduled: task.scheduled ?? null,
          repeat: task.repeat ?? null,
          area: task.area ?? null,
          project: task.project ?? null,
          task: task.text,
          source: `${task.source.path}:${task.source.lineNumber}`
        }
      })
  )
  return DataviewResult.QueryResult({
    columns,
    rows,
    groups: [],
    metadata: new DataviewMetadata({ query, source })
  })
}

export const tasksFromRecords = (records: ReadonlyArray<DataviewRecord>): ReadonlyArray<ParsedTask> =>
  records.flatMap((record) => (isParsedTask(record.original) ? [record.original] : []))

export const readVaultRecords = (
  options: VaultSourceOptions
): Effect.Effect<ReadonlyArray<DataviewRecord>, Error, FileSystem | Path> => {
  if (options.source === undefined) {
    return Effect.fail(new Error("Dataview query must specify an explicit source"))
  }
  return sourceFromExpression(options.source).pipe(
    Effect.mapError((error) => new Error(error.message)),
    Effect.flatMap((source) => readProjectTasks(new ReadVaultOptions({ root: options.root, projectsPath: source }))),
    Effect.map((tasks) => tasks.map(makeTaskRecord)),
    Effect.mapError((cause) => (cause instanceof Error ? cause : new Error(`${cause}`)))
  )
}

const isParsedTask = (value: unknown): value is ParsedTask =>
  typeof value === "object" && value !== null && "source" in value && "fields" in value
