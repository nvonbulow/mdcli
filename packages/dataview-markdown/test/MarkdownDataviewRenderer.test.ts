import { assert, describe, it } from "@effect/vitest"
import {
  DataviewColumn,
  DataviewMetadata,
  DataviewProgram,
  DataviewRecord,
  DataviewRenderer,
  DataviewResult,
  DataviewRow
} from "@kb/dataview"
import { Effect, Layer } from "effect"
import { MarkdownDataviewRenderer, MarkdownFenceParser } from "../src"

const queryResult = DataviewResult.QueryResult({
  columns: [new DataviewColumn({ key: "task", label: "Task" })],
  rows: [
    new DataviewRow({
      record: new DataviewRecord({ fields: {}, original: undefined }),
      cells: { task: "A | B" }
    })
  ],
  groups: [],
  metadata: new DataviewMetadata({ query: "TASK", source: "Inbox" })
})

const dataviewProgramLayer = Layer.succeed(
  DataviewProgram,
  DataviewProgram.of({
    run: (queryText: string) =>
      Effect.gen(function* () {
        assert.strictEqual(queryText, "TASK\n")
        return queryResult
      })
  })
)

const markdownDocumentLayer = MarkdownDataviewRenderer.layerNoDeps.pipe(
  Layer.provide(Layer.mergeAll(MarkdownFenceParser.layerNoDeps, DataviewRenderer.layerMarkdown, dataviewProgramLayer))
)

describe("MarkdownFenceParser", () => {
  it.effect("splits dataview fences while preserving surrounding markdown and other fences", () =>
    Effect.gen(function* () {
      const parser = yield* MarkdownFenceParser
      const markdown = "Intro\n\n```js\nconst value = 1\n```\n\n```dataview\nTASK\n```\nTail"
      const parts = yield* parser.parse(markdown)

      assert.deepStrictEqual(parts, [
        { _tag: "Markdown", text: "Intro\n\n```js\nconst value = 1\n```\n\n" },
        { _tag: "DataviewFence", query: "TASK\n", raw: "```dataview\nTASK\n```\n", line: 7 },
        { _tag: "Markdown", text: "Tail" }
      ])
    }).pipe(Effect.provide(MarkdownFenceParser.layerNoDeps))
  )

  it.effect("fails unclosed dataview fences with block context", () =>
    Effect.gen(function* () {
      const parser = yield* MarkdownFenceParser
      const error = yield* Effect.flip(parser.parse("Intro\n```dataview\nTASK\n"))

      assert.strictEqual(error._tag, "MarkdownBlockRenderError")
      assert.strictEqual(error.message, "Unclosed dataview fence")
      assert.strictEqual(error.block, "```dataview\nTASK\n")
      assert.strictEqual(error.line, 2)
    }).pipe(Effect.provide(MarkdownFenceParser.layerNoDeps))
  )
})

describe("MarkdownDataviewRenderer", () => {
  it.effect("renders dataview fences through the dataview program and preserves markdown", () =>
    Effect.gen(function* () {
      const renderer = yield* MarkdownDataviewRenderer
      const rendered = yield* renderer.renderDocument("# Dashboard\n\n```dataview\nTASK\n```\nTail")

      assert.strictEqual(rendered, "# Dashboard\n\n| Task |\n| --- |\n| A \\| B |\nTail")
    }).pipe(Effect.provide(markdownDocumentLayer))
  )
})
