import type { Literal } from "mdast"
import type { Position } from "unist"

import { optionalPosition, optionalString } from "./position.js"

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

type WikilinkParts = {
  readonly target: string
  readonly header?: string
  readonly alias?: string
  readonly block?: string
}

const blockIdPattern = /^[A-Za-z0-9-]+$/

export const wikilinkPattern = /!?\[\[[^\n]+?\]\](?!\])/g

export const parseWikilinkMarkdown = (original: string, position: Position | undefined): Wikilink | undefined => {
  const embed = original.charCodeAt(0) === 33
  const openOffset = embed ? 3 : 2
  if (!original.endsWith("]]")) {
    return undefined
  }

  const inner = original.slice(openOffset, -2)
  const parsed = parseWikilink(inner)
  if (parsed === undefined) {
    return undefined
  }

  return wikilinkNode(parsed, original, embed, position)
}

export const wikilinkMarkdown = (node: Wikilink): string => {
  const fragment = node.block === undefined ? optionalPrefixed("#", node.header) : `#^${node.block}`
  const alias = node.alias === undefined ? "" : `|${node.alias}`
  const embed = node.embed === true ? "!" : ""
  return `${embed}[[${node.target}${fragment}${alias}]]`
}

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

const optionalPrefixed = (prefix: string, value: string | undefined): string =>
  value === undefined ? "" : `${prefix}${value}`
