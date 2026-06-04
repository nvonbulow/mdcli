import type {
  Break,
  Delete,
  Emphasis,
  FootnoteReference,
  Html,
  Image,
  ImageReference,
  InlineCode,
  Link,
  LinkReference,
  Strong,
  Text
} from "mdast"
import type { Node, Position } from "unist"

import type { BlockAnchor } from "./block-anchor.js"
import { optionalPosition, relativePosition } from "./position.js"
import type { Wikilink } from "./wikilink.js"

export type InlineDataFieldDelimiter = "square" | "paren"

export type InlineDataFieldContent =
  | BlockAnchor
  | Break
  | Delete
  | Emphasis
  | FootnoteReference
  | Html
  | Image
  | ImageReference
  | InlineCode
  | Link
  | LinkReference
  | Strong
  | Text
  | Wikilink

export interface InlineDataField extends Node {
  readonly type: "inlineDataField"
  readonly children: readonly [InlineDataFieldKey, InlineDataFieldValue]
  readonly delimiter: InlineDataFieldDelimiter
  readonly original: string
  readonly position?: Position
}

export interface InlineDataFieldKey extends Node {
  readonly type: "inlineDataFieldKey"
  readonly children: ReadonlyArray<InlineDataFieldContent>
  readonly position?: Position
}

export interface InlineDataFieldValue extends Node {
  readonly type: "inlineDataFieldValue"
  readonly children: ReadonlyArray<InlineDataFieldContent>
  readonly position?: Position
}

type InlineDataFieldSpan = {
  readonly delimiter: InlineDataFieldDelimiter
  readonly spanStart: number
  readonly spanEnd: number
  readonly keyStart: number
  readonly keyEnd: number
  readonly valueStart: number
  readonly valueEnd: number
  readonly next: number
  readonly valid: boolean
}

export const parseInlineDataFields = (input: string, base: Position | undefined): Array<InlineDataField | Text> => {
  const output: Array<InlineDataField | Text> = []
  let cursor = 0
  let search = 0

  while (search < input.length) {
    const open = findNextFieldOpen(input, search)
    if (open === -1) {
      pushText(output, input, base, cursor, input.length)
      return output
    }

    const parsed = parseInlineDataFieldAt(input, open, true)
    if (parsed === undefined) {
      search = open + 1
      continue
    }

    if (!parsed.valid) {
      pushText(output, input, base, cursor, parsed.next)
      cursor = parsed.next
      search = parsed.next
      continue
    }

    pushText(output, input, base, cursor, open)
    output.push(inlineDataFieldNode(input, base, parsed))
    cursor = parsed.next
    search = parsed.next
  }

  pushText(output, input, base, cursor, input.length)
  return output
}

export const inlineDataFieldText = (children: ReadonlyArray<InlineDataFieldContent>): string => {
  let text = ""
  for (let index = 0; index < children.length; index++) {
    const child = children[index]
    if (child === undefined) {
      continue
    }
    if ("value" in child && typeof child.value === "string") {
      text += child.value
      continue
    }
    if ("children" in child) {
      text += inlineDataFieldText(child.children as ReadonlyArray<InlineDataFieldContent>)
    }
  }
  return text
}

export const stripInlineDataFields = (input: string): string => {
  let output = ""
  let cursor = 0
  let search = 0

  while (search < input.length) {
    const open = findNextFieldOpen(input, search)
    if (open === -1) {
      output += input.slice(cursor)
      break
    }

    const parsed = parseInlineDataFieldAt(input, open, true)
    if (parsed === undefined || !parsed.valid) {
      search = open + 1
      continue
    }

    output += input.slice(cursor, open)
    cursor = parsed.next
    search = parsed.next
  }

  return output.trim().replace(/\s{2,}/g, " ")
}

const inlineDataFieldNode = (input: string, base: Position | undefined, span: InlineDataFieldSpan): InlineDataField => {
  const key: InlineDataFieldKey = {
    type: "inlineDataFieldKey",
    children: textSegment(input, base, span.keyStart, span.keyEnd),
    ...optionalPosition(relativePosition(input, base, { start: span.keyStart, end: span.keyEnd }))
  }
  const value: InlineDataFieldValue = {
    type: "inlineDataFieldValue",
    children: textSegment(input, base, span.valueStart, span.valueEnd),
    ...optionalPosition(relativePosition(input, base, { start: span.valueStart, end: span.valueEnd }))
  }

  return {
    type: "inlineDataField",
    children: [key, value],
    delimiter: span.delimiter,
    original: input.slice(span.spanStart, span.spanEnd),
    ...optionalPosition(relativePosition(input, base, { start: span.spanStart, end: span.spanEnd }))
  }
}

