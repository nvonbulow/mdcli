import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { IsoDate, WeekWindow } from "./TaskModel"

export type CalendarServiceShape = {
  readonly today: () => Effect.Effect<IsoDate>
  readonly addDays: (date: IsoDate, days: number) => Effect.Effect<IsoDate>
  readonly window: (start: IsoDate, days: number) => Effect.Effect<WeekWindow>
}

export class CalendarService extends Context.Service<CalendarService, CalendarServiceShape>()(
  "@kb/vault-core/CalendarService"
) {
  static readonly layerLive: Layer.Layer<CalendarService> = Layer.effect(
    CalendarService,
    makeCalendarService(Effect.map(Clock.currentTimeMillis, isoDateFromEpochMillis))
  )

  static readonly layerTest = (date: IsoDate): Layer.Layer<CalendarService> =>
    Layer.effect(CalendarService, makeCalendarService(Effect.succeed(date)))
}

const makeWindow = (start: IsoDate, days: number): WeekWindow =>
  new WeekWindow({ start, end: addDays(start, days - 1) })

function isoDateFromEpochMillis(millis: number): IsoDate {
  const days = Math.floor(millis / 86_400_000)
  return isoDateFromEpochDay(days)
}

const addDays = (date: IsoDate, days: number): IsoDate => {
  let year = Number(date.slice(0, 4))
  let month = Number(date.slice(5, 7))
  let day = Number(date.slice(8, 10)) + days

  while (day > daysInMonth(year, month)) {
    day -= daysInMonth(year, month)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }

  while (day < 1) {
    month -= 1
    if (month < 1) {
      month = 12
      year -= 1
    }
    day += daysInMonth(year, month)
  }

  return formatIsoDate(year, month, day)
}

function makeCalendarService(today: Effect.Effect<IsoDate>): Effect.Effect<CalendarServiceShape> {
  return Effect.sync(() =>
    CalendarService.of({
      today: Effect.fn("@kb/vault-core/CalendarService.today")(() => today),
      addDays: Effect.fn("@kb/vault-core/CalendarService.addDays")((date: IsoDate, days: number) =>
        Effect.succeed(addDays(date, days))
      ),
      window: Effect.fn("@kb/vault-core/CalendarService.window")((start: IsoDate, days: number) =>
        Effect.succeed(makeWindow(start, days))
      )
    })
  )
}

const isoDateFromEpochDay = (epochDay: number): IsoDate => {
  let day = epochDay
  let year = 1970

  if (day >= 0) {
    while (day >= daysInYear(year)) {
      day -= daysInYear(year)
      year += 1
    }
  } else {
    while (day < 0) {
      year -= 1
      day += daysInYear(year)
    }
  }

  let month = 1
  while (day >= daysInMonth(year, month)) {
    day -= daysInMonth(year, month)
    month += 1
  }

  return formatIsoDate(year, month, day + 1)
}

const formatIsoDate = (year: number, month: number, day: number): IsoDate =>
  `${pad4(year)}-${pad2(month)}-${pad2(day)}` as IsoDate

const pad2 = (value: number): string => (value < 10 ? `0${value}` : `${value}`)
const pad4 = (value: number): string => {
  if (value >= 1000) {
    return `${value}`
  }
  if (value >= 100) {
    return `0${value}`
  }
  if (value >= 10) {
    return `00${value}`
  }
  return `000${value}`
}

const daysInYear = (year: number): number => (isLeapYear(year) ? 366 : 365)
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
