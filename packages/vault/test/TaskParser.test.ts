import { scanInlineFields, stripInlineFields } from "@kb/remark-obsidian"
import { assert, describe, it } from "@effect/vitest"
import { Chunk, Effect, Option } from "effect"
import { Markdown } from "../src/markdown/Markdown"
import { MarkdownParser } from "../src/markdown/MarkdownParser"
import { Task } from "../src/TaskModel"

const parseTasks = (markdown: string) =>
  Effect.gen(function* () {
    const file = yield* Markdown.parse(markdown)
    return Chunk.toReadonlyArray(Markdown.tasks(file)).flatMap((node) => {
      const task = Task.from(node)
      return Option.isSome(task) ? [task.value] : []
    })
  }).pipe(Effect.provide(MarkdownParser.layer))

const inlineFieldRecord = (lineText: string): Readonly<Record<string, string>> =>
  Object.fromEntries(scanInlineFields(lineText).map((field) => [field.key, field.value]))

describe("Task", () => {
  it.effect("parses #task checkboxes without source path wrapping", () =>
    Effect.gen(function* () {
      const tasks = yield* parseTasks(
        [
          "# Project",
          "- [ ] Open item #task #errand [scheduled:: 2026-05-23] [area:: [[Personal]]] [project:: [[Meal Planning]]]",
          "  - [x] Done item #task [completed:: 2026-05-23] [area:: [[Personal]]] [project:: [[Meal Planning]]]"
        ].join("\n")
      )

      assert.strictEqual(tasks.length, 2)
      assert.strictEqual(tasks[0]?.done, false)
      assert.strictEqual(tasks[0]?.text, "Open item")
      assert.deepStrictEqual(tasks[0]?.tags, ["#task", "#errand"])
      assert.strictEqual(tasks[0]?.scheduled, "2026-05-23")
      assert.strictEqual(tasks[1]?.text, "Done item")
      assert.strictEqual(tasks[1]?.done, true)
      assert.strictEqual(tasks[1]?.completed, "2026-05-23")
      assert.strictEqual("source" in tasks[0]!, false)
    })
  )

  it("extracts known and unknown fields through the inline field scanner", () => {
    const fields = inlineFieldRecord(
      "Grocery shopping #task [scheduled:: 2026-05-23] [due:: 2026-05-24] [completed:: 2026-05-25] [depends:: [[Meal Planning#^meal-planning-20260523]]] [repeat:: every week] [area:: [[Personal]]] [project:: [[Meal Planning]]] [energy:: low]"
    )

    assert.strictEqual(fields.scheduled, "2026-05-23")
    assert.strictEqual(fields.due, "2026-05-24")
    assert.strictEqual(fields.completed, "2026-05-25")
    assert.strictEqual(fields.depends, "[[Meal Planning#^meal-planning-20260523]]")
    assert.strictEqual(fields.repeat, "every week")
    assert.strictEqual(fields.area, "[[Personal]]")
    assert.strictEqual(fields.project, "[[Meal Planning]]")
    assert.strictEqual(fields.energy, "low")
    assert.strictEqual(
      stripInlineFields("Grocery shopping #task [area:: [[Personal]]] (priority:: high)"),
      "Grocery shopping #task"
    )
  })

  it.effect("preserves known and unknown fields on pathless tasks", () =>
    Effect.gen(function* () {
      const tasks = yield* parseTasks(
        "- [ ] Grocery shopping #task [scheduled:: 2026-05-23] [due:: 2026-05-24] [completed:: 2026-05-25] [depends:: [[Meal Planning#^meal-planning-20260523]]] [repeat:: every week] [area:: [[Personal]]] [project:: [[Meal Planning]]] [energy:: low]"
      )

      assert.strictEqual(tasks.length, 1)
      assert.strictEqual(tasks[0]?.scheduled, "2026-05-23")
      assert.strictEqual(tasks[0]?.due, "2026-05-24")
      assert.strictEqual(tasks[0]?.completed, "2026-05-25")
      assert.strictEqual(tasks[0]?.depends, "[[Meal Planning#^meal-planning-20260523]]")
      assert.strictEqual(tasks[0]?.repeat, "every week")
      assert.strictEqual(tasks[0]?.area, "[[Personal]]")
      assert.strictEqual(tasks[0]?.project, "[[Meal Planning]]")
      assert.strictEqual(tasks[0]?.fields.energy, "low")
      assert.strictEqual(tasks[0]?.unknownFields.energy, "low")
    })
  )

  it.effect("ignores non-task lines and non-#task checkboxes", () =>
    Effect.gen(function* () {
      const file = yield* Markdown.parse(
        [
          "- [ ] Plain checkbox",
          "not a task #task",
          "- [ ] Real task #task [area:: [[Personal]]] [project:: [[Home Chores]]]"
        ].join("\n")
      )
      const results = Chunk.toReadonlyArray(Markdown.tasks(file)).map(Task.from)
      const tasks = results.flatMap((task) => (Option.isSome(task) ? [task.value] : []))

      assert.strictEqual(results.length, 2)
      assert.strictEqual(tasks.length, 1)
      assert.strictEqual(tasks[0]?.text, "Real task")
    }).pipe(Effect.provide(MarkdownParser.layer))
  )

  it("extracts wikilink field values without stopping at nested brackets", () => {
    const fields = inlineFieldRecord("#task [depends:: [[Meal Planning#^anchor]]] [area:: [[Personal]]]")

    assert.strictEqual(fields.depends, "[[Meal Planning#^anchor]]")
    assert.strictEqual(fields.area, "[[Personal]]")
  })

  it.effect("derives nested AST task text without including child task fields", () =>
    Effect.gen(function* () {
      const tasks = yield* parseTasks(
        [
          "- [ ] Parent #task [area:: [[Work]]]",
          "  - [ ] Child #task [depends:: [[Parent#^anchor]]] [priority:: high]"
        ].join("\n")
      )

      assert.strictEqual(tasks.length, 2)
      assert.strictEqual(tasks[0]?.text, "Parent")
      assert.strictEqual(tasks[0]?.depends, undefined)
      assert.strictEqual(tasks[0]?.unknownFields.priority, undefined)
      assert.strictEqual(tasks[1]?.text, "Child")
      assert.strictEqual(tasks[1]?.depends, "[[Parent#^anchor]]")
      assert.strictEqual(tasks[1]?.unknownFields.priority, "high")
    })
  )

  it.effect("validates date fields before promoting them to known date properties", () =>
    Effect.gen(function* () {
      const tasks = yield* parseTasks(
        "- [ ] Bad dates #task [scheduled:: 2026-02-29] [due:: 2024-02-29] [completed:: 2026-13-01]"
      )

      assert.strictEqual(tasks.length, 1)
      assert.strictEqual(tasks[0]?.fields.scheduled, "2026-02-29")
      assert.strictEqual(tasks[0]?.scheduled, undefined)
      assert.strictEqual(tasks[0]?.fields.due, "2024-02-29")
      assert.strictEqual(tasks[0]?.due, "2024-02-29")
      assert.strictEqual(tasks[0]?.fields.completed, "2026-13-01")
      assert.strictEqual(tasks[0]?.completed, undefined)
    })
  )
})
