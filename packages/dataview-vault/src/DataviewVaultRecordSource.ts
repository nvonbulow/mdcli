import {
  DataviewEvaluateError,
  DataviewRecord,
  DataviewRecordSource,
  DataviewRecordSourceError,
  type DataviewExpression,
  type DataviewTaskQuery,
  type DataviewValue
} from "@kb/dataview"
import { fromPath, fromPattern, isGlobPattern, VaultService, type VaultScope } from "@kb/vault-core"
import { type ParsedTask, taskRecordsForTreeNoDeps } from "@kb/vault-tasks"
import * as Chunk from "effect/Chunk"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

export class DataviewVaultRecordSource {
  static readonly layerNoDeps: Layer.Layer<DataviewRecordSource, never, VaultService> = Layer.effect(
    DataviewRecordSource,
    Effect.gen(function* () {
      const vaultService = yield* VaultService
      const recordsFor = Effect.fn("@kb/dataview-vault/DataviewVaultRecordSource.recordsFor")(function* (
        query: DataviewTaskQuery
      ) {
        const scope = yield* scopeFromQuery(query)
        return yield* Effect.gen(function* () {
          const tree = yield* vaultService.readMarkdownTree(scope)
          const tasks = yield* taskRecordsForTreeNoDeps(scope, tree)
          return Chunk.toReadonlyArray(Chunk.map(tasks, (record) => taskRecord(record.task)))
        }).pipe(Effect.mapError(toRecordSourceError))
      })
      return DataviewRecordSource.of({ recordsFor })
    })
  )
}

export const layerNoDeps = DataviewVaultRecordSource.layerNoDeps

const taskRecord = (task: ParsedTask): DataviewRecord =>
  new DataviewRecord({
    original: task,
    fields: taskFields(task)
  })

const scopeFromQuery = (query: DataviewTaskQuery): Effect.Effect<VaultScope, DataviewEvaluateError> =>
  query.source === undefined
    ? Effect.fail(new DataviewEvaluateError({ message: "Dataview query must specify an explicit source" }))
    : scopeFromExpression(query.source)

const scopeFromExpression = (expression: DataviewExpression): Effect.Effect<VaultScope, DataviewEvaluateError> => {
  switch (expression._tag) {
    case "Identifier":
      return scopeFromSource(expression.name)
    case "StringLiteral":
      return scopeFromSource(expression.value)
    case "NumberLiteral":
      return scopeFromSource(`${expression.value}`)
    case "BooleanLiteral":
      return scopeFromSource(expression.value ? "true" : "false")
    default:
      return Effect.fail(new DataviewEvaluateError({ message: "Dataview source must be a scalar literal or identifier" }))
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

const scopeFromSource = (source: string): Effect.Effect<VaultScope, DataviewEvaluateError> =>
  source.length === 0
    ? Effect.fail(new DataviewEvaluateError({ message: "Dataview query source must not be empty" }))
    : Effect.succeed(isGlobPattern(source) ? fromPattern(source) : fromPath(source))

const toRecordSourceError = (error: { readonly message: string }): DataviewRecordSourceError =>
  new DataviewRecordSourceError({ message: error.message })
