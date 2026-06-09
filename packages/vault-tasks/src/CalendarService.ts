import * as DateTime from "effect/DateTime"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Layer from "effect/Layer"
import { IsoDate, WeekWindow } from "./TaskModel"

export interface CalendarService {
  readonly today: () => Effect.Effect<IsoDate>
  readonly addDays: (date: IsoDate, days: number) => Effect.Effect<IsoDate>
  readonly window: (start: IsoDate, days: number) => Effect.Effect<WeekWindow>
}

export class CalendarService extends Context.Service<CalendarService, CalendarService>()(
  "@kb/vault-tasks/CalendarService"
) {
  static readonly layerLive: Layer.Layer<CalendarService> = Layer.effect(
    CalendarService,
    makeCalendarService(Effect.map(DateTime.now, formatIsoDate))
  )

  static readonly layerTest = (date: IsoDate): Layer.Layer<CalendarService> =>
    Layer.effect(CalendarService, makeCalendarService(Effect.succeed(date)))
}

const makeWindow = (start: IsoDate, days: number): WeekWindow =>
  new WeekWindow({ start, end: addDays(start, days - 1) })

function formatIsoDate(dateTime: DateTime.DateTime): IsoDate {
  return DateTime.formatIsoDateUtc(dateTime) as IsoDate
}

const addDays = (date: IsoDate, days: number): IsoDate =>
  Option.match(DateTime.make(date), {
    onNone: () => date,
    onSome: (dateTime) => formatIsoDate(DateTime.add(dateTime, { days }))
  })

function makeCalendarService(today: Effect.Effect<IsoDate>): Effect.Effect<CalendarService> {
  return Effect.sync(() =>
    CalendarService.of({
      today: Effect.fn("@kb/vault-tasks/CalendarService.today")(() => today),
      addDays: Effect.fn("@kb/vault-tasks/CalendarService.addDays")((date: IsoDate, days: number) =>
        Effect.succeed(addDays(date, days))
      ),
      window: Effect.fn("@kb/vault-tasks/CalendarService.window")((start: IsoDate, days: number) =>
        Effect.succeed(makeWindow(start, days))
      )
    } as unknown as CalendarService)
  )
}

