import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type { DataviewFunctions } from "./DataviewEvaluator"
import type { DataviewScalar, DataviewValue } from "./DataviewResult"

export type DataviewFunctionRegistryService = {
  readonly functions: () => Effect.Effect<DataviewFunctions>
}

export class DataviewFunctionRegistry extends Context.Service<
  DataviewFunctionRegistry,
  DataviewFunctionRegistryService
>()("@kb/dataview/DataviewFunctionRegistry") {
  static readonly layerNoDeps: Layer.Layer<DataviewFunctionRegistry> = Layer.succeed(
    this,
    DataviewFunctionRegistry.of({
      functions: Effect.fn("@kb/dataview/DataviewFunctionRegistry.functions")(function* () {
        const now = yield* DateTime.now
        return dataviewFunctions(DateTime.formatIsoDateUtc(now))
      })
    })
  )

  static layerTest(today: string): Layer.Layer<DataviewFunctionRegistry> {
    return Layer.succeed(
      this,
      DataviewFunctionRegistry.of({
        functions: () => Effect.succeed(dataviewFunctions(today))
      })
    )
  }
}

const dataviewFunctions = (today: string): DataviewFunctions => ({
  contains: (args) => {
    const haystack = args[0]
    const needle = scalarText(args[1] ?? null)
    if (Array.isArray(haystack)) {
      return arrayContains(haystack, needle)
    }
    return isObjectValue(haystack) ? false : scalarText(haystack ?? null).includes(needle)
  },
  date: (args) => {
    const value = scalarText(args[0] ?? null)
    return value === "today" ? today : value
  }
})

const arrayContains = (haystack: ReadonlyArray<DataviewValue>, needle: string): boolean =>
  haystack.some((value) =>
    Array.isArray(value) ? arrayContains(value as ReadonlyArray<DataviewValue>, needle) : scalarText(value) === needle
  )

const scalarText = (value: DataviewValue | DataviewScalar): string => {
  if (Array.isArray(value)) {
    return value.map((item) => scalarText(item)).join(", ")
  }
  if (isObjectValue(value)) {
    return JSON.stringify(value) ?? ""
  }
  return value === null ? "" : `${value}`
}

const isObjectValue = (value: DataviewValue | DataviewScalar | undefined): boolean =>
  typeof value === "object" && value !== null && !Array.isArray(value)