const textSegment = (input: string, base: Position | undefined, start: number, end: number): ReadonlyArray<Text> => {
  if (start >= end) {
    return []
  }
  return [textNode(input, base, start, end)]
}

const pushText = (output: Array<InlineDataField | Text>, input: string, base: Position | undefined, start: number, end: number): void => {
  if (start >= end) {
    return
  }
  output.push(textNode(input, base, start, end))
}

const textNode = (input: string, base: Position | undefined, start: number, end: number): Text => ({
  type: "text",
  value: input.slice(start, end),
  ...optionalPosition(relativePosition(input, base, { start, end }))
})

const parseInlineDataFieldAt = (
  input: string,
  open: number,
  checkNested: boolean
): InlineDataFieldSpan | undefined => {
  const openChar = input[open]
  const delimiter = openChar === "[" ? "square" : openChar === "(" ? "paren" : undefined
  if (delimiter === undefined) {
    return undefined
  }

  const closeChar = delimiter === "square" ? "]" : ")"
  const delimiterAt = findKeyDelimiter(input, open + 1, closeChar)
  if (delimiterAt === -1) {
    return undefined
  }

  const keyStart = trimInlineStart(input, open + 1, delimiterAt)
  const keyEnd = trimInlineEnd(input, keyStart, delimiterAt)
  if (keyStart >= keyEnd) {
    return undefined
  }

  const valueStart = trimInlineStart(input, delimiterAt + 2, input.length)
  const close = findInlineFieldClose(input, valueStart, closeChar)
  if (close === -1) {
    return undefined
  }
  const valueEnd = trimInlineEnd(input, valueStart, close)
  const valid = !checkNested || (!containsInlineDataField(input, keyStart, keyEnd) && !containsInlineDataField(input, valueStart, valueEnd))

  return {
    delimiter,
    spanStart: open,
    spanEnd: close + 1,
    keyStart,
    keyEnd,
    valueStart,
    valueEnd,
    next: close + 1,
    valid
  }
}

const containsInlineDataField = (input: string, start: number, end: number): boolean => {
  let cursor = start
  while (cursor < end) {
    const open = findNextFieldOpen(input, cursor)
    if (open === -1 || open >= end) {
      return false
    }
    const parsed = parseInlineDataFieldAt(input, open, false)
    if (parsed !== undefined && parsed.spanEnd <= end) {
      return true
    }
    cursor = open + 1
  }
  return false
}

const findNextFieldOpen = (input: string, cursor: number): number => {
  let index = cursor
  while (index < input.length) {
    if (input.startsWith("[[", index)) {
      const close = findWikilinkClose(input, index + 2)
      if (close !== -1) {
        index = close + 2
        continue
      }
    }

    const char = input[index]
    if (char === "[" || char === "(") {
      return index
    }
    index += 1
  }
  return -1
}

const findKeyDelimiter = (input: string, keyStart: number, closeChar: "]" | ")"): number => {
  let index = keyStart
  while (index < input.length - 1) {
    const code = input.charCodeAt(index)
    if (code === 10 || code === 13 || input[index] === closeChar) {
      return -1
    }
    if (input.startsWith("[[", index)) {
      const close = findWikilinkClose(input, index + 2)
      if (close === -1) {
        return -1
      }
      index = close + 2
      continue
    }
    if (input[index] === ":" && input[index + 1] === ":") {
      return index
    }
    index += 1
  }
  return -1
}

const findInlineFieldClose = (input: string, valueStart: number, closeChar: "]" | ")"): number => {
  let index = valueStart
  let squareDepth = 0
  let parenDepth = 0

  while (index < input.length) {
    const code = input.charCodeAt(index)
    if (code === 10 || code === 13) {
      return -1
    }
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

const trimInlineStart = (input: string, start: number, end: number): number => {
  let index = start
  while (index < end && isInlineWhitespace(input.charCodeAt(index))) {
    index += 1
  }
  return index
}

const trimInlineEnd = (input: string, start: number, end: number): number => {
  let index = end
  while (index > start && isInlineWhitespace(input.charCodeAt(index - 1))) {
    index -= 1
  }
  return index
}

const isInlineWhitespace = (code: number): boolean =>
  code === 9 || code === 10 || code === 11 || code === 12 || code === 13 || code === 32
