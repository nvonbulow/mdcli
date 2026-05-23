import type { IsoDate } from "@kb/vault"
import type { DataviewFunctions } from "./DataviewEngine"
import type { DataviewScalar, DataviewValue } from "./DataviewResult"

export const dataviewFunctions = (today: IsoDate): DataviewFunctions => ({
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
