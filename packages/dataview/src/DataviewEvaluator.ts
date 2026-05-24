import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type { DataviewEvaluateError, DataviewExpression, DataviewTaskQuery } from "./DataviewAst"
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
    query: DataviewTaskQuery,
    records: ReadonlyArray<DataviewRecord>,
    context: EvaluationContext
  ) => Effect.Effect<DataviewResultType, DataviewEvaluateError>
}

const evaluate = Effect.fn("DataviewEvaluator.evaluate")(function* (
  queryText: string,
  query: DataviewTaskQuery,
  records: ReadonlyArray<DataviewRecord>,
  context: EvaluationContext
) {
  const filtered = records.filter((record) =>
    query.predicates.every((predicate) => truthy(evaluateExpression(predicate, record, context)))
  )
  const sorted = sortRecords(filtered, query, context)
  const rows = sorted.map((record) => new DataviewRow({ cells: record.fields, record }))
  const source = query.source === undefined ? undefined : evaluateExpression(query.source, emptyRecord, context)
  return DataviewResult.QueryResult({
    columns: columnsFromRows(rows),
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
      return record.fields[expression.name] ?? null
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

const evaluateBinary = (operator: string, left: DataviewValue, right: DataviewValue): DataviewValue => {
  switch (operator) {
    case "AND":
      return truthy(left) && truthy(right)
    case "OR":
      return truthy(left) || truthy(right)
    case "=":
      return compare(left, right) === 0
    case "!=":
      return compare(left, right) !== 0
    case ">":
      return compare(left, right) > 0
    case ">=":
      return compare(left, right) >= 0
    case "<":
      return compare(left, right) < 0
    case "<=":
      return compare(left, right) <= 0
    default:
      return null
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

const scalar = (value: DataviewValue): DataviewScalar => (isScalarArray(value) ? (value[0] ?? null) : value)
const textValue = (value: DataviewScalar): string => (value === null ? "" : `${value}`)
const isScalarArray = (value: DataviewValue): value is ReadonlyArray<DataviewScalar> => Array.isArray(value)

const sortRecords = (
  records: ReadonlyArray<DataviewRecord>,
  query: DataviewTaskQuery,
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
        return term.direction === "DESC" ? -order : order
      }
    }
    return 0
  })
  return copy
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
