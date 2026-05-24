import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type { MarkdownParseError, TaskParseError, VaultIoError } from "@kb/vault"
import type { DataviewEvaluateError, DataviewParseError } from "./DataviewAst"
import { DataviewEvaluator } from "./DataviewEvaluator"
import { DataviewFunctionRegistry } from "./DataviewFunctionRegistry"
import { DataviewParser } from "./DataviewParser"
import { DataviewRecordSource } from "./DataviewRecordSource"
import type { DataviewResult } from "./DataviewResult"

export type DataviewProgramService = {
  readonly run: (
    queryText: string
  ) => Effect.Effect<
    DataviewResult,
    DataviewParseError | DataviewEvaluateError | VaultIoError | TaskParseError | MarkdownParseError
  >
}

export class DataviewProgram extends Context.Service<DataviewProgram, DataviewProgramService>()(
  "@kb/dataview/DataviewProgram"
) {
  static readonly layerNoDeps: Layer.Layer<
    DataviewProgram,
    never,
    DataviewParser | DataviewRecordSource | DataviewEvaluator | DataviewFunctionRegistry
  > = Layer.effect(
    this,
    Effect.gen(function* () {
      const parser = yield* DataviewParser
      const recordSource = yield* DataviewRecordSource
      const evaluator = yield* DataviewEvaluator
      const functionRegistry = yield* DataviewFunctionRegistry
      const run = Effect.fn("@kb/dataview/DataviewProgram.run")(function* (queryText: string) {
        const query = yield* parser.parse(queryText)
        const records = yield* recordSource.recordsFor(query)
        const functions = yield* functionRegistry.functions()
        return yield* evaluator.evaluate(queryText, query, records, { functions })
      })
      return DataviewProgram.of({ run })
    })
  )
}
