import { Clock, Effect, Option } from "effect"
import { addDays, isoDateFromEpochMillis, isIsoDate, type IsoDate } from "@kb/vault"

const relativeDatePattern = /^([+-])(\d+)d$/
const acceptedDateSyntax = "YYYY-MM-DD, today, tomorrow, yesterday, +Nd, or -Nd"

export const resolveDateInput = Effect.fn(function* (date: Option.Option<string>, flagName: string) {
  const millis = yield* Clock.currentTimeMillis
  const today = isoDateFromEpochMillis(millis)

  if (Option.isNone(date)) {
    return today
  }

  return yield* parseDateInput(date.value, today).pipe(
    Effect.mapError(() => new Error(`--${flagName} must be ${acceptedDateSyntax}`))
  )
})

export const parseDateInput = (input: string, today: IsoDate): Effect.Effect<IsoDate, InvalidInputError> => {
  if (isIsoDate(input)) {
    return Effect.succeed(input)
  }

  switch (input) {
    case "today":
      return Effect.succeed(today)
    case "tomorrow":
      return Effect.succeed(addDays(today, 1))
    case "yesterday":
      return Effect.succeed(addDays(today, -1))
  }

  const relative = relativeDatePattern.exec(input)
  if (relative === null) {
    return Effect.fail(new InvalidInputError({ input }))
  }

  const sign = relative[1] ?? "+"
  const days = Number(relative[2] ?? "0")
  return Effect.succeed(addDays(today, sign === "-" ? -days : days))
}

export class InvalidInputError extends Error {
  readonly _tag = "InvalidInputError"
  constructor(readonly options: { readonly input: string }) {
    super(`Invalid date input: ${options.input}`)
  }
}
