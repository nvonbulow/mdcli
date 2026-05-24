import { Effect, Option } from "effect"
import { CalendarService, isIsoDate, type IsoDate } from "@kb/vault"

const relativeDatePattern = /^([+-])(\d+)d$/
const acceptedDateSyntax = "YYYY-MM-DD, today, tomorrow, yesterday, +Nd, or -Nd"

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
