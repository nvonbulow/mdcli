import { CalendarService, type IsoDate } from "@kb/vault-core"
import * as Context from "effect/Context"
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
  static readonly layerNoDeps: Layer.Layer<DataviewFunctionRegistry, never, CalendarService> = Layer.effect(
    this,
    Effect.gen(function* () {
      const calendar = yield* CalendarService
      const functions = Effect.fn("@kb/dataview/DataviewFunctionRegistry.functions")(function* () {
        const today = yield* calendar.today()
        return dataviewFunctions(today)
      })
      return DataviewFunctionRegistry.of({ functions })
    })
  )
}

const dataviewFunctions = (today: IsoDate): DataviewFunctions => ({
  contains: (args) => {
    const haystack = args[0]
    const needle = scalarText(args[1] ?? null)
    return Array.isArray(haystack)
      ? haystack.some((value) => scalarText(value) === needle)
      : scalarText(haystack ?? null).includes(needle)
  },
  date: (args) => {
    const value = scalarText(args[0] ?? null)
    return value === "today" ? today : value
  }
})

const scalarText = (value: DataviewValue | DataviewScalar): string => {
  if (Array.isArray(value)) {
    return scalarText(value[0] ?? null)
  }
  return value === null ? "" : `${value}`
}
