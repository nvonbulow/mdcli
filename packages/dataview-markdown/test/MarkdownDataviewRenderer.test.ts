import { assert, describe, it } from "@effect/vitest"
import {
  DataviewColumn,
  DataviewMetadata,
  DataviewParseError,
  DataviewProgram,
  DataviewRecord,
  DataviewResult,
  DataviewRow
} from "@kb/dataview"
import { MarkdownProcessor } from "@kb/markdown-ast"
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
        assert.strictEqual(queryText, "TASK")
        return queryResult
      })
  })
)

const makeMarkdownDocumentLayer = (programLayer: Layer.Layer<DataviewProgram>) =>
  MarkdownDataviewRenderer.layerNoDeps.pipe(Layer.provide(Layer.mergeAll(MarkdownProcessor.layer, programLayer)))

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
  it.effect("replaces dataview fences with markdown tables and preserves surrounding markdown", () =>
    Effect.gen(function* () {
      const renderer = yield* MarkdownDataviewRenderer
      const rendered = yield* renderer.renderDocument(
        "# Dashboard\n\n```js\nconst value = 1\n```\n\n```dataview\nTASK\n```\n\nTail"
      )

      assert.match(rendered, /^# Dashboard/m)
      assert.match(rendered, /```js\nconst value = 1\n```/)
      assert.match(rendered, /\| Task\s*\|/)
      assert.match(rendered, /\|\s*-{3,}\s*\|/)
      assert.match(rendered, /\| A \\\| B\s*\|/)
      assert.match(rendered, /Tail/)
      assert.ok(!rendered.includes("```dataview"))
      assert.ok(!rendered.includes("TASK\n```"))
    }).pipe(Effect.provide(makeMarkdownDocumentLayer(dataviewProgramLayer)))
  )

  it.effect("propagates dataview program errors", () =>
    Effect.gen(function* () {
      const renderer = yield* MarkdownDataviewRenderer
      const error = yield* Effect.flip(renderer.renderDocument("```dataview\nBROKEN\n```"))

      assert.strictEqual(error._tag, "ParseError")
      if (error._tag === "ParseError") {
        assert.strictEqual(error.message, "Invalid query")
        assert.strictEqual(error.input, "BROKEN")
        assert.strictEqual(error.line, 1)
      }
    }).pipe(
      Effect.provide(
        makeMarkdownDocumentLayer(
          Layer.succeed(
            DataviewProgram,
            DataviewProgram.of({
              run: (queryText: string) =>
                Effect.fail(new DataviewParseError({ input: queryText, message: "Invalid query", line: 1 }))
            })
          )
        )
      )
    )
  )
})
