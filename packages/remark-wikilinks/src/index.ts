import { findAndReplace, type RegExpMatchObject } from "mdast-util-find-and-replace"
import type { Literal, Root, Text } from "mdast"
import type { Node, Position } from "unist"
import type { Plugin, Processor, Transformer } from "unified"

export interface Wikilink extends Literal {
  readonly type: "wikilink"
  readonly value: string
  readonly target: string
  readonly header?: string
  readonly alias?: string
  readonly block?: string
  readonly embed?: boolean
  readonly original: string
  readonly position?: Position
}

export interface BlockAnchor extends Literal {
  readonly type: "blockAnchor"
  readonly value: string
  readonly id: string
  readonly original: string
  readonly position?: Position
}

declare module "mdast" {
  interface PhrasingContentMap {
    wikilink: Wikilink
    blockAnchor: BlockAnchor
  }
}

export type RemarkWikilinksOptions = Record<string, never>

type ToMarkdownHandler<Value extends Node> = (node: Value) => string

type ToMarkdownExtension = {
  readonly handlers: {
    readonly wikilink: ToMarkdownHandler<Wikilink>
    readonly blockAnchor: ToMarkdownHandler<BlockAnchor>
  }
}

type ToMarkdownData = Record<string, unknown> & {
  toMarkdownExtensions?: ToMarkdownExtension[]
}

type SourceSpan = {
  readonly start: number
  readonly end: number
}

type WikilinkParts = {
  readonly target: string
  readonly header?: string
  readonly alias?: string
  readonly block?: string
}

const wikilinkPattern = /!?\[\[[^\]\n]+\]\]/g
const blockAnchorPattern = /(?<!\S)\^([A-Za-z0-9-]+)(?=$|\s)/g
const blockIdPattern = /^[A-Za-z0-9-]+$/

export const remarkWikilinks: Plugin<[RemarkWikilinksOptions?], Root> = function remarkWikilinksPlugin(
  this: Processor
): Transformer<Root> {
  const data = this.data() as ToMarkdownData
  const extensions = data.toMarkdownExtensions ?? (data.toMarkdownExtensions = [])
  extensions.push(wikilinksToMarkdownExtension)

  return (tree) => {
    findAndReplace(tree, [
      [wikilinkPattern, replaceWikilink],
      [blockAnchorPattern, replaceBlockAnchor]
    ])
  }
}

const wikilinksToMarkdownExtension: ToMarkdownExtension = {
  handlers: {
    wikilink: (node) => wikilinkMarkdown(node),
    blockAnchor: (node) => blockAnchorMarkdown(node)
  }
}

const wikilinkMarkdown = (node: Wikilink): string => {
  const fragment = node.block === undefined ? optionalPrefixed("#", node.header) : `#^${node.block}`
  const alias = node.alias === undefined ? "" : `|${node.alias}`
  const embed = node.embed === true ? "!" : ""
  return `${embed}[[${node.target}${fragment}${alias}]]`
}

const blockAnchorMarkdown = (node: BlockAnchor): string => `^${node.id}`

const replaceWikilink = (value: string, match: RegExpMatchObject): Wikilink | false => {
  const embed = value.charCodeAt(0) === 33
  const openOffset = embed ? 3 : 2
  const inner = value.slice(openOffset, -2)
  const parsed = parseWikilink(inner)
  if (parsed === undefined) {
    return false
  }

  return wikilinkNode(parsed, value, embed, relativePositionFromMatch(match, { start: 0, end: value.length }))
}

const replaceBlockAnchor = (value: string, id: string, match: RegExpMatchObject): BlockAnchor =>
  blockAnchorNode(id, value, relativePositionFromMatch(match, { start: 0, end: value.length }))

const parseWikilink = (inner: string): WikilinkParts | undefined => {
  const aliasAt = findTopLevelChar(inner, "|", 0)
  const targetPart = aliasAt === -1 ? inner : inner.slice(0, aliasAt)
  const aliasPart = aliasAt === -1 ? undefined : inner.slice(aliasAt + 1).trim()
  const headerAt = findTopLevelChar(targetPart, "#", 0)
  const rawTarget = headerAt === -1 ? targetPart : targetPart.slice(0, headerAt)
  const rawFragment = headerAt === -1 ? undefined : targetPart.slice(headerAt + 1)
  const target = rawTarget.trim()

  if (target.startsWith("^^")) {
    return undefined
  }

  if (target.length === 0 && (rawFragment === undefined || rawFragment.length === 0)) {
    return undefined
  }

  if (rawFragment === undefined) {
    return withOptionalAlias({ target }, aliasPart)
  }

  const fragment = rawFragment.trim()
  if (fragment.length === 0 || fragment.startsWith("#")) {
    return undefined
  }

  if (fragment.charCodeAt(0) === 94) {
    const block = fragment.slice(1).trim()
    if (!blockIdPattern.test(block)) {
      return undefined
    }
    return withOptionalAlias({ target, block }, aliasPart)
  }

  return withOptionalAlias({ target, header: fragment }, aliasPart)
}

const withOptionalAlias = (parts: WikilinkParts, alias: string | undefined): WikilinkParts => {
  if (alias === undefined || alias.length === 0) {
    return parts
  }
  return { ...parts, alias }
}

const findTopLevelChar = (input: string, expected: "|" | "#", start: number): number => {
  let index = start
  let bracketDepth = 0

  while (index < input.length) {
    const char = input[index]
    if (char === "[") {
      bracketDepth += 1
      index += 1
      continue
    }
    if (char === "]") {
      if (bracketDepth > 0) {
        bracketDepth -= 1
      }
      index += 1
      continue
    }
    if (char === expected && bracketDepth === 0) {
      return index
    }
    index += 1
  }

  return -1
}

const wikilinkNode = (
  parts: WikilinkParts,
  original: string,
  embed: boolean,
  position: Position | undefined
): Wikilink => ({
  type: "wikilink",
  value: wikilinkValue(parts),
  target: parts.target,
  ...optionalString("header", parts.header),
  ...optionalString("alias", parts.alias),
  ...optionalString("block", parts.block),
  ...(embed ? { embed: true } : {}),
  original,
  ...optionalPosition(position)
})


const wikilinkValue = (parts: WikilinkParts): string => {
  if (parts.alias !== undefined) {
    return parts.alias
  }
  if (parts.target.length > 0) {
    return parts.target
  }
  if (parts.header !== undefined) {
    return parts.header
  }
  return parts.block ?? ""
}
const blockAnchorNode = (id: string, original: string, position: Position | undefined): BlockAnchor => ({
  type: "blockAnchor",
  value: id,
  id,
  original,
  ...optionalPosition(position)
})

const optionalPrefixed = (prefix: string, value: string | undefined): string =>
  value === undefined ? "" : `${prefix}${value}`

const optionalString = <Key extends string>(key: Key, value: string | undefined): Partial<Record<Key, string>> => {
  if (value === undefined || value.length === 0) {
    return {}
  }
  return { [key]: value } as Partial<Record<Key, string>>
}

const optionalPosition = (position: Position | undefined): Partial<{ readonly position: Position }> => {
  if (position === undefined) {
    return {}
  }
  return { position }
}

const relativePositionFromMatch = (match: RegExpMatchObject, span: SourceSpan): Position | undefined => {
  const text = match.stack[match.stack.length - 1] as Text | undefined
  return relativePosition(match.input, text?.position, {
    start: match.index + span.start,
    end: match.index + span.end
  })
}

const relativePosition = (input: string, base: Position | undefined, span: SourceSpan): Position | undefined => {
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
