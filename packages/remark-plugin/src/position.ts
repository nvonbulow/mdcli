import type { Position } from "unist"

export type SourceSpan = {
  readonly start: number
  readonly end: number
}

export const optionalString = <Key extends string>(key: Key, value: string | undefined): Partial<Record<Key, string>> => {
  if (value === undefined || value.length === 0) {
    return {}
  }
  return { [key]: value } as Partial<Record<Key, string>>
}

export const optionalPosition = (position: Position | undefined): Partial<{ readonly position: Position }> => {
  if (position === undefined) {
    return {}
  }
  return { position }
}

export const relativePosition = (input: string, base: Position | undefined, span: SourceSpan): Position | undefined => {
  if (base === undefined) {
    return undefined
  }
  const start = advancePoint(input, base.start, span.start)
  const end = advancePoint(input, base.start, span.end)
  return { start, end }
}

const advancePoint = (input: string, start: Position["start"], offset: number): Position["start"] => {
  let line = start.line
  let column = start.column
  const absoluteOffset = start.offset === undefined ? undefined : start.offset + offset
  let index = 0
  while (index < offset && index < input.length) {
    if (input.charCodeAt(index) === 10) {
      line += 1
      column = 1
    } else {
      column += 1
    }
    index += 1
  }
  return absoluteOffset === undefined ? { line, column } : { line, column, offset: absoluteOffset }
}
