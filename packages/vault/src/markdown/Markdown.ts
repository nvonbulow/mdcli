import * as MarkdownAst from "@kb/markdown-ast"
import { Chunk, Option } from "effect"
import * as Effect from "effect/Effect"

import { MarkdownFile, type SourcePosition } from "./MarkdownModel"
import { MarkdownParser } from "./MarkdownParser"

export const Markdown = {
  parse: (markdown: string) =>
    Effect.gen(function* () {
      const parser = yield* MarkdownParser
      return yield* parser.parse(markdown)
    }),
  root: (file: MarkdownFile): MarkdownAst.Root => rootOf(file),
  collect: <NodeType = MarkdownNode>(
    fileOrNode: MarkdownFile | MarkdownNode,
    type: string
  ): Chunk.Chunk<NodeType> => Chunk.fromIterable(collectNodes<NodeType>(nodeOf(fileOrNode), type)),
  visit: (fileOrNode: MarkdownFile | MarkdownNode, visitor: Visitor): void => MarkdownAst.visit(nodeOf(fileOrNode), visitor),
  position: (nodeOrPosition: unknown): SourcePosition | undefined => positionOf(nodeOrPosition),
  sourceLine: (file: MarkdownFile, nodeOrPosition: unknown): string | undefined => {
    const position = positionOf(nodeOrPosition)
    const line = position?.start.line
    if (line === undefined) {
      return undefined
    }
    return sourceLine(file.contents, line)
  },
  frontmatter: (file: MarkdownFile): Chunk.Chunk<MarkdownAst.YamlFrontmatterNode> =>
    Chunk.fromIterable(optionIterable(MarkdownAst.yamlFrontmatterNode(rootOf(file)))),
  headings: (file: MarkdownFile): Chunk.Chunk<MarkdownAst.HeadingNode> => Chunk.fromIterable(MarkdownAst.headings(rootOf(file))),
  wikilinks: (file: MarkdownFile): Chunk.Chunk<MarkdownAst.WikilinkNode> =>
    Chunk.fromIterable(MarkdownAst.wikilinks(rootOf(file))),
  tags: (file: MarkdownFile): Chunk.Chunk<MarkdownAst.MarkdownTagNode> => Chunk.fromIterable(MarkdownAst.tags(rootOf(file))),
  listItems: (file: MarkdownFile): Chunk.Chunk<MarkdownAst.ListItemNode> =>
    Chunk.fromIterable(MarkdownAst.listItems(rootOf(file))),
  tasks: (file: MarkdownFile): Chunk.Chunk<MarkdownAst.ListItemNode> =>
    Chunk.filter(Markdown.listItems(file), (item) => Option.isSome(item.checked)),
  fencedBlocks: (file: MarkdownFile): Chunk.Chunk<MarkdownAst.CodeNode> =>
    Chunk.fromIterable(MarkdownAst.fencedBlocks(rootOf(file))),
  text: (node: MarkdownNode): string => MarkdownAst.nodeText(node),
  listItemText: (node: MarkdownAst.ListItemNode): string => MarkdownAst.listItemText(node),
  fencedBlockLanguage: (node: MarkdownAst.CodeNode): string | undefined => optionValue(node.lang),
  fencedBlockMeta: (node: MarkdownAst.CodeNode): string | undefined => optionValue(node.meta)
} as const

type MarkdownNode = MarkdownAst.AnyNode

type Visitor = (node: MarkdownNode) => void

const rootOf = (file: MarkdownFile): MarkdownAst.Root => file.mdast

const nodeOf = (fileOrNode: MarkdownFile | MarkdownNode): MarkdownNode =>
  "mdast" in fileOrNode ? fileOrNode.mdast : fileOrNode

const collectNodes = <NodeType>(node: MarkdownNode, type: string): ReadonlyArray<NodeType> =>
  Array.from(
    MarkdownAst.findAll(node, ({ node }) => node.type === type),
    ({ node }) => node as NodeType
  )

const positionOf = (nodeOrPosition: unknown): SourcePosition | undefined => {
  if (nodeOrPosition === undefined || nodeOrPosition === null || typeof nodeOrPosition !== "object") {
    return undefined
  }
  const positioned = nodeOrPosition as Partial<SourcePosition> & { readonly position?: SourcePosition }
  return "start" in positioned ? (positioned as SourcePosition) : positioned.position
}

const sourceLine = (contents: string, lineNumber: number): string | undefined => {
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

const optionValue = <Value>(option: Option.Option<Value>): Value | undefined =>
  Option.isSome(option) ? option.value : undefined

function* optionIterable<Value>(option: Option.Option<Value>): Iterable<Value> {
  if (Option.isSome(option)) {
    yield option.value
  }
}
