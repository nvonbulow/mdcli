import * as MarkdownAst from "@kb/markdown-ast"
import { Chunk, Option } from "effect"
import * as Effect from "effect/Effect"

import { MarkdownFile, type SourcePosition } from "./MarkdownModel"
import { MarkdownParser } from "./MarkdownParser"

export const parse = (markdown: string) =>
  Effect.gen(function* () {
    const parser = yield* MarkdownParser
    return yield* parser.parse(markdown)
  })

export const root = (file: MarkdownFile): MarkdownAst.Root => file.mdast

export const sourceLine = (file: MarkdownFile, nodeOrPosition: unknown): string | undefined => {
  const position = positionOf(nodeOrPosition)
  const line = position?.start.line
  if (line === undefined) {
    return undefined
  }
  return lineOf(file.contents, line)
}

export const frontmatter = (file: MarkdownFile): Chunk.Chunk<MarkdownAst.YamlFrontmatterNode> =>
  Chunk.fromIterable(optionIterable(MarkdownAst.yamlFrontmatterNode(root(file))))

export const headings = (file: MarkdownFile): Chunk.Chunk<MarkdownAst.HeadingNode> =>
  Chunk.fromIterable(MarkdownAst.headings(root(file)))

export const wikilinks = (file: MarkdownFile): Chunk.Chunk<MarkdownAst.WikilinkNode> =>
  Chunk.fromIterable(MarkdownAst.wikilinks(root(file)))

export const tags = (file: MarkdownFile): Chunk.Chunk<MarkdownAst.MarkdownTagNode> =>
  Chunk.fromIterable(MarkdownAst.tags(root(file)))

export const listItems = (file: MarkdownFile): Chunk.Chunk<MarkdownAst.ListItemNode> =>
  Chunk.fromIterable(MarkdownAst.listItems(root(file)))

export const tasks = (file: MarkdownFile): Chunk.Chunk<MarkdownAst.ListItemNode> =>
  Chunk.filter(listItems(file), (item) => Option.isSome(item.checked))

export const fencedBlocks = (file: MarkdownFile): Chunk.Chunk<MarkdownAst.CodeNode> =>
  Chunk.fromIterable(MarkdownAst.fencedBlocks(root(file)))

const positionOf = (nodeOrPosition: unknown): SourcePosition | undefined => {
  if (nodeOrPosition === undefined || nodeOrPosition === null || typeof nodeOrPosition !== "object") {
    return undefined
  }
  const positioned = nodeOrPosition as Partial<SourcePosition> & { readonly position?: SourcePosition }
  return "start" in positioned ? (positioned as SourcePosition) : positioned.position
}

const lineOf = (contents: string, lineNumber: number): string | undefined => {
  let currentLine = 1
  let lineStart = 0
  let index = 0
  while (index < contents.length) {
    if (contents.charCodeAt(index) === 10) {
      if (currentLine === lineNumber) {
        return contents.slice(lineStart, index)
      }
      currentLine += 1
      lineStart = index + 1
    }
    index += 1
  }
  return currentLine === lineNumber ? contents.slice(lineStart) : undefined
}

function* optionIterable<Value>(option: Option.Option<Value>): Iterable<Value> {
  if (Option.isSome(option)) {
    yield option.value
  }
}
