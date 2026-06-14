import { assert, describe, it } from "@effect/vitest"
import { MarkdownProcessor } from "@kb/markdown-ast"
import { MarkdownParser, MarkdownModel } from "@kb/vault-core"
import { Chunk, Effect, Layer } from "effect"
import {
  CalendarService,
  RecurrenceExpansionWindow,
  TaskRecurrenceService,
  taskRecordsForFile,
  type VaultTaskRecord
} from "../src/index"

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

const recurrenceLayer = Layer.mergeAll(TaskRecurrenceService.layerNoDeps, MarkdownParser.layer, MarkdownProcessor.layer)

const recordFromMarkdown = (markdown: string): Effect.Effect<VaultTaskRecord, unknown, MarkdownParser | MarkdownProcessor> =>
  Effect.gen(function* () {
    const parser = yield* MarkdownParser
    const parsed = yield* parser.parse(markdown)
    const file = new MarkdownModel.MarkdownFile({ path: "Tasks.md", contents: parsed.contents, mdast: parsed.mdast })
    const records = yield* taskRecordsForFile("Tasks.md", file)
    const record = Chunk.toReadonlyArray(records)[0]
    assert.ok(record)
    return record
  })

const expand = (
  markdown: string,
  window: RecurrenceExpansionWindow
): Effect.Effect<ReadonlyArray<VaultTaskRecord>, unknown, TaskRecurrenceService | MarkdownParser | MarkdownProcessor> =>
  Effect.gen(function* () {
    const recurrence = yield* TaskRecurrenceService
    const record = yield* recordFromMarkdown(markdown)
    const expanded = yield* recurrence.expandRecord(record, window)
    return Chunk.toReadonlyArray(expanded)
  })

describe("TaskRecurrenceService", () => {
  it.effect("generates weekly due-only occurrences inside a bounded window", () =>
    Effect.gen(function* () {
      const records = yield* expand(
        "- [ ] Water plants #task [due:: 2026-06-01] [repeat:: every week]",
        new RecurrenceExpansionWindow({ start: "2026-06-14", end: "2026-06-20", mode: "all-in-window" })
      )

      assert.deepStrictEqual(
        records.map((record) => record.task.due),
        ["2026-06-01", "2026-06-15"]
      )
    }).pipe(Effect.provide(recurrenceLayer))
  )

  it.effect("preserves the scheduled-to-due offset when both dates participate", () =>
    Effect.gen(function* () {
      const records = yield* expand(
        "- [ ] Prep report #task [scheduled:: 2026-06-01] [due:: 2026-06-08] [repeat:: every week]",
        new RecurrenceExpansionWindow({ start: "2026-06-15", end: "2026-06-21", mode: "all-in-window" })
      )

      assert.deepStrictEqual(
        records.map((record) => [record.task.scheduled, record.task.due]),
        [
          ["2026-06-01", "2026-06-08"],
          ["2026-06-15", "2026-06-22"]
        ]
      )
    }).pipe(Effect.provide(recurrenceLayer))
  )

  it.effect("uses rrule text parsing for every 2 weeks", () =>
    Effect.gen(function* () {
      const records = yield* expand(
        "- [ ] Water plants #task [due:: 2026-06-01] [repeat:: every 2 weeks]",
        new RecurrenceExpansionWindow({ start: "2026-06-14", end: "2026-06-30", mode: "all-in-window" })
      )

      assert.deepStrictEqual(
        records.map((record) => record.task.due),
        ["2026-06-01", "2026-06-15", "2026-06-29"]
      )
    }).pipe(Effect.provide(recurrenceLayer))
  )

  it.effect("preserves repeatFrom completion as string metadata without changing expansion behavior", () =>
    Effect.gen(function* () {
      const records = yield* expand(
        "- [ ] Water plants #task [due:: 2026-06-01] [repeat:: every week] [repeatFrom:: completion]",
        new RecurrenceExpansionWindow({ start: "2026-06-14", end: "2026-06-20", mode: "all-in-window" })
      )

      assert.deepStrictEqual(
        records.map((record) => [record.task.due, record.task.repeatFrom, record.fields.repeatFrom]),
        [
          ["2026-06-01", "completion", "completion"],
          ["2026-06-15", "completion", "completion"]
        ]
      )
    }).pipe(Effect.provide(recurrenceLayer))
  )

  it.effect("leaves unsupported when-done repeat text unexpanded without failing", () =>
    Effect.gen(function* () {
      const records = yield* expand(
        "- [ ] Water plants #task [due:: 2026-06-01] [repeat:: every week when done]",
        new RecurrenceExpansionWindow({ start: "2026-06-14", end: "2026-06-20", mode: "all-in-window" })
      )

      assert.deepStrictEqual(
        records.map((record) => record.task.due),
        ["2026-06-01"]
      )
    }).pipe(Effect.provide(recurrenceLayer))
  )

  it.effect("does not generate virtual rows for completed repeating source rows", () =>
    Effect.gen(function* () {
      const records = yield* expand(
        "- [x] Water plants #task [completed:: 2026-06-01] [due:: 2026-06-01] [repeat:: every week] [repeatFrom:: completion]",
        new RecurrenceExpansionWindow({ start: "2026-06-14", end: "2026-06-20", mode: "all-in-window" })
      )

      assert.strictEqual(records.length, 1)
      assert.strictEqual(records[0]?.task.done, true)
      assert.strictEqual(records[0]?.task.due, "2026-06-01")
    }).pipe(Effect.provide(recurrenceLayer))
  )

  it.effect("projects overdue recurrence to only the latest occurrence on or before the cutoff", () =>
    Effect.gen(function* () {
      const records = yield* expand(
        "- [ ] Water plants #task [due:: 2026-06-01] [repeat:: every week]",
        new RecurrenceExpansionWindow({ start: "2026-06-14", end: "2026-06-14", mode: "latest-on-or-before" })
      )

      assert.deepStrictEqual(
        records.map((record) => record.task.due),
        ["2026-06-08"]
      )
    }).pipe(Effect.provide(recurrenceLayer))
  )
})
