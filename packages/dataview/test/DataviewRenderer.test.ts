import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import {
  DataviewColumn,
  DataviewGroup,
  DataviewMetadata,
  DataviewRecord,
  DataviewRenderer,
  DataviewResult,
  DataviewRow
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

