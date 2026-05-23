import type {
  DataviewColumn,
  DataviewGroup,
  DataviewMetadata,
  DataviewResult,
  DataviewRow,
  DataviewValue
} from "./DataviewResult"

export type OutputFormat = "pretty" | "markdown" | "json"

export const renderDataviewResult = (result: DataviewResult, format: OutputFormat): string => {
  switch (format) {
    case "json":
      return renderJson(result)
    case "markdown":
      return renderMarkdownTable(result)
    case "pretty":
      return renderPrettyTable(result)
  }
}

export const renderJson = (result: DataviewResult): string => JSON.stringify(resultEnvelope(result), null, 2)

export const renderMarkdownTable = (result: DataviewResult): string => {
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

export const renderPrettyTable = (result: DataviewResult): string => {
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

type TableParts = {
  readonly columns: ReadonlyArray<DataviewColumn>
  readonly rows: ReadonlyArray<DataviewRow>
  readonly groups: ReadonlyArray<DataviewGroup>
  readonly metadata: DataviewMetadata
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
    return value.map((item) => (item === null ? "" : `${item}`)).join(", ")
  }
  return `${value}`
}
const prettyCellText = (value: DataviewValue | undefined): string => cellText(value).replaceAll("\n", " ")

const padRight = (value: string, width: number): string =>
  value.length >= width ? value : `${value}${" ".repeat(width - value.length)}`
