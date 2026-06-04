import { Effect, Iterable, Option, Schema } from "effect"

import {
  HeadingLevel,
  HeadingNode as HeadingNodeSchema,
  type AnyNode,
  type BlockAnchorNode,
  type CodeNode,
  type HeadingNode,
  type InlineDataFieldKeyNode,
  type InlineDataFieldNode,
  type InlineDataFieldValueNode,
  type ListItemNode,
  type PhrasingContentNode,
  type TextNode,
  type SourcePosition,
  type WikilinkNode,
  type YamlFrontmatterNode
} from "./schema.js"
import { MarkdownProcessor, type MarkdownStringifyError } from "./processor.js"
import { findAll } from "./visit.js"

type TableOfContentsEntryShape = {
  readonly heading: HeadingNode
  readonly depth: typeof HeadingLevel.Type
  readonly text: string
  readonly children: ReadonlyArray<TableOfContentsEntryShape>
}

export const TableOfContentsEntry: Schema.Codec<TableOfContentsEntryShape, unknown> = Schema.Struct({
  heading: HeadingNodeSchema,
  depth: HeadingLevel,
  text: Schema.String,
  children: Schema.Array(Schema.suspend((): Schema.Codec<TableOfContentsEntryShape, unknown> => TableOfContentsEntry))
})
export type TableOfContentsEntry = typeof TableOfContentsEntry.Type

const childrenText = (children: ReadonlyArray<PhrasingContentNode>): string => {
  let text = ""
  for (let index = 0; index < children.length; index++) {
    const child = children[index]
    if (child !== undefined) {
      text += phrasingText(child)
    }
  }
  return text
}

const phrasingText = (node: PhrasingContentNode): string => {
  switch (node._tag) {
    case "TextNode":
    case "InlineCodeNode":
    case "WikilinkNode": {
      return node.value
    }
    case "InlineDataFieldNode": {
      return inlineDataFieldValueText(node)
    }
    case "DeleteNode":
    case "EmphasisNode":
    case "LinkNode":
    case "LinkReferenceNode":
    case "StrongNode": {
      return childrenText(node.children)
    }
    default: {
      return ""
    }
  }
}

export const headingText = (node: HeadingNode): string => childrenText(node.children)

export const nodeText = (node: AnyNode): string => {
  switch (node._tag) {
    case "CodeNode":
    case "HtmlNode":
    case "InlineCodeNode":
    case "TextNode":
    case "WikilinkNode": {
      return node.value
    }
    case "InlineDataFieldNode": {
      return inlineDataFieldValueText(node)
    }
    case "BreakNode":
    case "DefinitionNode":
    case "FootnoteReferenceNode":
    case "ImageNode":
    case "ImageReferenceNode":
    case "ThematicBreakNode":
    case "YamlFrontmatterNode": {
      return ""
    }
    default: {
      return childrenTextOfAny(node)
    }
  }
}

export const listItemText = (node: ListItemNode): string => {
  for (const child of node.children) {
    if (child._tag === "ParagraphNode") {
      return firstLine(nodeText(child))
    }
  }
  return firstLine(nodeTextWithoutNestedLists(node))
}

const firstLine = (text: string): string => {
  const newline = text.indexOf("\n")
  return newline === -1 ? text : text.slice(0, newline)
}

const childrenTextOfAny = (node: AnyNode): string => {
  if (!("children" in node)) {
    return ""
  }
  let text = ""
  for (const child of node.children as ReadonlyArray<AnyNode>) {
    text += nodeText(child)
  }
  return text
}

const nodeTextWithoutNestedLists = (node: AnyNode): string => {
  if (node._tag === "ListNode") {
    return ""
  }
  if (!("children" in node)) {
    return "value" in node && typeof node.value === "string" ? node.value : ""
  }
  let text = ""
  for (const child of node.children as ReadonlyArray<AnyNode>) {
    text += nodeTextWithoutNestedLists(child)
  }
  return text
}

export const tableOfContents = (node: AnyNode): ReadonlyArray<TableOfContentsEntry> => {
  const rootEntries: Array<TableOfContentsEntry> = []
  const stack: Array<TableOfContentsEntry> = []

  for (const cursor of findAll(node, ({ node }) => node._tag === "HeadingNode")) {
    const heading = cursor.node as HeadingNode
    const entry: TableOfContentsEntry = {
      heading,
      depth: heading.depth,
      text: headingText(heading),
      children: []
    }

    while (stack.length > 0 && stack[stack.length - 1]!.depth >= heading.depth) {
      stack.pop()
    }

    const parent = stack[stack.length - 1]
    if (parent === undefined) {
      rootEntries.push(entry)
    } else {
      ;(parent.children as Array<TableOfContentsEntry>).push(entry)
    }
    stack.push(entry)
  }

  return rootEntries
}

export const yamlFrontmatterNode = (node: AnyNode): Option.Option<YamlFrontmatterNode> => {
  for (const cursor of findAll(node, ({ node }) => node._tag === "YamlFrontmatterNode")) {
    return Option.some(cursor.node as YamlFrontmatterNode)
  }
  return Option.none()
}

