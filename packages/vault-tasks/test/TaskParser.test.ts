import { assert, describe, it } from "@effect/vitest"
import { MarkdownProcessor } from "@kb/markdown-ast"
import { Markdown, MarkdownParser } from "@kb/vault-core"
import { Chunk, Effect, Layer, Option } from "effect"
import { Task } from "../src/index"

const parserLayer = Layer.mergeAll(MarkdownParser.layer, MarkdownProcessor.layer)

const parseTasks = (markdown: string) =>
  Effect.gen(function* () {
    const file = yield* Markdown.parse(markdown)
    const results = yield* Effect.forEach(Chunk.toReadonlyArray(Markdown.tasks(file)), Task.from)
    return results.flatMap((task) => (Option.isSome(task) ? [task.value] : []))
  }).pipe(Effect.provide(parserLayer))


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
      assert.strictEqual(tasks[0]?.source, undefined)
    })
  )

  it.effect("extracts known and unknown fields through markdown ast helpers", () =>
    Effect.gen(function* () {
      const tasks = yield* parseTasks(
        "- [ ] Grocery shopping #task [scheduled:: 2026-05-23] [due:: 2026-05-24] [completed:: 2026-05-25] [depends:: [[Meal Planning#^meal-planning-20260523]]] [repeat:: every week] [area:: [[Personal]]] [project:: [[Meal Planning]]] [energy:: low]"
      )

      assert.strictEqual(tasks[0]?.fields.scheduled, "2026-05-23")
      assert.strictEqual(tasks[0]?.fields.due, "2026-05-24")
      assert.strictEqual(tasks[0]?.fields.completed, "2026-05-25")
      assert.strictEqual(tasks[0]?.fields.depends, "[[Meal Planning#^meal-planning-20260523]]")
      assert.strictEqual(tasks[0]?.fields.repeat, "every week")
      assert.strictEqual(tasks[0]?.fields.area, "[[Personal]]")
      assert.strictEqual(tasks[0]?.fields.project, "[[Meal Planning]]")
      assert.strictEqual(tasks[0]?.fields.energy, "low")
      assert.strictEqual(tasks[0]?.text, "Grocery shopping")
    })
  )

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
      const results = yield* Effect.forEach(Chunk.toReadonlyArray(Markdown.tasks(file)), Task.from)
      const tasks = results.flatMap((task) => (Option.isSome(task) ? [task.value] : []))

      assert.strictEqual(results.length, 2)
      assert.strictEqual(tasks.length, 1)
      assert.strictEqual(tasks[0]?.text, "Real task")
    }).pipe(Effect.provide(parserLayer))
  )

  it.effect("extracts wikilink field values without stopping at nested brackets", () =>
    Effect.gen(function* () {
      const tasks = yield* parseTasks("- [ ] Nested #task [depends:: [[Meal Planning#^anchor]]] [area:: [[Personal]]]")

      assert.strictEqual(tasks[0]?.depends, "[[Meal Planning#^anchor]]")
      assert.strictEqual(tasks[0]?.area, "[[Personal]]")
    })
  )

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
