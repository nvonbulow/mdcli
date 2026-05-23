import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { String as Str } from "effect"
import type { TaskParseError } from "./VaultErrors"

export type InlineFieldParserService = {
  readonly parse: (lineText: string) => Effect.Effect<Readonly<Record<string, string>>, TaskParseError>
}
const fieldStartPattern = /^([A-Za-z][A-Za-z0-9_-]*)::\s*/

export const parse = Effect.fn("InlineFieldParser.parse")(function* (lineText: string) {
  return extractInlineFieldsFromText(lineText)
})

export class InlineFieldParser extends Context.Service<InlineFieldParser, InlineFieldParserService>()(
  "@kb/vault/InlineFieldParser"
) {
  static readonly layerNoDeps: Layer.Layer<InlineFieldParser> = Layer.effect(this, Effect.succeed(this.of({ parse })))
}

export const extractInlineFieldsFromText = (input: string): Readonly<Record<string, string>> => {
  const fields: Record<string, string> = {}
  let cursor = 0

  while (cursor < input.length) {
    const open = input.indexOf("[", cursor)
    if (open === -1) {
      break
    }

    const fieldMatch = fieldStartPattern.exec(input.slice(open + 1))
    if (fieldMatch === null) {
      cursor = open + 1
      continue
    }

    const key = fieldMatch[1] ?? ""
    const valueStart = open + 1 + fieldMatch[0].length
    const close = findInlineFieldClose(input, valueStart)
    if (close === -1) {
      cursor = valueStart
      continue
    }

    fields[key] = Str.trim(input.slice(valueStart, close))
    cursor = close + 1
  }

  return fields
}

export const stripInlineFieldMarkup = (input: string): string => {
  let output = ""
  let cursor = 0

  while (cursor < input.length) {
    const open = input.indexOf("[", cursor)
    if (open === -1) {
      output += input.slice(cursor)
      break
    }

    const fieldMatch = fieldStartPattern.exec(input.slice(open + 1))
    if (fieldMatch === null) {
      output += input.slice(cursor, open + 1)
      cursor = open + 1
      continue
    }

    const valueStart = open + 1 + fieldMatch[0].length
    const close = findInlineFieldClose(input, valueStart)
    if (close === -1) {
      output += input.slice(cursor, valueStart)
      cursor = valueStart
      continue
    }

    output += input.slice(cursor, open)
    cursor = close + 1
  }

  return Str.trim(output.replace(/\s{2,}/g, " "))
}

const findInlineFieldClose = (input: string, valueStart: number): number => {
  let index = valueStart
  let bracketDepth = 0

  while (index < input.length) {
    if (input.startsWith("[[", index)) {
      const wikilinkClose = input.indexOf("]]", index + 2)
      if (wikilinkClose === -1) {
        return -1
      }
      index = wikilinkClose + 2
      continue
    }

    const char = input[index]
    if (char === "[") {
      bracketDepth += 1
      index += 1
      continue
    }

    if (char === "]") {
      if (bracketDepth === 0) {
        return index
      }
      bracketDepth -= 1
    }

    index += 1
  }

  return -1
}
