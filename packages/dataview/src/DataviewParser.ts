import { Schema } from "effect"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import {
  DataviewBinaryOperator,
  DataviewExpression,
  DataviewGroupTerm,
  DataviewParseError,
  DataviewProjection,
  DataviewQuery,
  DataviewQueryKind,
  DataviewSortDirection,
  DataviewSortTerm,
  DataviewUnaryOperator,
  type DataviewExpression as DataviewExpressionType
} from "./DataviewAst"

const fromPattern = /^FROM\s+(.+)$/i
const wherePattern = /^WHERE\s+(.+)$/i
const groupPattern = /^GROUP\s+BY\s+(.+)$/i
const sortPattern = /^SORT\s+(.+)$/i
const limitPattern = /^LIMIT\s+(.+)$/i

export type DataviewParserService = {
  readonly parse: (queryText: string) => Effect.Effect<DataviewQuery, DataviewParseError>
}

export class DataviewParser extends Context.Service<DataviewParser, DataviewParserService>()(
  "@kb/dataview/DataviewParser"
) {
  static readonly layerNoDeps: Layer.Layer<DataviewParser> = Layer.effect(
    this,
    Effect.sync(() => this.of({ parse }))
  )
}

const parse = Effect.fn("DataviewParser.parse")((input: string) => parseQuery(input))

const parseQuery = (input: string): Effect.Effect<DataviewQuery, DataviewParseError> => {
  const lines = queryLines(input)
  const head = lines[0]
  if (head === undefined) {
    return parseFailure(input, "Dataview query is empty", undefined)
  }

  const parsedHead = parseQueryHead(head)
  if (parsedHead._tag === "Bad") {
    return parseFailure(input, parsedHead.message, 1)
  }

  let source: DataviewExpressionType | undefined = undefined
  const predicates: Array<DataviewExpressionType> = []
  let groupBy: DataviewGroupTerm | undefined = undefined
  const sort: Array<DataviewSortTerm> = []
  let limit: number | undefined = undefined
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? ""
    const from = fromPattern.exec(line)
    if (from !== null) {
      const parsed = parseExpression(from[1] ?? "")
      if (parsed._tag === "Bad") {
        return parseFailure(input, parsed.message, index + 1)
      }
      source = parsed.value
      continue
    }

    const where = wherePattern.exec(line)
    if (where !== null) {
      const parsed = parseExpression(where[1] ?? "")
      if (parsed._tag === "Bad") {
        return parseFailure(input, parsed.message, index + 1)
      }
      predicates.push(parsed.value)
      continue
    }

    const group = groupPattern.exec(line)
    if (group !== null) {
      const parsed = parseExpression(group[1] ?? "")
      if (parsed._tag === "Bad") {
        return parseFailure(input, parsed.message, index + 1)
      }
      groupBy = new DataviewGroupTerm({ expression: parsed.value })
      continue
    }

    const sorted = sortPattern.exec(line)
    if (sorted !== null) {
      const parsed = parseSortTerms(sorted[1] ?? "")
      if (parsed._tag === "Bad") {
        return parseFailure(input, parsed.message, index + 1)
      }
      sort.push(...parsed.value)
      continue
    }
    const limited = limitPattern.exec(line)
    if (limited !== null) {
      const parsed = parseLimit(limited[1] ?? "")
      if (parsed._tag === "Bad") {
        return parseFailure(input, parsed.message, index + 1)
      }
      limit = parsed.value
      continue
    }

    return parseFailure(input, `Unsupported Dataview statement: ${line}`, index + 1)
  }

  return Effect.succeed(
    new DataviewQuery({
      kind: parsedHead.value.kind,
      projections: parsedHead.value.projections,
      withoutId: parsedHead.value.withoutId,
      source,
      predicates,
      groupBy,
      sort,
      limit
    })
  )
}
class QueryHead extends Schema.TaggedClass<QueryHead>("@kb/dataview/DataviewParser/QueryHead")("QueryHead", {
  kind: DataviewQueryKind,
  projections: Schema.Array(DataviewProjection),
  withoutId: Schema.Boolean
}) {}

