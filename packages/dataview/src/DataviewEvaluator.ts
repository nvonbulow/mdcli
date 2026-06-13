import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import {
  DataviewBinaryOperator,
  type DataviewEvaluateError,
  type DataviewExpression,
  type DataviewQuery,
  DataviewQueryKind,
  DataviewSortDirection
} from "./DataviewAst"
import {
  DataviewColumn,
  DataviewGroup,
  DataviewMetadata,
  DataviewRecord,
  DataviewResult,
  DataviewRow,
  type DataviewResult as DataviewResultType,
  type DataviewScalar,
  type DataviewValue
} from "./DataviewResult"

export type DataviewFunction = (args: ReadonlyArray<DataviewValue>) => DataviewValue
export type DataviewFunctions = Readonly<Record<string, DataviewFunction>>

export type EvaluationContext = {
  readonly functions: DataviewFunctions
}

export type DataviewEvaluatorService = {
  readonly evaluate: (
    queryText: string,
    query: DataviewQuery,
    records: ReadonlyArray<DataviewRecord>,
    context: EvaluationContext
  ) => Effect.Effect<DataviewResultType, DataviewEvaluateError>
}

const evaluate = Effect.fn("DataviewEvaluator.evaluate")(function* (
  queryText: string,
  query: DataviewQuery,
  records: ReadonlyArray<DataviewRecord>,
  context: EvaluationContext
) {
  const filtered = records.filter((record) =>
    query.predicates.every((predicate) => truthy(evaluateExpression(predicate, record, context)))
  )
  const sorted = sortRecords(filtered, query, context)
  const limited = query.limit === undefined ? sorted : sorted.slice(0, query.limit)
  const rows = rowsForQuery(query, limited, context)
  const source = query.source === undefined ? undefined : evaluateExpression(query.source, emptyRecord, context)
  return DataviewResult.QueryResult({
    columns: columnsForQuery(query, rows),
    rows,
    groups: groupsFromRows(rows, query.groupBy?.expression, context),
    metadata: new DataviewMetadata({ query: queryText, source })
  })
})

export class DataviewEvaluator extends Context.Service<DataviewEvaluator, DataviewEvaluatorService>()(
  "@kb/dataview/DataviewEvaluator"
) {
  static readonly layerNoDeps: Layer.Layer<DataviewEvaluator> = Layer.effect(
    this,
    Effect.sync(() => this.of({ evaluate }))
  )
}

const emptyRecord = new DataviewRecord({ fields: {}, original: undefined })

const evaluateExpression = (
  expression: DataviewExpression,
  record: DataviewRecord,
  context: EvaluationContext
): DataviewValue => {
  switch (expression._tag) {
    case "Identifier":
      return lookupField(record.fields, expression.name)
    case "StringLiteral":
      return expression.value
    case "NumberLiteral":
      return expression.value
    case "BooleanLiteral":
      return expression.value
    case "Unary":
      return !truthy(evaluateExpression(expression.operand, record, context))
    case "Binary":
      return evaluateBinary(
        expression.operator,
        evaluateExpression(expression.left, record, context),
        evaluateExpression(expression.right, record, context)
      )
    case "Call": {
      const callee = calleeName(expression.callee)
      const fn = callee === undefined ? undefined : context.functions[callee]
      return fn === undefined ? null : fn(expression.args.map((arg) => evaluateFunctionArg(arg, record, context)))
    }
  }
}

const evaluateFunctionArg = (
  expression: DataviewExpression,
  record: DataviewRecord,
  context: EvaluationContext
): DataviewValue => {
  const value = evaluateExpression(expression, record, context)
  return value === null && expression._tag === "Identifier" ? expression.name : value
}

const evaluateBinary = (
  operator: DataviewBinaryOperator,
  left: DataviewValue,
  right: DataviewValue
): DataviewValue => {
  switch (operator) {
    case DataviewBinaryOperator.enums.And:
      return truthy(left) && truthy(right)
    case DataviewBinaryOperator.enums.Or:
      return truthy(left) || truthy(right)
    case DataviewBinaryOperator.enums.Equal:
      return compare(left, right) === 0
    case DataviewBinaryOperator.enums.NotEqual:
      return compare(left, right) !== 0
    case DataviewBinaryOperator.enums.GreaterThan:
      return compare(left, right) > 0
    case DataviewBinaryOperator.enums.GreaterThanOrEqual:
      return compare(left, right) >= 0
    case DataviewBinaryOperator.enums.LessThan:
      return compare(left, right) < 0
    case DataviewBinaryOperator.enums.LessThanOrEqual:
      return compare(left, right) <= 0
  }
}

const calleeName = (expression: DataviewExpression): string | undefined =>
  expression._tag === "Identifier" ? expression.name : undefined

const truthy = (value: DataviewValue): boolean => {
  if (Array.isArray(value)) {
    return value.length > 0
  }
  return value !== null && value !== false && value !== "" && value !== 0
}

