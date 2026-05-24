import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import {
  DataviewColumn,
  DataviewGroup,
  DataviewMetadata,
  DataviewProgram,
  DataviewRecord,
  DataviewRenderer,
  DataviewResult,
  DataviewRow,
  MarkdownDataviewRenderer,
  MarkdownFenceParser
} from "../src"

const baseRecord = new DataviewRecord({ fields: {}, original: undefined })

const result = DataviewResult.QueryResult({
  columns: [new DataviewColumn({ key: "task", label: "Task" }), new DataviewColumn({ key: "area", label: "Area" })],
  rows: [
    new DataviewRow({
      record: baseRecord,
      cells: { task: "A | B", area: "Line\nBreak" }
    }),
    new DataviewRow({
      record: baseRecord,
      cells: { task: "C", area: "Area" }
    })
  ],
  groups: [
    new DataviewGroup({ key: "Line\nBreak", label: "Line\nBreak", rowIndexes: [0] }),
    new DataviewGroup({ key: "Area", label: "Area", rowIndexes: [1] })
  ],
  metadata: new DataviewMetadata({ query: "TASK", source: "Inbox" })
})

const emptyResult = DataviewResult.QueryResult({
  columns: [],
  rows: [],
  groups: [],
  metadata: new DataviewMetadata({ query: "TASK", source: "Inbox" })
})

const fakeProgramLayer = Layer.succeed(
  DataviewProgram,
  DataviewProgram.of({
    run: (query) =>
      Effect.succeed(
        DataviewResult.QueryResult({
          columns: [new DataviewColumn({ key: "query", label: "Query" })],
          rows: [new DataviewRow({ record: baseRecord, cells: { query: query.trim() } })],
          groups: [],
          metadata: new DataviewMetadata({ query, source: "fake" })
        })
      )
  })
)

const fakeRendererLayer = Layer.succeed(
  DataviewRenderer,
  DataviewRenderer.of({
    render: (dataviewResult) =>
      Effect.succeed(dataviewResult._tag === "QueryResult" ? `[${dataviewResult.rows[0]?.cells.query ?? "empty"}]` : "")
  })
)

describe("DataviewRenderer", () => {
  it.effect("renders markdown through the service layer and escapes cells", () =>
    Effect.gen(function* () {
      const renderer = yield* DataviewRenderer
      const rendered = yield* renderer.render(result)

      assert.strictEqual(rendered, "| Task | Area |\n| --- | --- |\n| A \\| B | Line<br>Break |\n| C | Area |")
    }).pipe(Effect.provide(DataviewRenderer.layerMarkdown))
  )

  it.effect("renders json through the service layer including groups and metadata", () =>
    Effect.gen(function* () {
      const renderer = yield* DataviewRenderer
      const rendered = yield* renderer.render(result)
      const parsed = JSON.parse(rendered)

      assert.deepStrictEqual(parsed.rows, [
        { task: "A | B", area: "Line\nBreak" },
        { task: "C", area: "Area" }
      ])
      assert.deepStrictEqual(parsed.groups, [
        { key: "Line\nBreak", label: "Line\nBreak", rowIndexes: [0] },
        { key: "Area", label: "Area", rowIndexes: [1] }
      ])
      assert.deepStrictEqual(parsed.metadata, { query: "TASK", source: "Inbox" })
    }).pipe(Effect.provide(DataviewRenderer.layerJson))
  )

  it.effect("renders pretty and empty results through the service layer", () =>
    Effect.gen(function* () {
      const renderer = yield* DataviewRenderer
      const rendered = yield* renderer.render(result)
      const empty = yield* renderer.render(emptyResult)

      assert.strictEqual(rendered, "Task   Area      \n─────  ──────────\nA | B  Line Break\nC      Area      ")
      assert.strictEqual(empty, "No rows found.")
    }).pipe(Effect.provide(DataviewRenderer.layerPretty))
  )

  it.effect("renders empty markdown results through the service layer", () =>
    Effect.gen(function* () {
      const renderer = yield* DataviewRenderer
      const rendered = yield* renderer.render(emptyResult)

      assert.strictEqual(rendered, "No rows found.")
    }).pipe(Effect.provide(DataviewRenderer.layerMarkdown))
  )
})

describe("MarkdownFenceParser", () => {
  it.effect("extracts dataview fences and preserves surrounding markdown and other fences", () =>
    Effect.gen(function* () {
      const parser = yield* MarkdownFenceParser
      const parts = yield* parser.parse(
        'Before\n```dataview\nTASK\nFROM "Inbox"\n```\n```ts\nconst value = 1\n```\nAfter'
      )

      assert.deepStrictEqual(
        parts.map((part) => part._tag),
        ["Markdown", "DataviewFence", "Markdown"]
      )
      assert.strictEqual(parts[0]?._tag === "Markdown" ? parts[0].text : "", "Before\n")
      assert.strictEqual(parts[1]?._tag === "DataviewFence" ? parts[1].query : "", 'TASK\nFROM "Inbox"\n')
      assert.strictEqual(parts[2]?._tag === "Markdown" ? parts[2].text : "", "```ts\nconst value = 1\n```\nAfter")
    }).pipe(Effect.provide(MarkdownFenceParser.layerNoDeps))
  )

  it.effect("fails on an unclosed dataview fence", () =>
    Effect.gen(function* () {
      const parser = yield* MarkdownFenceParser
      const error = yield* parser.parse("Intro\n```dataview\nTASK").pipe(Effect.flip)

      assert.strictEqual(error.message, "Unclosed dataview fence")
      assert.strictEqual(error.line, 2)
    }).pipe(Effect.provide(MarkdownFenceParser.layerNoDeps))
  )
})

describe("MarkdownDataviewRenderer", () => {
  it.effect("replaces dataview fences and preserves non-dataview fences and markdown", () =>
    Effect.gen(function* () {
      const renderer = yield* MarkdownDataviewRenderer
      const rendered = yield* renderer.renderDocument(
        '# Title\n\n```dataview\nTASK\nFROM "Inbox"\n```\n\n```text\nunchanged\n```\nTail'
      )

      assert.strictEqual(rendered, '# Title\n\n[TASK\nFROM "Inbox"]\n\n```text\nunchanged\n```\nTail')
    }).pipe(
      Effect.provide(MarkdownDataviewRenderer.layerNoDeps),
      Effect.provide(Layer.mergeAll(MarkdownFenceParser.layerNoDeps, fakeProgramLayer, fakeRendererLayer))
    )
  )

  it.effect("propagates parser failures from service layers", () =>
    Effect.gen(function* () {
      const renderer = yield* MarkdownDataviewRenderer
      const error = yield* renderer.renderDocument("```dataview\nTASK").pipe(Effect.flip)

      assert.strictEqual(error.message, "Unclosed dataview fence")
    }).pipe(
      Effect.provide(MarkdownDataviewRenderer.layerNoDeps),
      Effect.provide(Layer.mergeAll(MarkdownFenceParser.layerNoDeps, fakeProgramLayer, fakeRendererLayer))
    )
  )
})