const parseQueryHead = (input: string): ParseResult<QueryHead> => {
  const trimmed = input.trim()
  const match = /^([A-Za-z]+)\b(.*)$/.exec(trimmed)
  if (match === null) {
    return bad(`Unsupported Dataview query type: ${trimmed}`)
  }

  const kind = (match[1] ?? "").toUpperCase()
  const rest = (match[2] ?? "").trim()
  if (kind === "CALENDAR") {
    return bad("Unsupported Dataview query type: CALENDAR")
  }
  if (kind === "TASK") {
    return rest.length === 0
      ? ok(new QueryHead({ kind: DataviewQueryKind.enums.Task, projections: [], withoutId: false }), 1)
      : bad(`Unsupported Dataview statement: ${input}`)
  }
  if (kind === "LIST") {
    return parseProjectionHead(rest, DataviewQueryKind.enums.List, 1)
  }
  if (kind === "TABLE") {
    return parseProjectionHead(rest, DataviewQueryKind.enums.Table, Number.POSITIVE_INFINITY)
  }
  return bad(`Unsupported Dataview query type: ${kind}`)
}

const parseProjectionHead = (
  input: string,
  kind: DataviewQueryKind,
  maximumProjectionCount: number
): ParseResult<QueryHead> => {
  const withoutIdPrefix = /^WITHOUT\s+ID\b/i
  const withoutId = withoutIdPrefix.test(input)
  const projectionInput = withoutId ? input.replace(withoutIdPrefix, "").trim() : input.trim()
  const chunks = projectionInput.length === 0 ? [] : splitTopLevelComma(projectionInput)
  if (chunks.length > maximumProjectionCount) {
    return bad("LIST supports at most one projection")
  }

  const projections: Array<DataviewProjection> = []
  for (const chunk of chunks) {
    const parsed = parseProjection(chunk)
    if (parsed._tag === "Bad") {
      return parsed
    }
    projections.push(parsed.value)
  }

  return ok(new QueryHead({ kind, projections, withoutId }), 1)
}

const parseProjection = (input: string): ParseResult<DataviewProjection> => {
  const aliased = trailingAlias(input)
  const expressionInput = aliased.expression
  const parsed = parseExpression(expressionInput)
  if (parsed._tag === "Bad") {
    return parsed
  }
  return ok(
    new DataviewProjection({
      expression: parsed.value,
      label: aliased.label ?? expressionInput.trim()
    }),
    parsed.index
  )
}

class ProjectionAlias extends Schema.TaggedClass<ProjectionAlias>(
  "@kb/dataview/DataviewParser/ProjectionAlias"
)("ProjectionAlias", {
  expression: Schema.String,
  label: Schema.UndefinedOr(Schema.String)
}) {}

const trailingAlias = (input: string): ProjectionAlias => {
  const match = /\s+AS\s+("[^"]*"|[A-Za-z_#/-][A-Za-z0-9_.#/-]*)\s*$/i.exec(input)
  if (match === null) {
    return new ProjectionAlias({ expression: input.trim(), label: undefined })
  }
  const labelToken = match[1] ?? ""
  const label = labelToken.startsWith('"') ? labelToken.slice(1, -1) : labelToken
  return new ProjectionAlias({ expression: input.slice(0, match.index).trim(), label })
}

const parseLimit = (input: string): ParseResult<number> =>
  /^[1-9][0-9]*$/.test(input.trim()) ? ok(Number(input.trim()), 1) : bad("LIMIT must be a positive integer")
