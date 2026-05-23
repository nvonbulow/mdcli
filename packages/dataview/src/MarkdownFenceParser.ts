import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { DataviewMarkdownBlockRenderError } from "./DataviewErrors"

export type DataviewMarkdownRenderError = DataviewMarkdownBlockRenderError

export type MarkdownFencePart = MarkdownTextPart | DataviewFencePart

export type MarkdownTextPart = {
  readonly _tag: "Markdown"
  readonly text: string
}

export type DataviewFencePart = {
  readonly _tag: "DataviewFence"
  readonly query: string
  readonly raw: string
  readonly line: number
}

export type MarkdownFenceParserService = {
  readonly parse: (markdown: string) => Effect.Effect<ReadonlyArray<MarkdownFencePart>, DataviewMarkdownRenderError>
}

export class MarkdownFenceParser extends Context.Service<MarkdownFenceParser, MarkdownFenceParserService>()(
  "@kb/dataview/MarkdownFenceParser"
) {
  static readonly layerNoDeps: Layer.Layer<MarkdownFenceParser> = Layer.effect(
    this,
    Effect.sync(() => this.of({ parse }))
  )
}

const parse = Effect.fn("MarkdownFenceParser.parse")((markdown: string) => parseMarkdownDataviewFences(markdown))

type FenceMarker = {
  readonly character: "`" | "~"
  readonly length: number
}

type FenceOpener = FenceMarker & {
  readonly info: string
}

const parseMarkdownDataviewFences = (
  markdown: string
): Effect.Effect<ReadonlyArray<MarkdownFencePart>, DataviewMarkdownRenderError> => {
  const parts: Array<MarkdownFencePart> = []
  let cursor = 0
  let index = 0
  let line = 1

  while (index < markdown.length) {
    const lineStart = index
    const lineEnd = nextLineEnd(markdown, index)
    const lineRaw = markdown.slice(lineStart, lineEnd)
    const opener = parseFenceOpener(stripLineEnding(lineRaw))

    if (opener === undefined) {
      index = lineEnd
      line += 1
      continue
    }

    if (opener.info !== "dataview") {
      index = lineEnd
      line += 1
      while (index < markdown.length) {
        const candidateEnd = nextLineEnd(markdown, index)
        const candidateRaw = markdown.slice(index, candidateEnd)
        index = candidateEnd
        line += 1
        if (isFenceCloser(stripLineEnding(candidateRaw), opener)) {
          break
        }
      }
      continue
    }

    const blockStartLine = line
    const contentStart = lineEnd
    let contentEnd = lineEnd
    index = lineEnd
    line += 1
    let closed = false

    while (index < markdown.length) {
      const candidateStart = index
      const candidateEnd = nextLineEnd(markdown, index)
      const candidateRaw = markdown.slice(candidateStart, candidateEnd)
      if (isFenceCloser(stripLineEnding(candidateRaw), opener)) {
        contentEnd = candidateStart
        index = candidateEnd
        line += 1
        closed = true
        break
      }
      index = candidateEnd
      line += 1
    }

    if (!closed) {
      return Effect.fail(
        new DataviewMarkdownBlockRenderError({
          message: "Unclosed dataview fence",
          block: markdown.slice(lineStart),
          line: blockStartLine
        })
      )
    }

    if (cursor < lineStart) {
      parts.push({ _tag: "Markdown", text: markdown.slice(cursor, lineStart) })
    }
    parts.push({
      _tag: "DataviewFence",
      query: markdown.slice(contentStart, contentEnd),
      raw: markdown.slice(lineStart, index),
      line: blockStartLine
    })
    cursor = index
  }

  if (cursor < markdown.length) {
    parts.push({ _tag: "Markdown", text: markdown.slice(cursor) })
  }

  return Effect.succeed(parts)
}

const nextLineEnd = (value: string, index: number): number => {
  const newline = value.indexOf("\n", index)
  return newline === -1 ? value.length : newline + 1
}

const stripLineEnding = (line: string): string => {
  if (line.endsWith("\r\n")) {
    return line.slice(0, -2)
  }
  if (line.endsWith("\n")) {
    return line.slice(0, -1)
  }
  return line
}

const parseFenceOpener = (line: string): FenceOpener | undefined => {
  const marker = parseFenceMarker(line)
  if (marker === undefined) {
    return undefined
  }
  return {
    character: marker.character,
    length: marker.length,
    info: line.slice(markerEndIndex(line, marker.character)).trim()
  }
}

const parseFenceMarker = (line: string): FenceMarker | undefined => {
  const start = fenceStartIndex(line)
  if (start === undefined) {
    return undefined
  }
  const character = line[start]
  if (character !== "`" && character !== "~") {
    return undefined
  }
  const length = markerLength(line, start, character)
  return length < 3 ? undefined : { character, length }
}

const fenceStartIndex = (line: string): number | undefined => {
  let index = 0
  while (index < line.length && line[index] === " " && index < 4) {
    index += 1
  }
  return index > 3 ? undefined : index
}

const markerLength = (line: string, start: number, character: "`" | "~"): number => {
  let index = start
  while (line[index] === character) {
    index += 1
  }
  return index - start
}

const markerEndIndex = (line: string, character: "`" | "~"): number => {
  const start = fenceStartIndex(line) ?? 0
  return start + markerLength(line, start, character)
}

const isFenceCloser = (line: string, opener: FenceMarker): boolean => {
  const marker = parseFenceMarker(line)
  if (marker === undefined || marker.character !== opener.character || marker.length < opener.length) {
    return false
  }
  return line.slice(markerEndIndex(line, opener.character)).trim().length === 0
}
