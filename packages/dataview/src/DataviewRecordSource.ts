import { VaultService, type ParsedTask, type TaskParseError, type VaultIoError } from "@kb/vault"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { DataviewEvaluateError, type DataviewExpression, type DataviewTaskQuery } from "./DataviewAst"
import { DataviewRecord, type DataviewScalar, type DataviewValue } from "./DataviewResult"

export type DataviewRecordSourceService = {
  readonly recordsFor: (
    query: DataviewTaskQuery
  ) => Effect.Effect<ReadonlyArray<DataviewRecord>, VaultIoError | TaskParseError | DataviewEvaluateError>
}

export class DataviewRecordSource extends Context.Service<DataviewRecordSource, DataviewRecordSourceService>()(
  "@kb/dataview/DataviewRecordSource"
) {
  static readonly layerNoDeps: Layer.Layer<DataviewRecordSource, never, VaultService> = Layer.effect(
    this,
    Effect.gen(function* () {
      const vault = yield* VaultService
      const recordsFor = Effect.fn("@kb/dataview/DataviewRecordSource.recordsFor")(function* (
        query: DataviewTaskQuery
      ) {
        const source = yield* sourceFromQuery(query)
        const tasks = yield* vault.readTasks(source)
        return tasks.map(taskRecord)
      })
      return DataviewRecordSource.of({ recordsFor })
    })
  )
}

export const taskRecord = (task: ParsedTask): DataviewRecord =>
  new DataviewRecord({
    original: task,
    fields: taskFields(task)
  })

export const sourceFromQuery = (query: DataviewTaskQuery): Effect.Effect<string, DataviewEvaluateError> =>
  query.source === undefined
    ? Effect.fail(new DataviewEvaluateError({ message: "Dataview query must specify an explicit source" }))
    : sourceFromExpression(query.source)

export const sourceFromExpression = (expression: DataviewExpression): Effect.Effect<string, DataviewEvaluateError> => {
  switch (expression._tag) {
    case "Identifier":
      return nonEmptySource(expression.name)
    case "StringLiteral":
      return nonEmptySource(expression.value)
    case "NumberLiteral":
      return nonEmptySource(`${expression.value}`)
    case "BooleanLiteral":
      return nonEmptySource(expression.value ? "true" : "false")
    default:
      return Effect.fail(
        new DataviewEvaluateError({ message: "Dataview source must be a scalar literal or identifier" })
      )
  }
}

const taskFields = (task: ParsedTask): Readonly<Record<string, DataviewValue>> => ({
  ...task.fields,
  ...task.unknownFields,
  task: task.text,
  text: task.text,
  completed: task.done,
  scheduled: task.scheduled ?? task.fields.scheduled ?? null,
  due: task.due ?? task.fields.due ?? null,
  depends: task.depends ?? task.fields.depends ?? null,
  repeat: task.repeat ?? task.fields.repeat ?? null,
  area: task.area ?? task.fields.area ?? null,
  project: task.project ?? task.fields.project ?? null,
  tags: task.tags,
  path: task.source.path,
  line: task.source.lineNumber,
  "file.path": task.source.path,
  "file.link": task.source.path,
  "file.line": task.source.lineNumber
})

const nonEmptySource = (source: string): Effect.Effect<string, DataviewEvaluateError> =>
  source.length === 0
    ? Effect.fail(new DataviewEvaluateError({ message: "Dataview query source must not be empty" }))
    : Effect.succeed(source)

export const scalarValue = (value: DataviewValue): DataviewScalar => (isScalarArray(value) ? (value[0] ?? null) : value)
const isScalarArray = (value: DataviewValue): value is ReadonlyArray<DataviewScalar> => Array.isArray(value)
