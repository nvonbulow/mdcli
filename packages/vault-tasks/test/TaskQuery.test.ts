import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { CalendarService } from "../src/index"

describe("CalendarService", () => {
  it.effect("returns the injected test date", () =>
    Effect.gen(function* () {
      const calendar = yield* CalendarService
      const today = yield* calendar.today()

      assert.strictEqual(today, "2026-05-23")
    }).pipe(Effect.provide(CalendarService.layerTest("2026-05-23")))
  )

  it.effect("adds days across month, year, and leap-day boundaries", () =>
    Effect.gen(function* () {
      const calendar = yield* CalendarService

      assert.strictEqual(yield* calendar.addDays("2026-05-23", 1), "2026-05-24")
      assert.strictEqual(yield* calendar.addDays("2026-03-01", -1), "2026-02-28")
      assert.strictEqual(yield* calendar.addDays("2024-02-28", 1), "2024-02-29")
      assert.strictEqual(yield* calendar.addDays("2026-12-31", 1), "2027-01-01")
    }).pipe(Effect.provide(CalendarService.layerTest("2026-05-23")))
  )

  it.effect("builds a window from a start date and day count", () =>
    Effect.gen(function* () {
      const calendar = yield* CalendarService
      const window = yield* calendar.window("2026-12-29", 7)

      assert.strictEqual(window.start, "2026-12-29")
      assert.strictEqual(window.end, "2027-01-04")
    }).pipe(Effect.provide(CalendarService.layerTest("2026-05-23")))
  )
})
