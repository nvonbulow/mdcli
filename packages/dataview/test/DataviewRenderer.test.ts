import { assert, describe, it } from "@effect/vitest"
import {
  DataviewColumn,
  DataviewMetadata,
  DataviewRecord,
  DataviewResult,
  DataviewRow,
  renderJson,
  renderMarkdownTable,
  renderPrettyTable
} from "../src"

const result = DataviewResult.QueryResult({
  columns: [new DataviewColumn({ key: "task", label: "Task" }), new DataviewColumn({ key: "area", label: "Area" })],
  rows: [
    new DataviewRow({
      record: new DataviewRecord({ fields: {}, original: undefined }),
      cells: { task: "A | B", area: "Line\nBreak" }
    })
  ],
  groups: [],
  metadata: new DataviewMetadata({ query: "TASK", source: undefined })
})

describe("DataviewRenderer", () => {
  it("escapes markdown table cells", () => {
    assert.strictEqual(renderMarkdownTable(result), "| Task | Area |\n| --- | --- |\n| A \\| B | Line<br>Break |")
  })

  it("renders json envelope without record originals", () => {
    const parsed = JSON.parse(renderJson(result))
    assert.deepStrictEqual(parsed.rows, [{ task: "A | B", area: "Line\nBreak" }])
    assert.deepStrictEqual(
      parsed.columns.map((column: { key: string }) => column.key),
      ["task", "area"]
    )
  })

  it("aligns pretty table columns", () => {
    assert.strictEqual(renderPrettyTable(result), "Task   Area      \n─────  ──────────\nA | B  Line Break")
  })

  it("renders empty pretty result", () => {
    const empty = DataviewResult.QueryResult({
      columns: [],
      rows: [],
      groups: [],
      metadata: new DataviewMetadata({ query: "TASK", source: undefined })
    })
    assert.strictEqual(renderPrettyTable(empty), "No rows found.")
  })
})
