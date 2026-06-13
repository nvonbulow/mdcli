import { Schema } from "effect"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Context from "effect/Context"
import type { DataviewRenderError } from "./DataviewErrors"
import type {
  DataviewColumn,
  DataviewGroup,
  DataviewMetadata,
  DataviewResult,
  DataviewRow,
  DataviewValue
} from "./DataviewResult"

export const OutputFormat = Schema.Literals(["pretty", "markdown", "json"])
export type OutputFormat = typeof OutputFormat.Type

export type DataviewRendererService = {
  readonly render: (result: DataviewResult) => Effect.Effect<string, DataviewRenderError>
}

export class DataviewRenderer extends Context.Service<DataviewRenderer, DataviewRendererService>()(
  "@kb/dataview/DataviewRenderer"
) {
  static get layerPretty(): Layer.Layer<DataviewRenderer> {
    return rendererLayer("pretty", renderPrettyTable)
  }

  static get layerMarkdown(): Layer.Layer<DataviewRenderer> {
    return rendererLayer("markdown", renderMarkdownTable)
  }

  static get layerJson(): Layer.Layer<DataviewRenderer> {
    return rendererLayer("json", renderJson)
  }
}

function renderJson(result: DataviewResult): string {
  return JSON.stringify(resultEnvelope(result), null, 2)
}

function renderMarkdownTable(result: DataviewResult): string {
  const table = tableParts(result)
  if (table.columns.length === 0) {
    return "No rows found."
  }
  return [
    `| ${table.columns.map((column) => escapeMarkdownCell(column.label)).join(" | ")} |`,
    `| ${table.columns.map(() => "---").join(" | ")} |`,
    ...table.rows.map(
      (row) => `| ${table.columns.map((column) => escapeMarkdownCell(cellText(row.cells[column.key]))).join(" | ")} |`
    )
  ].join("\n")
}

function renderPrettyTable(result: DataviewResult): string {
  const table = tableParts(result)
  if (table.columns.length === 0 || table.rows.length === 0) {
    return "No rows found."
  }
  const widths = table.columns.map((column) =>
    Math.max(column.label.length, ...table.rows.map((row) => prettyCellText(row.cells[column.key]).length))
  )
  const header = table.columns.map((column, index) => padRight(column.label, widths[index] ?? 0)).join("  ")
  const rule = widths.map((width) => "─".repeat(width)).join("  ")
  const rows = table.rows.map((row) =>
    table.columns.map((column, index) => padRight(prettyCellText(row.cells[column.key]), widths[index] ?? 0)).join("  ")
  )
  return [header, rule, ...rows].join("\n")
}

type RendererImplementation = (result: DataviewResult) => string

type TableParts = {
  readonly columns: ReadonlyArray<DataviewColumn>
  readonly rows: ReadonlyArray<DataviewRow>
  readonly groups: ReadonlyArray<DataviewGroup>
  readonly metadata: DataviewMetadata
}

function rendererLayer(name: OutputFormat, implementation: RendererImplementation): Layer.Layer<DataviewRenderer> {
  return Layer.effect(
    DataviewRenderer,
    Effect.sync(() =>
      DataviewRenderer.of({
        render: Effect.fn(`DataviewRenderer.${name}`)((result: DataviewResult) =>
          Effect.succeed(implementation(result))
        )
      })
    )
  )
}

const tableParts = (result: DataviewResult): TableParts => {
  switch (result._tag) {
    case "QueryResult":
      return result
  }
}

const resultEnvelope = (result: DataviewResult) => {
  const table = tableParts(result)
  return {
    _tag: result._tag,
    columns: table.columns.map((column) => ({ key: column.key, label: column.label })),
    rows: table.rows.map((row) => row.cells),
    groups: table.groups.map((group) => ({ key: group.key, label: group.label, rowIndexes: group.rowIndexes })),
    metadata: { query: table.metadata.query, source: table.metadata.source }
  }
}

const escapeMarkdownCell = (value: string): string => value.replaceAll("|", "\\|").replaceAll("\n", "<br>")

const cellText = (value: DataviewValue | undefined): string => {
  if (value === undefined || value === null) {
    return ""
  }
  if (Array.isArray(value)) {
    return value.every(isScalarCell)
      ? value.map((item) => (item === null ? "" : `${item}`)).join(", ")
      : (JSON.stringify(value) ?? "")
  }
  if (typeof value === "object") {
    return JSON.stringify(value) ?? ""
  }
  return `${value}`
}

const isScalarCell = (value: DataviewValue): boolean =>
  value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean"
const prettyCellText = (value: DataviewValue | undefined): string => cellText(value).replaceAll("\n", " ")

const padRight = (value: string, width: number): string =>
  value.length >= width ? value : `${value}${" ".repeat(width - value.length)}`
