import type { SourceSpan } from "./ObsidianNodes"

export type InlineFieldDelimiter = "square" | "paren"

export type InlineFieldSpan = {
  readonly key: string
  readonly value: string
  readonly original: string
  readonly valueStart: number
  readonly valueEnd: number
  readonly span: SourceSpan
  readonly delimiter: InlineFieldDelimiter
}

export const scanInlineFields = (input: string): readonly InlineFieldSpan[] => {
  const fields: InlineFieldSpan[] = []
  let cursor = 0

  while (cursor < input.length) {
    const open = findNextFieldOpen(input, cursor)
    if (open === -1) {
      break
    }

    const parsed = parseInlineFieldAt(input, open)
    if (parsed === undefined) {
      cursor = open + 1
      continue
    }

    fields.push(parsed.field)
    cursor = parsed.next
  }

  return fields
}

export const stripInlineFields = (input: string): string => {
  let output = ""
  let cursor = 0

  while (cursor < input.length) {
    const open = findNextFieldOpen(input, cursor)
    if (open === -1) {
      output += input.slice(cursor)
      break
    }

    const parsed = parseInlineFieldAt(input, open)
    if (parsed === undefined) {
      output += input.slice(cursor, open + 1)
      cursor = open + 1
      continue
    }

    output += input.slice(cursor, open)
    cursor = parsed.next
  }

  return collapseWhitespace(output)
}

type ParsedInlineField = {
  readonly field: InlineFieldSpan
  readonly next: number
}

const parseInlineFieldAt = (input: string, open: number): ParsedInlineField | undefined => {
  const openChar = input[open]
  const delimiter = openChar === "[" ? "square" : openChar === "(" ? "paren" : undefined
  if (delimiter === undefined) {
    return undefined
  }

  const closeChar = delimiter === "square" ? "]" : ")"
  const keyStart = open + 1
  const keyEnd = scanInlineFieldKey(input, keyStart)
  if (keyEnd === keyStart || input[keyEnd] !== ":" || input[keyEnd + 1] !== ":") {
    return undefined
  }

  const valueStart = skipInlineWhitespace(input, keyEnd + 2)
  const close = findInlineFieldClose(input, valueStart, closeChar)
  if (close === -1) {
    return undefined
  }

  return {
    field: {
      key: input.slice(keyStart, keyEnd),
      value: input.slice(valueStart, close).trim(),
      original: input.slice(open, close + 1),
      valueStart,
      valueEnd: close,
      span: { start: open, end: close + 1 },
      delimiter
    },
    next: close + 1
  }
}

const findNextFieldOpen = (input: string, cursor: number): number => {
  let index = cursor
  while (index < input.length) {
    const char = input[index]
    if (char === "[" || char === "(") {
      return index
    }
    index += 1
  }

  return -1
}

const scanInlineFieldKey = (input: string, keyStart: number): number => {
  const first = input.charCodeAt(keyStart)
  if (!isAsciiLetter(first)) {
    return keyStart
  }

  let index = keyStart + 1
  while (index < input.length && isInlineFieldKeyCode(input.charCodeAt(index))) {
    index += 1
  }

  return index
}

const findInlineFieldClose = (input: string, valueStart: number, closeChar: "]" | ")"): number => {
  let index = valueStart
  let squareDepth = 0
  let parenDepth = 0

  while (index < input.length) {
    if (input.startsWith("[[", index)) {
      const close = findWikilinkClose(input, index + 2)
      if (close === -1) {
        return -1
      }
      index = close + 2
      continue
    }

    const char = input[index]
    if (char === "[") {
      squareDepth += 1
      index += 1
      continue
    }

    if (char === "]") {
      if (squareDepth === 0 && closeChar === "]") {
        return index
      }
      if (squareDepth > 0) {
        squareDepth -= 1
      }
      index += 1
      continue
    }

    if (char === "(" && closeChar === ")") {
      parenDepth += 1
      index += 1
      continue
    }

    if (char === ")" && closeChar === ")") {
      if (parenDepth === 0) {
        return index
      }
      parenDepth -= 1
      index += 1
      continue
    }

    index += 1
  }

  return -1
}

const findWikilinkClose = (input: string, contentStart: number): number => {
  let index = contentStart
  while (index < input.length - 1) {
    if (input[index] === "]" && input[index + 1] === "]") {
      return index
    }
    index += 1
  }

  return -1
}

const skipInlineWhitespace = (input: string, cursor: number): number => {
  let index = cursor
  while (index < input.length && isInlineWhitespace(input.charCodeAt(index))) {
    index += 1
  }

  return index
}

const collapseWhitespace = (input: string): string => input.trim().replace(/\s{2,}/g, " ")

const isAsciiLetter = (code: number): boolean => (code >= 65 && code <= 90) || (code >= 97 && code <= 122)

const isAsciiDigit = (code: number): boolean => code >= 48 && code <= 57

const isInlineFieldKeyCode = (code: number): boolean =>
  isAsciiLetter(code) || isAsciiDigit(code) || code === 45 || code === 95

const isInlineWhitespace = (code: number): boolean =>
  code === 9 || code === 10 || code === 11 || code === 12 || code === 13 || code === 32
