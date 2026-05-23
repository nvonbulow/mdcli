import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type { DataviewEvaluateError, DataviewParseError, DataviewTaskQuery } from "./DataviewAst"
import { parseDataviewQuery } from "./DataviewParser"
import type { DataviewRecord, DataviewResult as DataviewResultType } from "./DataviewResult"
import {
  DataviewEvaluator,
  evaluate,
  evaluateExpression,
  truthy,
  type DataviewFunction,
  type DataviewFunctions,
  type EvaluationContext
} from "./DataviewEvaluator"

export { evaluate, evaluateExpression, truthy, type DataviewFunction, type DataviewFunctions, type EvaluationContext }

export type Service = {
  readonly parse: (query: string) => Effect.Effect<DataviewTaskQuery, DataviewParseError>
  readonly evaluate: (
    queryText: string,
    query: DataviewTaskQuery,
    records: ReadonlyArray<DataviewRecord>,
    context: EvaluationContext
  ) => Effect.Effect<DataviewResultType, DataviewEvaluateError>
  readonly run: (
    query: string,
    records: ReadonlyArray<DataviewRecord>,
    context: EvaluationContext
  ) => Effect.Effect<DataviewResultType, DataviewParseError | DataviewEvaluateError>
}

export class DataviewEngine extends Context.Service<DataviewEngine, Service>()("@kb/dataview/DataviewEngine") {}

export const make: Effect.Effect<Service, never, DataviewEvaluator> = Effect.gen(function* () {
  const evaluator = yield* DataviewEvaluator
  return DataviewEngine.of({
    parse: parseDataviewQuery,
    evaluate: evaluator.evaluate,
    run: (query, records, context) =>
      parseDataviewQuery(query).pipe(Effect.flatMap((parsed) => evaluator.evaluate(query, parsed, records, context)))
  })
})

export const layer: Layer.Layer<DataviewEngine> = Layer.effect(DataviewEngine, make).pipe(
  Layer.provide(DataviewEvaluator.layerNoDeps)
)
