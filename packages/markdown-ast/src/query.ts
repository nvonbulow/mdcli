import { Iterable, Option, Schema } from "effect"

import {
  HeadingLevel,
  HeadingNode as HeadingNodeSchema,
  type AnyNode,
  type BlockAnchorNode,
  type HeadingNode,
  type InlineDataFieldKeyNode,
  type InlineDataFieldNode,
  type InlineDataFieldValueNode,
  type PhrasingContentNode,
  type WikilinkNode,
  type YamlFrontmatterNode
} from "./schema.js"
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

export const inlineDataFieldsWithKey = (key: string) => (node: AnyNode): Iterable<InlineDataFieldNode> =>
  Iterable.filter(inlineDataFields(node), (field) => inlineDataFieldKeyText(field) === key)
