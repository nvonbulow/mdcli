import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { ParsedTask, TaskSource, type IsoDate } from "@kb/vault"
import { dataviewFunctions, DataviewEngine, layer, recordsFromResult, taskRecord, tasksFromRecords } from "../src"

const source = (lineNumber: number, path = "vault/30-Projects/Test.md"): TaskSource =>
  new TaskSource({ path, lineNumber })

const task = (text: string, lineNumber: number, overrides: Partial<ParsedTask> = {}): ParsedTask =>
  new ParsedTask({
    done: false,
    text,
    source: source(lineNumber),
    fields: {},
    unknownFields: {},
    tags: ["#task"],
    area: "[[Personal]]",
    project: "[[Test]]",
    ...overrides
  })

const runQuery = (query: string, tasks: ReadonlyArray<ParsedTask>, today: IsoDate = "2026-05-23") =>
  Effect.runSync(
    Effect.gen(function* () {
      const engine = yield* DataviewEngine
      return yield* engine.run(query, tasks.map(taskRecord), { functions: dataviewFunctions(today) })
    }).pipe(Effect.provide(layer))
  )

describe("DataviewEngine", () => {
  it("runs the scheduled-or-due-today dashboard query without filter-specific parser logic", () => {
    const query = `TASK
FROM "30-Projects"
WHERE !completed AND contains(tags, "#task")
WHERE scheduled = date(today) OR due = date(today)
SORT due ASC, scheduled ASC, file.link ASC`

    const result = runQuery(query, [
      task("scheduled", 1, { fields: { scheduled: "2026-05-23" }, scheduled: "2026-05-23" }),
      task("due", 2, { fields: { due: "2026-05-23" }, due: "2026-05-23" }),
      task("done", 3, { done: true, fields: { scheduled: "2026-05-23" }, scheduled: "2026-05-23" }),
      task("future", 4, { fields: { scheduled: "2026-05-24" }, scheduled: "2026-05-24" })
    ])

    assert.deepStrictEqual(
      tasksFromRecords(recordsFromResult(result)).map((item) => item.text),
      ["due", "scheduled"]
    )
  })

  it("runs the scheduled-or-due-week dashboard query with generic comparisons", () => {
    const query = `TASK
FROM "30-Projects"
WHERE !completed AND contains(tags, "#task")
WHERE (scheduled >= date(2026-05-23) AND scheduled <= date(2026-05-29)) OR (due >= date(2026-05-23) AND due <= date(2026-05-29))
SORT due ASC, scheduled ASC, file.link ASC`

    const result = runQuery(query, [
      task("inside", 1, { fields: { scheduled: "2026-05-29" }, scheduled: "2026-05-29" }),
      task("outside", 2, {
        fields: { scheduled: "2026-05-31", due: "2026-05-31" },
        scheduled: "2026-05-31",
        due: "2026-05-31"
      })
    ])

    assert.deepStrictEqual(
      tasksFromRecords(recordsFromResult(result)).map((item) => item.text),
      ["inside"]
    )
  })

  it("runs the all-open-tasks dashboard query with dynamic grouping", () => {
    const query = `TASK
FROM "30-Projects"
WHERE !completed AND contains(tags, "#task")
GROUP BY area
SORT file.link ASC, due ASC, scheduled ASC`

    const result = runQuery(query, [
      task("personal", 1, { area: "[[Personal]]", fields: { area: "[[Personal]]" } }),
      task("work", 2, {
        area: "[[Work]]",
        fields: { area: "[[Work]]" },
        source: source(2, "vault/30-Projects/Work.md")
      }),
      task("done", 3, { done: true, area: "[[Work]]", fields: { area: "[[Work]]" } })
    ])

    assert.deepStrictEqual(
      tasksFromRecords(recordsFromResult(result)).map((item) => item.text),
      ["personal", "work"]
    )
    assert.strictEqual(result._tag, "QueryResult")
    if (result._tag === "QueryResult") {
      assert.deepStrictEqual(
        result.groups.map((group) => group.key),
        ["[[Personal]]", "[[Work]]"]
      )
    }
  })
})
