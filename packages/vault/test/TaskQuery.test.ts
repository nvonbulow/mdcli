import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { CalendarService } from "../src/CalendarService"
import { ParsedTask, TaskSource } from "../src/TaskModel"
import { TaskValidator } from "../src/TaskValidator"

const task = (overrides: Partial<ParsedTask>): ParsedTask =>
  new ParsedTask({
    done: false,
    text: "Task",
    source: new TaskSource({ path: "30-Projects/Test.md", lineNumber: 1 }),
    fields: {},
    unknownFields: {},
    tags: ["#task"],
    area: "[[Personal]]",
    project: "[[Test]]",
    ...overrides
  })

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

describe("TaskValidator", () => {
  it.effect("reports invalid task dates and missing active metadata", () =>
    Effect.gen(function* () {
      const validator = yield* TaskValidator
      const missing = new ParsedTask({
        done: false,
        text: "missing",
        source: new TaskSource({ path: "30-Projects/Test.md", lineNumber: 2 }),
        fields: {},
        unknownFields: {},
        tags: []
      })
      const invalid = task({ fields: { scheduled: "tomorrow", due: "2026-02-29", completed: "2026-5-23" } })
      const doneMissing = new ParsedTask({
        done: true,
        text: "done missing",
        source: new TaskSource({ path: "30-Projects/Test.md", lineNumber: 3 }),
        fields: {},
        unknownFields: {},
        tags: []
      })

      const problems = yield* validator.validate([missing, invalid, doneMissing])

      assert.deepStrictEqual(
        problems.map((problem) => problem.message),
        [
          "Open task is missing [area:: ...] metadata",
          "Open task is missing [project:: ...] metadata",
          "Invalid scheduled date: tomorrow",
          "Invalid due date: 2026-02-29",
          "Invalid completed date: 2026-5-23"
        ]
      )
    }).pipe(Effect.provide(TaskValidator.layerLive))
  )
})