export const yamlFrontmatter = (node: AnyNode): Option.Option<YamlFrontmatterNode["value"]> =>
  Option.map(yamlFrontmatterNode(node), (node) => node.value)

export const headings = (node: AnyNode): Iterable<HeadingNode> =>
  Iterable.map(
    findAll(node, ({ node }) => node._tag === "HeadingNode"),
    ({ node }) => node as HeadingNode
  )

export const listItems = (node: AnyNode): Iterable<ListItemNode> =>
  Iterable.map(
    findAll(node, ({ node }) => node._tag === "ListItemNode"),
    ({ node }) => node as ListItemNode
  )

export const fencedBlocks = (node: AnyNode): Iterable<CodeNode> =>
  Iterable.map(
    findAll(node, ({ node }) => node._tag === "CodeNode"),
    ({ node }) => node as CodeNode
  )

export type MarkdownTagNode = {
  readonly _tag: "MarkdownTagNode"
  readonly type: "tag"
  readonly value: string
  readonly original: string
  readonly position?: SourcePosition
}

export const tags = (node: AnyNode): Iterable<MarkdownTagNode> =>
  Iterable.flatMap(
    findAll(
      node,
      ({ node, parents }) =>
        node._tag === "TextNode" && !parents.some((parent) => parent._tag === "InlineDataFieldNode")
    ),
    ({ node }) => tagsInTextNode(node as TextNode)
  )

export const wikilinks = (node: AnyNode): Iterable<WikilinkNode> =>
  Iterable.map(
    findAll(node, ({ node }) => node._tag === "WikilinkNode"),
    ({ node }) => node as WikilinkNode
  )

export const wikilinksWithTarget = (target: string) => (node: AnyNode): Iterable<WikilinkNode> =>
  Iterable.filter(wikilinks(node), (link) => link.target === target)

export const blockAnchors = (node: AnyNode): Iterable<BlockAnchorNode> =>
  Iterable.map(
    findAll(node, ({ node }) => node._tag === "BlockAnchorNode"),
    ({ node }) => node as BlockAnchorNode
  )

export const inlineDataFields = (node: AnyNode): Iterable<InlineDataFieldNode> =>
  Iterable.map(
    findAll(node, ({ node }) => node._tag === "InlineDataFieldNode"),
    ({ node }) => node as InlineDataFieldNode
  )

export const inlineDataFieldKey = (node: InlineDataFieldNode): InlineDataFieldKeyNode => node.children[0]

export const inlineDataFieldValue = (node: InlineDataFieldNode): InlineDataFieldValueNode => node.children[1]

export const inlineDataFieldKeyText = (node: InlineDataFieldNode): string =>
  childrenText(inlineDataFieldKey(node).children)

export const inlineDataFieldValueText = (node: InlineDataFieldNode): string =>
  childrenText(inlineDataFieldValue(node).children)

export const inlineDataFieldValueMarkdown = (
  node: InlineDataFieldNode
): Effect.Effect<string, MarkdownStringifyError, MarkdownProcessor> =>
  Effect.gen(function* () {
    const processor = yield* MarkdownProcessor
    const markdown = yield* processor.stringify(inlineDataFieldValue(node))
    return trimTrailingDocumentNewline(markdown)
  })


const tagPattern = /#[A-Za-z0-9/_-]+\b/g

const tagsInTextNode = (node: TextNode): ReadonlyArray<MarkdownTagNode> => {
  const tags: Array<MarkdownTagNode> = []
  for (const match of node.value.matchAll(tagPattern)) {
    const original = match[0]
    if (original === undefined || match.index === undefined) {
      continue
    }
    tags.push({
      _tag: "MarkdownTagNode",
      type: "tag",
      value: original,
      original,
      ...tagPosition(node.position, node.value, match.index, original.length)
    })
  }
  return tags
}

const tagPosition = (
  position: SourcePosition | undefined,
  value: string,
  startIndex: number,
  length: number
): { readonly position?: SourcePosition } => {
  if (position === undefined) {
    return {}
  }
  const start = advancePoint(position.start, value, 0, startIndex)
  const end = advancePoint(start, value, startIndex, startIndex + length)
  return { position: { start, end } }
}

const advancePoint = (
  point: SourcePosition["start"],
  value: string,
  from: number,
  to: number
): SourcePosition["start"] => {
  let line = point.line
  let column = point.column
  for (let index = from; index < to; index++) {
    if (value.charCodeAt(index) === 10) {
      line += 1
      column = 1
    } else {
      column += 1
    }
  }
  return { line, column, offset: point.offset + to - from }
}

const trimTrailingDocumentNewline = (markdown: string): string =>
  markdown.endsWith("\n") ? markdown.slice(0, -1) : markdown

export const inlineDataFieldsWithKey = (key: string) => (node: AnyNode): Iterable<InlineDataFieldNode> =>
  Iterable.filter(inlineDataFields(node), (field) => inlineDataFieldKeyText(field) === key)
