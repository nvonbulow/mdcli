import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { InlineFieldParser } from "../src/InlineFieldParser"
import { TaskMarkdownParser } from "../src/TaskMarkdownParser"

const parserLayer = TaskMarkdownParser.layer

describe("TaskMarkdownParser", () => {
  it.effect("parses #task checkboxes with AST source locations through layers", () =>
    Effect.gen(function* () {
      const parser = yield* TaskMarkdownParser
      const tasks = yield* parser.parseFile(
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
    }).pipe(Effect.provide(parserLayer))
  )

  it.effect("extracts known and unknown fields through the inline parser layer", () =>
    Effect.gen(function* () {
      const inlineFields = yield* InlineFieldParser
      const fields = yield* inlineFields.parse(
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
      const stripped = yield* inlineFields.strip("Grocery shopping #task [area:: [[Personal]]] (priority:: high)")

      assert.strictEqual(stripped, "Grocery shopping #task")
    }).pipe(Effect.provide(InlineFieldParser.layerNoDeps))
  )

  it.effect("preserves known and unknown fields on parsed tasks", () =>
    Effect.gen(function* () {
      const parser = yield* TaskMarkdownParser
      const tasks = yield* parser.parseFile(
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
    }).pipe(Effect.provide(parserLayer))
  )

  it.effect("ignores non-task lines and non-#task checkboxes", () =>
    Effect.gen(function* () {
      const parser = yield* TaskMarkdownParser
      const tasks = yield* parser.parseFile(
        [
          "- [ ] Plain checkbox",
          "not a task #task",
          "- [ ] Real task #task [area:: [[Personal]]] [project:: [[Home Chores]]]"
        ].join("\n"),
        "30-Projects/Personal/Home Chores.md"
      )

      assert.strictEqual(tasks.length, 1)
      assert.strictEqual(tasks[0]?.text, "Real task")
    }).pipe(Effect.provide(parserLayer))
  )

  it.effect("extracts wikilink field values without stopping at nested brackets", () =>
    Effect.gen(function* () {
      const inlineFields = yield* InlineFieldParser
      const fields = yield* inlineFields.parse("#task [depends:: [[Meal Planning#^anchor]]] [area:: [[Personal]]]")

      assert.strictEqual(fields.depends, "[[Meal Planning#^anchor]]")
      assert.strictEqual(fields.area, "[[Personal]]")
    }).pipe(Effect.provide(InlineFieldParser.layerNoDeps))
  )

  it.effect("derives nested AST task lines without including child task text", () =>
    Effect.gen(function* () {
      const parser = yield* TaskMarkdownParser
      const tasks = yield* parser.parseFile(
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
    }).pipe(Effect.provide(parserLayer))
  )
})
