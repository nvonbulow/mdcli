import { Effect } from "effect"
import {
  DataviewExpression,
  DataviewGroupTerm,
  DataviewParseError,
  DataviewSortTerm,
  DataviewTaskQuery,
  type DataviewExpression as DataviewExpressionType,
  type SortDirection
} from "./DataviewAst"

const fromPattern = /^FROM\s+(.+)$/i
const wherePattern = /^WHERE\s+(.+)$/i
const groupPattern = /^GROUP\s+BY\s+(.+)$/i
const sortPattern = /^SORT\s+(.+)$/i

export const parseDataviewQuery = (input: string): Effect.Effect<DataviewTaskQuery, DataviewParseError> => {
  const lines = queryLines(input)
  const kind = lines[0]
  if (kind === undefined) {
    return parseFailure(input, "Dataview query is empty", undefined)
  }

  let source: DataviewExpressionType | undefined = undefined
  const predicates: Array<DataviewExpressionType> = []
  let groupBy: DataviewGroupTerm | undefined = undefined
  const sort: Array<DataviewSortTerm> = []

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

    return parseFailure(input, `Unsupported Dataview statement: ${line}`, index + 1)
  }

  return Effect.succeed(new DataviewTaskQuery({ kind, source, predicates, groupBy, sort }))
}
const queryLines = (input: string): ReadonlyArray<string> => {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  if (lines.length !== 1) {
    return lines
  }
  return (lines[0] ?? "")
    .replace(/\s+(FROM|WHERE|GROUP\s+BY|SORT)\s+/gi, "\n$1 ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

type Token =
  | { readonly _tag: "Identifier"; readonly value: string }
  | { readonly _tag: "String"; readonly value: string }
  | { readonly _tag: "Number"; readonly value: number }
  | { readonly _tag: "Operator"; readonly value: string }
  | { readonly _tag: "Paren"; readonly value: "(" | ")" }
  | { readonly _tag: "Comma" }

type ParseOk<A> = { readonly _tag: "Ok"; readonly value: A; readonly index: number }
type ParseBad = { readonly _tag: "Bad"; readonly message: string }
type ParseResult<A> = ParseOk<A> | ParseBad

const ok = <A>(value: A, index: number): ParseOk<A> => ({ _tag: "Ok", value, index })
const bad = (message: string): ParseBad => ({ _tag: "Bad", message })

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
      tokens.push({ _tag: "Paren", value: char })
      cursor += 1
      continue
    }
    if (char === ",") {
      tokens.push({ _tag: "Comma" })
      cursor += 1
      continue
    }
    const two = input.slice(cursor, cursor + 2)
    if (two === ">=" || two === "<=" || two === "!=") {
      tokens.push({ _tag: "Operator", value: two })
      cursor += 2
      continue
    }
    if (char === "!" || char === "=" || char === ">" || char === "<") {
      tokens.push({ _tag: "Operator", value: char })
      cursor += 1
      continue
    }
    if (char === '"') {
      const close = input.indexOf('"', cursor + 1)
      if (close === -1) {
        return bad("Unterminated string literal")
      }
      tokens.push({ _tag: "String", value: input.slice(cursor + 1, close) })
      cursor = close + 1
      continue
    }
    const identifier = readIdentifier(input, cursor)
    if (identifier.length > 0 && /[A-Za-z_#/-]/.test(identifier[0] ?? "")) {
      tokens.push({ _tag: "Identifier", value: identifier })
      cursor += identifier.length
      continue
    }
    const number = readNumber(input, cursor)
    if (number.length > 0 && number.length === identifier.length) {
      tokens.push({ _tag: "Number", value: Number(number) })
      cursor += number.length
      continue
    }
    if (identifier.length === 0) {
      return bad(`Unexpected character: ${char}`)
    }
    tokens.push({ _tag: "Identifier", value: identifier })
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
    left = ok(DataviewExpression.Binary({ operator: "OR", left: left.value, right: right.value }), right.index)
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
    left = ok(DataviewExpression.Binary({ operator: "AND", left: left.value, right: right.value }), right.index)
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
  return ok(
    DataviewExpression.Binary({
      operator: token.value as "=" | "!=" | ">" | ">=" | "<" | "<=",
      left: left.value,
      right: right.value
    }),
    right.index
  )
}

const parseUnary = (tokens: ReadonlyArray<Token>, index: number): ParseResult<DataviewExpressionType> => {
  if (tokens[index]?._tag === "Operator" && tokens[index]?.value === "!") {
    const operand = parseUnary(tokens, index + 1)
    return operand._tag === "Bad"
      ? operand
      : ok(DataviewExpression.Unary({ operator: "!", operand: operand.value }), operand.index)
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
  const chunks = splitSortTerms(input)
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

const splitSortTerms = (input: string): ReadonlyArray<string> => {
  const chunks: Array<string> = []
  let depth = 0
  let start = 0
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (char === "(") {
      depth += 1
    } else if (char === ")") {
      depth -= 1
    } else if (char === "," && depth === 0) {
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
  return ok(new DataviewSortTerm({ expression: parsed.value, direction: direction ?? "ASC" }), parsed.index)
}

const trailingDirection = (input: string): SortDirection | undefined => {
  const trimmed = input.trimEnd()
  const upper = trimmed.toUpperCase()
  if (upper.endsWith(" ASC")) {
    return "ASC"
  }
  if (upper.endsWith(" DESC")) {
    return "DESC"
  }
  return undefined
}

const isIdentifier = (token: Token | undefined, value: string): boolean =>
  token?._tag === "Identifier" && token.value.toUpperCase() === value

const isParen = (token: Token | undefined, value: "(" | ")"): boolean =>
  token?._tag === "Paren" && token.value === value
