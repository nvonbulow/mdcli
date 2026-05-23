import { assert, describe, it } from "@effect/vitest"
import { DashboardRenderOptions } from "../src/DashboardModel"
import { ParsedTask, TaskSource } from "../src/TaskModel"
import { renderDashboard, renderOpenDashboard, renderTodayDashboard, renderWeekDashboard } from "../src/DashboardRender"

const source = (lineNumber: number): TaskSource =>
  new TaskSource({
    path: "vault/30-Projects/Personal/Test.md",
    lineNumber
  })

const task = (text: string, lineNumber: number, overrides: Partial<ParsedTask> = {}): ParsedTask =>
  new ParsedTask({
    done: false,
    text,
    source: source(lineNumber),
    fields: {},
    unknownFields: {},
    tags: ["#task"],
    area: "[[Personal]]",
    project: "[[Test Project]]",
    ...overrides
  })

describe("DashboardRender", () => {
  it("renders today dashboard from matching scheduled and due tasks", () => {
    const output = renderTodayDashboard(
      [
        task("scheduled today", 1, { scheduled: "2026-05-23" }),
        task("due today", 2, { due: "2026-05-23" }),
        task("tomorrow", 3, { scheduled: "2026-05-24" })
      ],
      "2026-05-23"
    )

    assert.strictEqual(output.includes("# Today — 2026-05-23"), true)
    assert.strictEqual(output.includes("scheduled today"), true)
    assert.strictEqual(output.includes("due today"), true)
    assert.strictEqual(output.includes("tomorrow"), false)
  })

  it("renders week dashboard for a seven-day window", () => {
    const output = renderWeekDashboard(
      [
        task("inside", 1, { scheduled: "2026-05-29" }),
        task("Dad's birthday", 2, { scheduled: "2026-05-31", due: "2026-05-31" })
      ],
      "2026-05-23"
    )

    assert.strictEqual(output.includes("# This Week — 2026-05-23 through 2026-05-29"), true)
    assert.strictEqual(output.includes("inside"), true)
    assert.strictEqual(output.includes("Dad's birthday"), false)
  })

  it("renders open dashboard count from open tasks", () => {
    const output = renderOpenDashboard([task("open one", 1), task("open two", 2), task("done", 3, { done: true })])

    assert.strictEqual(output.includes("2 open tasks."), true)
    assert.strictEqual(output.includes("open one"), true)
    assert.strictEqual(output.includes("open two"), true)
    assert.strictEqual(output.includes("done"), false)
  })

  it("does not emit source-of-truth checkbox task syntax", () => {
    const output = renderDashboard(
      [task("open one", 1, { scheduled: "2026-05-23" })],
      new DashboardRenderOptions({ name: "today", date: "2026-05-23" })
    )

    assert.strictEqual(output.includes("- [ ]"), false)
    assert.strictEqual(output.includes("#task"), false)
  })
})
