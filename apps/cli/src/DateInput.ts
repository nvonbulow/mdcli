import { Effect, Option } from "effect"
import { CalendarService, type IsoDate } from "@kb/vault-core"

const relativeDatePattern = /^([+-])(\d+)d$/
const acceptedDateSyntax = "YYYY-MM-DD, today, tomorrow, yesterday, +Nd, or -Nd"

const isIsoDate = (value: string): value is IsoDate => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

const daysInMonth = (year: number, month: number): number => {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28
    case 4:
    case 6:
    case 9:
    case 11:
      return 30
    default:
      return 31
  }
}

const isLeapYear = (year: number): boolean => year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0)

export const resolveDateInput = Effect.fn(function* (date: Option.Option<string>, flagName: string) {
  const calendar = yield* CalendarService
  const today = yield* calendar.today()

  if (Option.isNone(date)) {
    return today
  }

  return yield* parseDateInput(date.value, today).pipe(
    Effect.mapError(() => new Error(`--${flagName} must be ${acceptedDateSyntax}`))
  )
})

export const parseDateInput = Effect.fn(function* (input: string, today: IsoDate) {
  if (isIsoDate(input)) {
    return input
  }

  const calendar = yield* CalendarService

  switch (input) {
    case "today":
      return today
    case "tomorrow":
      return yield* calendar.addDays(today, 1)
    case "yesterday":
      return yield* calendar.addDays(today, -1)
  }

  const relative = relativeDatePattern.exec(input)
  if (relative === null) {
    return yield* Effect.fail(new InvalidInputError({ input }))
  }

  const sign = relative[1] ?? "+"
  const days = Number(relative[2] ?? "0")
  return yield* calendar.addDays(today, sign === "-" ? -days : days)
})

export class InvalidInputError extends Error {
  readonly _tag = "InvalidInputError"
  constructor(readonly options: { readonly input: string }) {
    super(`Invalid date input: ${options.input}`)
  }
}