const queryLines = (input: string): ReadonlyArray<string> => {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  if (lines.length !== 1) {
    return lines
  }
  return (lines[0] ?? "")
    .replace(/\s+(FROM|WHERE|GROUP\s+BY|SORT|LIMIT)\s+/gi, "\n$1 ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

const TokenSchema = Schema.TaggedUnion({
  Identifier: { value: Schema.String },
  String: { value: Schema.String },
  Number: { value: Schema.Number },
  Operator: { value: Schema.String },
  Paren: { value: Schema.Literals(["(", ")"]) },
  Comma: {}
})
type Token = typeof TokenSchema.Type

class ParseOkModel extends Schema.TaggedClass<ParseOkModel>("@kb/dataview/DataviewParser/ParseOk")("Ok", {
  value: Schema.Unknown,
  index: Schema.Number
}) {}

class ParseBad extends Schema.TaggedClass<ParseBad>("@kb/dataview/DataviewParser/ParseBad")("Bad", {
  message: Schema.String
}) {}

type ParseOk<A> = ParseOkModel & { readonly value: A }
type ParseResult<A> = ParseOk<A> | ParseBad

const ok = <A>(value: A, index: number): ParseOk<A> => new ParseOkModel({ value, index }) as ParseOk<A>
const bad = (message: string): ParseBad => new ParseBad({ message })

const parseFailure = (
  input: string,
  message: string,
  line: number | undefined
): Effect.Effect<never, DataviewParseError> => Effect.fail(new DataviewParseError({ input, message, line }))

const parseExpression = (input: string): ParseResult<DataviewExpressionType> => {
  const tokens = tokenize(input)
  if (tokens._tag === "Bad") {
    return tokens
  }
  const parsed = parseOr(tokens.value, 0)
  if (parsed._tag === "Bad") {
    return parsed
  }
  return parsed.index === tokens.value.length ? parsed : bad("Unexpected tokens after expression")
}

const tokenize = (input: string): ParseResult<ReadonlyArray<Token>> => {
  const tokens: Array<Token> = []
  let cursor = 0
  while (cursor < input.length) {
    const char = input[cursor] ?? ""
    if (/\s/.test(char)) {
      cursor += 1
      continue
    }
    if (char === "(" || char === ")") {
      tokens.push(TokenSchema.cases.Paren.make({ value: char }))
      cursor += 1
      continue
    }
    if (char === ",") {
      tokens.push(TokenSchema.cases.Comma.make({}))
      cursor += 1
      continue
    }
    const two = input.slice(cursor, cursor + 2)
    if (two === ">=" || two === "<=" || two === "!=") {
      tokens.push(TokenSchema.cases.Operator.make({ value: two }))
      cursor += 2
      continue
    }
    if (char === "!" || char === "=" || char === ">" || char === "<") {
      tokens.push(TokenSchema.cases.Operator.make({ value: char }))
      cursor += 1
      continue
    }
    if (char === '"') {
      const close = input.indexOf('"', cursor + 1)
      if (close === -1) {
        return bad("Unterminated string literal")
      }
      tokens.push(TokenSchema.cases.String.make({ value: input.slice(cursor + 1, close) }))
      cursor = close + 1
      continue
    }
    const identifier = readIdentifier(input, cursor)
    if (identifier.length > 0 && /[A-Za-z_#/-]/.test(identifier[0] ?? "")) {
      tokens.push(TokenSchema.cases.Identifier.make({ value: identifier }))
      cursor += identifier.length
      continue
    }
    const number = readNumber(input, cursor)
    if (number.length > 0 && number.length === identifier.length) {
      tokens.push(TokenSchema.cases.Number.make({ value: Number(number) }))
      cursor += number.length
      continue
    }
    if (identifier.length === 0) {
      return bad(`Unexpected character: ${char}`)
    }
    tokens.push(TokenSchema.cases.Identifier.make({ value: identifier }))
    cursor += identifier.length
  }
  return ok(tokens, tokens.length)
}

const readNumber = (input: string, cursor: number): string => {
  let end = cursor
  while (end < input.length && /[0-9]/.test(input[end] ?? "")) {
    end += 1
  }
  if ((input[end] ?? "") === ".") {
    end += 1
    while (end < input.length && /[0-9]/.test(input[end] ?? "")) {
      end += 1
    }
  }
  return end === cursor ? "" : input.slice(cursor, end)
}

const readIdentifier = (input: string, cursor: number): string => {
  let end = cursor
  while (end < input.length && /[A-Za-z0-9_.#/-]/.test(input[end] ?? "")) {
    end += 1
  }
  return input.slice(cursor, end)
}

const parseOr = (tokens: ReadonlyArray<Token>, index: number): ParseResult<DataviewExpressionType> => {
  let left = parseAnd(tokens, index)
  if (left._tag === "Bad") {
    return left
  }
  while (isIdentifier(tokens[left.index], "OR")) {
    const right = parseAnd(tokens, left.index + 1)
    if (right._tag === "Bad") {
      return right
    }
    left = ok(
      DataviewExpression.Binary({ operator: DataviewBinaryOperator.enums.Or, left: left.value, right: right.value }),
      right.index
    )
  }
  return left
}

const parseAnd = (tokens: ReadonlyArray<Token>, index: number): ParseResult<DataviewExpressionType> => {
  let left = parseComparison(tokens, index)
  if (left._tag === "Bad") {
    return left
  }
  while (isIdentifier(tokens[left.index], "AND")) {
    const right = parseComparison(tokens, left.index + 1)
    if (right._tag === "Bad") {
      return right
    }
    left = ok(
      DataviewExpression.Binary({ operator: DataviewBinaryOperator.enums.And, left: left.value, right: right.value }),
      right.index
    )
  }
  return left
}

const parseComparison = (tokens: ReadonlyArray<Token>, index: number): ParseResult<DataviewExpressionType> => {
  const left = parseUnary(tokens, index)
  if (left._tag === "Bad") {
    return left
  }
  const token = tokens[left.index]
  if (token?._tag !== "Operator" || token.value === "!") {
    return left
  }
  const right = parseUnary(tokens, left.index + 1)
  if (right._tag === "Bad") {
    return right
  }
  const operator = binaryOperator(token.value)
  if (operator === undefined) {
    return bad(`Unsupported operator: ${token.value}`)
  }
  return ok(DataviewExpression.Binary({ operator, left: left.value, right: right.value }), right.index)
}

const parseUnary = (tokens: ReadonlyArray<Token>, index: number): ParseResult<DataviewExpressionType> => {
  if (tokens[index]?._tag === "Operator" && tokens[index]?.value === "!") {
    const operand = parseUnary(tokens, index + 1)
    return operand._tag === "Bad"
      ? operand
      : ok(DataviewExpression.Unary({ operator: DataviewUnaryOperator.enums.Not, operand: operand.value }), operand.index)
  }
  return parseCall(tokens, index)
}

const parseCall = (tokens: ReadonlyArray<Token>, index: number): ParseResult<DataviewExpressionType> => {
  const callee = parsePrimary(tokens, index)
  if (callee._tag === "Bad") {
    return callee
  }
  if (!isParen(tokens[callee.index], "(")) {
    return callee
  }

  const args: Array<DataviewExpressionType> = []
  let cursor = callee.index + 1
  if (isParen(tokens[cursor], ")")) {
    return ok(DataviewExpression.Call({ callee: callee.value, args }), cursor + 1)
  }

  while (cursor < tokens.length) {
    const parsed = parseOr(tokens, cursor)
    if (parsed._tag === "Bad") {
      return parsed
    }
    args.push(parsed.value)
    cursor = parsed.index
    if (tokens[cursor]?._tag === "Comma") {
      cursor += 1
      continue
    }
    if (isParen(tokens[cursor], ")")) {
      return ok(DataviewExpression.Call({ callee: callee.value, args }), cursor + 1)
    }
    return bad("Expected comma or closing parenthesis")
  }
  return bad("Expected closing parenthesis")
}

const parsePrimary = (tokens: ReadonlyArray<Token>, index: number): ParseResult<DataviewExpressionType> => {
  const token = tokens[index]
  if (token === undefined) {
    return bad("Expected expression")
  }
  if (token._tag === "String") {
    return ok(DataviewExpression.StringLiteral({ value: token.value }), index + 1)
  }
  if (token._tag === "Number") {
    return ok(DataviewExpression.NumberLiteral({ value: token.value }), index + 1)
  }
  if (token._tag === "Identifier") {
    if (token.value === "true" || token.value === "false") {
      return ok(DataviewExpression.BooleanLiteral({ value: token.value === "true" }), index + 1)
    }
    return ok(DataviewExpression.Identifier({ name: token.value }), index + 1)
  }
  if (token._tag === "Paren" && token.value === "(") {
    const parsed = parseOr(tokens, index + 1)
    if (parsed._tag === "Bad") {
      return parsed
    }
    return isParen(tokens[parsed.index], ")") ? ok(parsed.value, parsed.index + 1) : bad("Expected closing parenthesis")
  }
  return bad("Expected expression")
}

const parseSortTerms = (input: string): ParseResult<ReadonlyArray<DataviewSortTerm>> => {
  const chunks = splitTopLevelComma(input)
  const terms: Array<DataviewSortTerm> = []
  for (const chunk of chunks) {
    const parsed = parseSortTerm(chunk)
    if (parsed._tag === "Bad") {
      return parsed
    }
    terms.push(parsed.value)
  }
  return ok(terms, terms.length)
}

const splitTopLevelComma = (input: string): ReadonlyArray<string> => {
  const chunks: Array<string> = []
  let depth = 0
  let start = 0
  let inString = false
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (char === '"') {
      inString = !inString
    } else if (!inString && char === "(") {
      depth += 1
    } else if (!inString && char === ")") {
      depth -= 1
    } else if (!inString && char === "," && depth === 0) {
      chunks.push(input.slice(start, index).trim())
      start = index + 1
    }
  }
  chunks.push(input.slice(start).trim())
  return chunks.filter((chunk) => chunk.length > 0)
}

const parseSortTerm = (input: string): ParseResult<DataviewSortTerm> => {
  const direction = trailingDirection(input)
  const expressionInput = direction === undefined ? input : input.slice(0, input.length - direction.length).trim()
  const parsed = parseExpression(expressionInput)
  if (parsed._tag === "Bad") {
    return parsed
  }
  return ok(
    new DataviewSortTerm({ expression: parsed.value, direction: direction ?? DataviewSortDirection.enums.Asc }),
    parsed.index
  )
}

const trailingDirection = (input: string): DataviewSortDirection | undefined => {
  const trimmed = input.trimEnd()
  const upper = trimmed.toUpperCase()
  if (upper.endsWith(" ASC")) {
    return DataviewSortDirection.enums.Asc
  }
  if (upper.endsWith(" DESC")) {
    return DataviewSortDirection.enums.Desc
  }
  return undefined
}

const binaryOperator = (value: string): DataviewBinaryOperator | undefined => {
  switch (value) {
    case "=":
      return DataviewBinaryOperator.enums.Equal
    case "!=":
      return DataviewBinaryOperator.enums.NotEqual
    case ">":
      return DataviewBinaryOperator.enums.GreaterThan
    case ">=":
      return DataviewBinaryOperator.enums.GreaterThanOrEqual
    case "<":
      return DataviewBinaryOperator.enums.LessThan
    case "<=":
      return DataviewBinaryOperator.enums.LessThanOrEqual
    default:
      return undefined
  }
}

const isIdentifier = (token: Token | undefined, value: string): boolean =>
  token?._tag === "Identifier" && token.value.toUpperCase() === value

const isParen = (token: Token | undefined, value: "(" | ")"): boolean =>
  token?._tag === "Paren" && token.value === value
