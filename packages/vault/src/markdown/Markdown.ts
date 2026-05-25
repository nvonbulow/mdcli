import type { ObsidianInlineField, ObsidianListItem, ObsidianTag, ObsidianWikilink } from "@kb/remark-obsidian"

import type { Code, Heading, ListItem, Root, Yaml } from "mdast"
import { Chunk } from "effect"
import * as Effect from "effect/Effect"

import { MarkdownFile, type SourcePosition } from "./MarkdownModel"
import { MarkdownParser } from "./MarkdownParser"

export const Markdown = {
  parse: (markdown: string) =>
    Effect.gen(function* () {
      const parser = yield* MarkdownParser
      return yield* parser.parse(markdown)
    }),
  root: (file: MarkdownFile): Root & MarkdownNode => rootOf(file),
  collect: <NodeType = MarkdownNode>(
    fileOrNode: MarkdownFile | MarkdownNode,
    type: string
  ): Chunk.Chunk<NodeType> => Chunk.fromIterable(collectNodes<NodeType>(nodeOf(fileOrNode), type)),
  visit: (fileOrNode: MarkdownFile | MarkdownNode, visitor: Visitor): void => visitNode(nodeOf(fileOrNode), visitor),
  position: (nodeOrPosition: unknown): SourcePosition | undefined => positionOf(nodeOrPosition),
  sourceLine: (file: MarkdownFile, nodeOrPosition: unknown): string | undefined => {
    const position = positionOf(nodeOrPosition)
    const line = position?.start.line
    if (line === undefined) {
      return undefined
    }
    return sourceLine(file.contents, line)
  },
  frontmatter: (file: MarkdownFile): Chunk.Chunk<Yaml> => typedNodes<Yaml>(file, "yaml"),
  headings: (file: MarkdownFile): Chunk.Chunk<Heading> => typedNodes<Heading>(file, "heading"),
  wikilinks: (file: MarkdownFile): Chunk.Chunk<ObsidianWikilink> =>
    Chunk.fromIterable(collectWikilinks(rootOf(file))),
  tags: (file: MarkdownFile): Chunk.Chunk<ObsidianTag> => Chunk.fromIterable(collectTags(rootOf(file))),
  listItems: (file: MarkdownFile): Chunk.Chunk<ListItem> => typedNodes<ListItem>(file, "listItem"),
  tasks: (file: MarkdownFile): Chunk.Chunk<ObsidianListItem> => Chunk.fromIterable(collectTasks(rootOf(file))),
  fencedBlocks: (file: MarkdownFile): Chunk.Chunk<Code> => typedNodes<Code>(file, "code"),
  text: (node: unknown): string => nodeText(node),
  listItemText: (node: ListItem): string => listItemText(node),
  fencedBlockLanguage: (node: Code): string | undefined => node.lang ?? undefined,
  fencedBlockMeta: (node: Code): string | undefined => node.meta ?? undefined
} as const

type MarkdownNode = {
  readonly type: string
  readonly position?: SourcePosition
  readonly children?: ReadonlyArray<MarkdownNode>
  readonly value?: unknown
  readonly data?: Record<string, unknown> & {
    readonly obsidianWikilinks?: ReadonlyArray<ObsidianWikilink>
    readonly obsidianInlineFields?: ReadonlyArray<ObsidianInlineField>
    readonly obsidianTags?: ReadonlyArray<ObsidianTag>
  }
}

type Visitor = (node: MarkdownNode) => void

const rootOf = (file: MarkdownFile): Root & MarkdownNode => file.mdast as Root & MarkdownNode

const nodeOf = (fileOrNode: MarkdownFile | MarkdownNode): MarkdownNode =>
  "mdast" in fileOrNode ? (fileOrNode.mdast as MarkdownNode) : fileOrNode

const typedNodes = <NodeType>(file: MarkdownFile, type: string): Chunk.Chunk<NodeType> =>
  Chunk.fromIterable(collectNodes<NodeType>(rootOf(file), type))

const collectNodes = <NodeType>(node: MarkdownNode, type: string): ReadonlyArray<NodeType> => {
  const found: Array<NodeType> = []
  visitNode(node, (current) => {
    if (current.type === type) {
      found.push(current as NodeType)
    }
  })
  return found
}

const collectWikilinks = (root: Root & MarkdownNode): ReadonlyArray<ObsidianWikilink> => {
  const wikilinks: Array<ObsidianWikilink> = []
  visitNode(root, (node) => {
    if (node.type === "obsidianWikilink") {
      wikilinks.push(node as unknown as ObsidianWikilink)
    }
    const dataLinks = node.data?.obsidianWikilinks
    if (dataLinks !== undefined) {
      for (const link of dataLinks) {
        wikilinks.push(link)
      }
    }
  })
  return wikilinks
}

const collectTags = (root: Root & MarkdownNode): ReadonlyArray<ObsidianTag> => {
  const tags: Array<ObsidianTag> = []
  visitNode(root, (node) => {
    if (node.type === "obsidianTag") {
      tags.push(node as unknown as ObsidianTag)
    }
    const dataTags = node.data?.obsidianTags
    if (dataTags !== undefined) {
      for (const tag of dataTags) {
        tags.push(tag)
      }
    }
  })
  return tags
}

const collectTasks = (root: Root & MarkdownNode): ReadonlyArray<ObsidianListItem> => {
  const tasks: Array<ObsidianListItem> = []
  visitNode(root, (node) => {
    if (node.type === "listItem") {
      const item = node as unknown as ObsidianListItem
      if (item.data?.obsidianTask !== undefined) {
        tasks.push(item)
      }
    }
  })
  return tasks
}

const visitNode = (node: MarkdownNode, visitor: Visitor): void => {
  visitor(node)
  const children = node.children
  if (children === undefined) {
    return
  }
  for (const child of children) {
    visitNode(child, visitor)
  }
}

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

const nodeText = (node: unknown): string => {
  const markdownNode = node as MarkdownNode
  const literal = markdownNode.value
  if (typeof literal === "string") {
    return literal
  }
  const children = markdownNode.children
  if (children === undefined) {
    return ""
  }
  let text = ""
  for (const child of children) {
    text = text + nodeText(child)
  }
  return text
}

const listItemText = (node: unknown): string => {
  const markdownNode = node as MarkdownNode
  const children = markdownNode.children
  if (children === undefined) {
    return nodeTextWithoutNestedLists(markdownNode)
  }
  for (const child of children) {
    if (child.type === "paragraph") {
      return firstLine(nodeText(child))
    }
  }
  return nodeTextWithoutNestedLists(markdownNode)
}

const firstLine = (text: string): string => {
  const newline = text.indexOf("\n")
  if (newline === -1) {
    return text
  }
  return text.slice(0, newline)
}

const nodeTextWithoutNestedLists = (node: unknown): string => {
  const markdownNode = node as MarkdownNode
  const literal = markdownNode.value
  if (typeof literal === "string") {
    return literal
  }
  const children = markdownNode.children
  if (children === undefined) {
    return ""
  }
  let text = ""
  for (const child of children) {
    if (child.type !== "list") {
      text = text + nodeTextWithoutNestedLists(child)
    }
  }
  return text
}
