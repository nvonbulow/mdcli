import { scanInlineFields, stripInlineFields } from "@kb/remark-obsidian"
import { assert, describe, it } from "@effect/vitest"
import { Chunk, Effect } from "effect"
import { Markdown } from "../src/markdown/Markdown"
import { MarkdownParser } from "../src/markdown/MarkdownParser"
import { MarkdownFile } from "../src/markdown/MarkdownModel"
import { parsedTasksFromMarkdownFile } from "../src/TaskParser"

const parseTasks = (markdown: string, path: string) =>
  Effect.gen(function* () {
    const file = yield* Markdown.parse(markdown)
    return Chunk.toReadonlyArray(parsedTasksFromMarkdownFile(new MarkdownFile({ ...file, path })))
  }).pipe(Effect.provide(MarkdownParser.layer))

const inlineFieldRecord = (lineText: string): Readonly<Record<string, string>> =>
  Object.fromEntries(scanInlineFields(lineText).map((field) => [field.key, field.value]))

describe("TaskParser", () => {
  it.effect("parses #task checkboxes with AST source locations through layers", () =>
    Effect.gen(function* () {
      const tasks = yield* parseTasks(
        [
          "# Project",
          "- [ ] Open item #task #errand [scheduled:: 2026-05-23] [area:: [[Personal]]] [project:: [[Meal Planning]]]",
          "  - [x] Done item #task [completed:: 2026-05-23] [area:: [[Personal]]] [project:: [[Meal Planning]]]"
        ].join("\n"),
        "30-Projects/Personal/Meal Planning.md"
      )

      assert.strictEqual(tasks.length, 2)
      assert.strictEqual(tasks[0]?.done, false)
      assert.strictEqual(tasks[0]?.text, "Open item")
      assert.strictEqual(tasks[0]?.source.path, "30-Projects/Personal/Meal Planning.md")
      assert.strictEqual(tasks[0]?.source.lineNumber, 2)
      assert.strictEqual(tasks[1]?.text, "Done item")
      assert.strictEqual(tasks[1]?.source.lineNumber, 3)
      assert.deepStrictEqual(tasks[0]?.tags, ["#task", "#errand"])
      assert.strictEqual(tasks[1]?.done, true)
      assert.strictEqual(tasks[1]?.completed, "2026-05-23")
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

  it.effect("preserves known and unknown fields on parsed tasks", () =>
    Effect.gen(function* () {
      const tasks = yield* parseTasks(
        "- [ ] Grocery shopping #task [scheduled:: 2026-05-23] [due:: 2026-05-24] [completed:: 2026-05-25] [depends:: [[Meal Planning#^meal-planning-20260523]]] [repeat:: every week] [area:: [[Personal]]] [project:: [[Meal Planning]]] [energy:: low]",
        "30-Projects/Personal/Meal Planning.md"
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
      const tasks = yield* parseTasks(
        [
          "- [ ] Plain checkbox",
          "not a task #task",
          "- [ ] Real task #task [area:: [[Personal]]] [project:: [[Home Chores]]]"
        ].join("\n"),
        "30-Projects/Personal/Home Chores.md"
      )

      assert.strictEqual(tasks.length, 1)
      assert.strictEqual(tasks[0]?.text, "Real task")
    })
  )

  it("extracts wikilink field values without stopping at nested brackets", () => {
    const fields = inlineFieldRecord("#task [depends:: [[Meal Planning#^anchor]]] [area:: [[Personal]]]")

    assert.strictEqual(fields.depends, "[[Meal Planning#^anchor]]")
    assert.strictEqual(fields.area, "[[Personal]]")
  })

  it.effect("derives nested AST task lines without including child task text", () =>
    Effect.gen(function* () {
      const tasks = yield* parseTasks(
        [
          "- [ ] Parent #task [area:: [[Work]]]",
          "  - [ ] Child #task [depends:: [[Parent#^anchor]]] [priority:: high]"
        ].join("\n"),
        "30-Projects/Work/Nested.md"
      )

      assert.strictEqual(tasks.length, 2)
      assert.strictEqual(tasks[0]?.text, "Parent")
      assert.strictEqual(tasks[0]?.source.lineNumber, 1)
      assert.strictEqual(tasks[0]?.depends, undefined)
      assert.strictEqual(tasks[0]?.unknownFields.priority, undefined)
      assert.strictEqual(tasks[1]?.text, "Child")
      assert.strictEqual(tasks[1]?.source.lineNumber, 2)
      assert.strictEqual(tasks[1]?.depends, "[[Parent#^anchor]]")
      assert.strictEqual(tasks[1]?.unknownFields.priority, "high")
    })
  )
})
