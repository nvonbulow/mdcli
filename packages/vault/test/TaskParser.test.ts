import { assert, describe, it } from "@effect/vitest"
import { Option } from "effect"
import { extractInlineFields, parseTaskLine, parseTasksFromMarkdown } from "../src/TaskParser"

describe("TaskParser", () => {
  it("parses open and completed task checkboxes with source locations", () => {
    const tasks = parseTasksFromMarkdown(
      [
        "# Project",
        "- [ ] Open item #task [scheduled:: 2026-05-23] [area:: [[Personal]]] [project:: [[Meal Planning]]]",
        "  - [x] Done item #task [completed:: 2026-05-23] [area:: [[Personal]]] [project:: [[Meal Planning]]]"
      ].join("\n"),
      "vault/30-Projects/Personal/Meal Planning.md"
    )

    assert.strictEqual(tasks.length, 2)
    assert.strictEqual(tasks[0]?.done, false)
    assert.strictEqual(tasks[0]?.text, "Open item")
    assert.strictEqual(tasks[0]?.source.path, "vault/30-Projects/Personal/Meal Planning.md")
    assert.strictEqual(tasks[0]?.source.lineNumber, 2)
    assert.strictEqual(tasks[1]?.done, true)
    assert.strictEqual(tasks[1]?.completed, "2026-05-23")
  })

  it("extracts required inline fields and preserves unknown fields", () => {
    const parsed = parseTaskLine(
      "- [ ] Grocery shopping #task [scheduled:: 2026-05-23] [due:: 2026-05-24] [completed:: 2026-05-25] [depends:: [[Meal Planning#^meal-planning-20260523]]] [repeat:: every week] [area:: [[Personal]]] [project:: [[Meal Planning]]] [energy:: low]",
      "vault/30-Projects/Personal/Meal Planning.md",
      7
    )

    assert.strictEqual(Option.isSome(parsed), true)
    if (Option.isSome(parsed)) {
      assert.strictEqual(parsed.value.scheduled, "2026-05-23")
      assert.strictEqual(parsed.value.due, "2026-05-24")
      assert.strictEqual(parsed.value.completed, "2026-05-25")
      assert.strictEqual(parsed.value.depends, "[[Meal Planning#^meal-planning-20260523]]")
      assert.strictEqual(parsed.value.repeat, "every week")
      assert.strictEqual(parsed.value.area, "[[Personal]]")
      assert.strictEqual(parsed.value.project, "[[Meal Planning]]")
      assert.strictEqual(parsed.value.unknownFields.energy, "low")
    }
  })

  it("ignores non-task lines and non-task checkboxes", () => {
    const tasks = parseTasksFromMarkdown(
      [
        "- [ ] Plain checkbox",
        "not a task #task",
        "- [ ] Real task #task [area:: [[Personal]]] [project:: [[Home Chores]]]"
      ].join("\n"),
      "vault/30-Projects/Personal/Home Chores.md"
    )

    assert.strictEqual(tasks.length, 1)
    assert.strictEqual(tasks[0]?.text, "Real task")
  })

  it("extracts wikilinks without stopping at nested brackets", () => {
    const fields = extractInlineFields("#task [depends:: [[Meal Planning#^anchor]]] [area:: [[Personal]]]")
    assert.strictEqual(fields.depends, "[[Meal Planning#^anchor]]")
    assert.strictEqual(fields.area, "[[Personal]]")
  })
})
