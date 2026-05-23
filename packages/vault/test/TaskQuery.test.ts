import { assert, describe, it } from "@effect/vitest"
import { ParsedTask, TaskSource } from "../src/TaskModel"
import {
  addDays,
  dueTasks,
  repeatingTasks,
  sortTasks,
  todayTasks,
  validateTasks,
  weekTasks,
  weekWindow
} from "../src/TaskQuery"
import { isIsoDate } from "../src/TaskParser"

const task = (overrides: Partial<ParsedTask>): ParsedTask =>
  new ParsedTask({
    done: false,
    text: "Task",
    source: new TaskSource({ path: "vault/30-Projects/Test.md", lineNumber: 1 }),
    fields: {},
    unknownFields: {},
    tags: ["#task"],
    area: "[[Personal]]",
    project: "[[Test]]",
    ...overrides
  })

describe("TaskQuery", () => {
  it("filters today tasks by scheduled or due and excludes completed tasks", () => {
    const scheduled = task({ text: "scheduled", scheduled: "2026-05-23" })
    const due = task({ text: "due", due: "2026-05-23" })
    const done = task({ done: true, text: "done", scheduled: "2026-05-23" })
    const future = task({ text: "future", scheduled: "2026-05-24" })

    assert.deepStrictEqual(
      todayTasks([future, done, due, scheduled], "2026-05-23").map((item) => item.text),
      ["due", "scheduled"]
    )
  })

  it("filters week tasks by inclusive seven-day start/end range", () => {
    const start = task({ text: "start", scheduled: "2026-05-23" })
    const end = task({ text: "end", due: "2026-05-29" })
    const later = task({ text: "later", scheduled: "2026-05-31" })

    const window = weekWindow("2026-05-23")
    assert.strictEqual(window.start, "2026-05-23")
    assert.strictEqual(window.end, "2026-05-29")
    assert.deepStrictEqual(
      weekTasks([later, end, start], "2026-05-23").map((item) => item.text),
      ["end", "start"]
    )
  })

  it("filters due tasks on or before a date", () => {
    const overdue = task({ text: "overdue", due: "2026-05-22" })
    const due = task({ text: "due", due: "2026-05-23" })
    const later = task({ text: "later", due: "2026-05-24" })

    assert.deepStrictEqual(
      dueTasks([later, due, overdue], "2026-05-23").map((item) => item.text),
      ["overdue", "due"]
    )
  })
  it("adds days across month, year, and leap-day boundaries", () => {
    assert.strictEqual(addDays("2026-05-23", 1), "2026-05-24")
    assert.strictEqual(addDays("2026-03-01", -1), "2026-02-28")
    assert.strictEqual(addDays("2024-02-28", 1), "2024-02-29")
    assert.strictEqual(addDays("2026-12-31", 1), "2027-01-01")
  })

  it("rejects invalid ISO calendar dates", () => {
    assert.strictEqual(isIsoDate("2026-02-29"), false)
    assert.strictEqual(isIsoDate("2024-02-29"), true)
    assert.strictEqual(isIsoDate("tomorrow"), false)
    assert.strictEqual(isIsoDate("2026-5-23"), false)
  })

  it("sorts deterministically with missing dates last", () => {
    const undated = task({ text: "undated", source: new TaskSource({ path: "b.md", lineNumber: 1 }) })
    const scheduled = task({
      text: "scheduled",
      scheduled: "2026-05-24",
      source: new TaskSource({ path: "a.md", lineNumber: 2 })
    })
    const due = task({ text: "due", due: "2026-05-23", source: new TaskSource({ path: "c.md", lineNumber: 3 }) })

    assert.deepStrictEqual(
      sortTasks([undated, scheduled, due]).map((item) => item.text),
      ["due", "scheduled", "undated"]
    )
  })

  it("returns repeating tasks", () => {
    const repeat = task({ text: "repeat", repeat: "every 2 weeks", scheduled: "2026-05-27" })
    const normal = task({ text: "normal" })

    assert.deepStrictEqual(
      repeatingTasks([normal, repeat]).map((item) => item.text),
      ["repeat"]
    )
  })

  it("validates active task metadata and malformed dates", () => {
    const missing = new ParsedTask({
      done: false,
      text: "missing",
      source: new TaskSource({ path: "vault/30-Projects/Test.md", lineNumber: 2 }),
      fields: {},
      unknownFields: {},
      tags: []
    })
    const invalid = task({ fields: { scheduled: "tomorrow" } })
    const doneMissing = new ParsedTask({
      done: true,
      text: "done missing",
      source: new TaskSource({ path: "vault/30-Projects/Test.md", lineNumber: 3 }),
      fields: {},
      unknownFields: {},
      tags: []
    })

    const problems = validateTasks([missing, invalid, doneMissing])
    assert.deepStrictEqual(
      problems.map((problem) => problem.message),
      [
        "Open task is missing [area:: ...] metadata",
        "Open task is missing [project:: ...] metadata",
        "Invalid scheduled date: tomorrow"
      ]
    )
  })
})
