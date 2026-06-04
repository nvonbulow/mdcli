import type { Root } from "mdast"
import { findAndReplace } from "mdast-util-find-and-replace"
import type { Node, Position } from "unist"
import type { Plugin, Processor, Transformer } from "unified"

import { blockAnchorMarkdown, blockAnchorNode, blockAnchorPattern, type BlockAnchor } from "./block-anchor.js"
import {
  inlineDataFieldText,
  parseInlineDataFields,
  stripInlineDataFields,
  type InlineDataField,
  type InlineDataFieldContent,
  type InlineDataFieldKey,
  type InlineDataFieldValue
} from "./inline-data-field.js"
import { relativePosition } from "./position.js"
import { parseWikilinkMarkdown, wikilinkMarkdown, wikilinkPattern, type Wikilink } from "./wikilink.js"

export type { BlockAnchor } from "./block-anchor.js"
export type {
  InlineDataField,
  InlineDataFieldContent,
  InlineDataFieldDelimiter,
  InlineDataFieldKey,
  InlineDataFieldValue
} from "./inline-data-field.js"
export { inlineDataFieldText, stripInlineDataFields } from "./inline-data-field.js"
export type { Wikilink } from "./wikilink.js"

declare module "mdast" {
  interface PhrasingContentMap {
    wikilink: Wikilink
    blockAnchor: BlockAnchor
    inlineDataField: InlineDataField
  }
}

export type RemarkPluginOptions = Record<string, never>

type ToMarkdownState = {
  readonly safe: (value: string, info: unknown) => string
  readonly containerPhrasing: (node: { readonly children: ReadonlyArray<Node> }, info: unknown) => string
}

type ToMarkdownHandler<Value extends Node> = (
  node: Value,
  parent: Node | undefined,
  state: ToMarkdownState,
  info: unknown
) => string

type ToMarkdownExtension = {
  readonly handlers: {
    readonly wikilink: ToMarkdownHandler<Wikilink>
    readonly blockAnchor: ToMarkdownHandler<BlockAnchor>
    readonly inlineDataField: ToMarkdownHandler<InlineDataField>
    readonly inlineDataFieldKey: ToMarkdownHandler<InlineDataFieldKey>
    readonly inlineDataFieldValue: ToMarkdownHandler<InlineDataFieldValue>
  }
}

type ToMarkdownData = Record<string, unknown> & {
  toMarkdownExtensions?: ToMarkdownExtension[]
}

type NodeWithChildren = Node & {
  children?: Node[]
}

type MatchInfo = {
  readonly index: number
  readonly input: string
  readonly stack: ReadonlyArray<Node>
}

type TextNode = Node & {
  readonly position?: Position
}

export const remarkPlugin: Plugin<[RemarkPluginOptions?], Root> = function remarkPlugin(this: Processor): Transformer<Root> {
  const data = this.data() as ToMarkdownData
  const extensions = data.toMarkdownExtensions ?? (data.toMarkdownExtensions = [])
  extensions.push(pluginToMarkdownExtension)

  return (tree) => {
    insertInlineDataFields(tree as NodeWithChildren)
    insertWikilinksAndBlockAnchors(tree)
  }
}

const insertInlineDataFields = (node: NodeWithChildren): void => {
  const children = node.children
  if (children === undefined) {
    return
  }

  let index = 0
  while (index < children.length) {
    const child = children[index]
    if (child === undefined) {
      index += 1
      continue
    }

    if (child.type === "text" && "value" in child && typeof child.value === "string") {
      const replacement = parseInlineDataFields(child.value, child.position)
      children.splice(index, 1, ...replacement)
      index += replacement.length
      continue
    }

    insertInlineDataFields(child as NodeWithChildren)
    index += 1
  }
}

const insertWikilinksAndBlockAnchors = (tree: Root): void => {
  findAndReplace(tree, [
    [wikilinkPattern, replaceWikilink],
    [blockAnchorPattern, replaceBlockAnchor]
  ])
}

const replaceWikilink = (value: string, match: MatchInfo): Wikilink | false => {
  const position = matchPosition(value, match)
  return parseWikilinkMarkdown(value, position) ?? false
}

const replaceBlockAnchor = (value: string, id: string, match: MatchInfo): BlockAnchor =>
  blockAnchorNode(id, value, matchPosition(value, match))

const matchPosition = (value: string, match: MatchInfo): Position | undefined => {
  const text = match.stack[match.stack.length - 1] as TextNode | undefined
  return relativePosition(match.input, text?.position, { start: match.index, end: match.index + value.length })
}

const pluginToMarkdownExtension: ToMarkdownExtension = {
  handlers: {
    wikilink: (node) => wikilinkMarkdown(node),
    blockAnchor: (node) => blockAnchorMarkdown(node),
    inlineDataField: (node, _parent, state, info) => inlineDataFieldMarkdown(node, state, info),
    inlineDataFieldKey: (node, _parent, state, info) => state.containerPhrasing(node, info),
    inlineDataFieldValue: (node, _parent, state, info) => state.containerPhrasing(node, info)
  }
}

const inlineDataFieldMarkdown = (node: InlineDataField, state: ToMarkdownState, info: unknown): string => {
  const [key, value] = node.children
  const open = node.delimiter === "paren" ? "(" : "["
  const close = node.delimiter === "paren" ? ")" : "]"
  const keyMarkdown = state.containerPhrasing(key, info)
  const valueMarkdown = state.containerPhrasing(value, info)
  return `${open}${keyMarkdown}:: ${valueMarkdown}${close}`
}

const _typecheckInlineDataFieldContent: InlineDataFieldContent | undefined = undefined
void _typecheckInlineDataFieldContent