const compare = (left: DataviewValue, right: DataviewValue): number => {
  const leftScalar = scalar(left)
  const rightScalar = scalar(right)
  if (leftScalar === null && rightScalar === null) {
    return 0
  }
  if (leftScalar === null) {
    return 1
  }
  if (rightScalar === null) {
    return -1
  }
  if (typeof leftScalar === "number" && typeof rightScalar === "number") {
    return leftScalar === rightScalar ? 0 : leftScalar < rightScalar ? -1 : 1
  }
  const leftText = textValue(leftScalar)
  const rightText = textValue(rightScalar)
  return leftText === rightText ? 0 : leftText < rightText ? -1 : 1
}

const scalar = (value: DataviewValue): DataviewScalar => {
  if (Array.isArray(value)) {
    return value.length === 0 ? null : scalar(value[0] as DataviewValue)
  }
  return isScalar(value) ? value : null
}
const textValue = (value: DataviewScalar): string => (value === null ? "" : `${value}`)
const isScalar = (value: DataviewValue): value is DataviewScalar =>
  value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean"
const isJsonObject = (value: DataviewValue): value is Readonly<Record<string, DataviewValue>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const sortRecords = (
  records: ReadonlyArray<DataviewRecord>,
  query: DataviewQuery,
  context: EvaluationContext
): ReadonlyArray<DataviewRecord> => {
  const copy = [...records]
  copy.sort((left, right) => {
    for (const term of query.sort) {
      const order = compare(
        evaluateExpression(term.expression, left, context),
        evaluateExpression(term.expression, right, context)
      )
      if (order !== 0) {
        return term.direction === DataviewSortDirection.enums.Desc ? -order : order
      }
    }
    return 0
  })
  return copy
}

const rowsForQuery = (
  query: DataviewQuery,
  records: ReadonlyArray<DataviewRecord>,
  context: EvaluationContext
): ReadonlyArray<DataviewRow> => {
  switch (query.kind) {
    case DataviewQueryKind.enums.Task:
      return records.map((record) => new DataviewRow({ cells: record.fields, record }))
    case DataviewQueryKind.enums.Table:
      return records.map((record) => new DataviewRow({ cells: projectedCells(query, record, context), record }))
    case DataviewQueryKind.enums.List:
      return records.map((record) => new DataviewRow({ cells: projectedCells(query, record, context), record }))
  }
}

const projectedCells = (
  query: DataviewQuery,
  record: DataviewRecord,
  context: EvaluationContext
): Readonly<Record<string, DataviewValue>> => {
  const cells: Record<string, DataviewValue> = {}
  const includeFileLink =
    !query.withoutId ||
    (query.kind === DataviewQueryKind.enums.List && query.projections.length === 0)
  if (includeFileLink) {
    cells["file.link"] = lookupField(record.fields, "file.link")
  }
  for (const projection of query.projections) {
    cells[projection.label] = evaluateExpression(projection.expression, record, context)
  }
  return cells
}

const columnsForQuery = (
  query: DataviewQuery,
  rows: ReadonlyArray<DataviewRow>
): ReadonlyArray<DataviewColumn> => {
  if (query.kind === DataviewQueryKind.enums.Task) {
    return columnsFromRows(rows)
  }
  const columns: Array<DataviewColumn> = []
  const includeFileLink =
    !query.withoutId ||
    (query.kind === DataviewQueryKind.enums.List && query.projections.length === 0)
  if (includeFileLink) {
    columns.push(new DataviewColumn({ key: "file.link", label: "File" }))
  }
  for (const projection of query.projections) {
    columns.push(new DataviewColumn({ key: projection.label, label: projection.label }))
  }
  return columns
}

const lookupField = (fields: Readonly<Record<string, DataviewValue>>, name: string): DataviewValue => {
  if (Object.prototype.hasOwnProperty.call(fields, name)) {
    return fields[name] ?? null
  }
  const parts = name.split(".")
  let current: DataviewValue | undefined = fields[parts[0] ?? ""]
  for (let index = 1; index < parts.length; index += 1) {
    if (current === undefined || !isJsonObject(current)) {
      return null
    }
    current = current[parts[index] ?? ""]
  }
  return current ?? null
}

const columnsFromRows = (rows: ReadonlyArray<DataviewRow>): ReadonlyArray<DataviewColumn> => {
  const keys: Array<string> = []
  const seen = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row.cells)) {
      if (!seen.has(key)) {
        seen.add(key)
        keys.push(key)
      }
    }
  }
  return keys.map((key) => new DataviewColumn({ key, label: key }))
}

const groupsFromRows = (
  rows: ReadonlyArray<DataviewRow>,
  expression: DataviewExpression | undefined,
  context: EvaluationContext
): ReadonlyArray<DataviewGroup> => {
  if (expression === undefined) {
    return []
  }
  const groups: Array<DataviewGroup> = []
  const indexes = new Map<string, Array<number>>()
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    if (row === undefined) {
      continue
    }
    const key = textValue(scalar(evaluateExpression(expression, row.record, context)))
    const values = indexes.get(key)
    if (values === undefined) {
      indexes.set(key, [index])
    } else {
      values.push(index)
    }
  }
  for (const [key, rowIndexes] of indexes) {
    groups.push(new DataviewGroup({ key, label: key, rowIndexes }))
  }
  return groups
}
