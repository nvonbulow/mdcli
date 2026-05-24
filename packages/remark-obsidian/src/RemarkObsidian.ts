import type { Parent, Text } from "mdast"
import type { Node, Position } from "unist"
import type { Plugin, Transformer } from "unified"
import { scanInlineFields, type InlineFieldSpan } from "./InlineFieldScanner"
import type { ObsidianInlineField, ObsidianTag, ObsidianWikilink, SourceSpan } from "./ObsidianNodes"

type MutableParent = Parent & {
  children: Node[]
}

type MutableNode = Node & {
  data?: Node["data"] | Record<string, unknown> | undefined
}

type ObsidianPluginData = Record<string, unknown> & {
  obsidianWikilinks?: ObsidianWikilink[]
  obsidianInlineFields?: ObsidianInlineField[]
  obsidianTags?: ObsidianTag[]
  obsidianTask?: {
    readonly done: boolean
    readonly text: string
    readonly rawText: string
    readonly tags: readonly ObsidianTag[]
    readonly inlineFields: readonly ObsidianInlineField[]
    readonly position?: Position
  }
}

type WikilinkSpan = {
  readonly kind: "wikilink"
  readonly start: number
  readonly end: number
  readonly node: ObsidianWikilink
}

type InlineFieldNodeSpan = {
  readonly kind: "inlineField"
  readonly start: number
  readonly end: number
  readonly node: ObsidianInlineField
}

type WithRelativeSpan = {
  readonly span?: SourceSpan
}

type TagNodeSpan = {
  readonly kind: "tag"
  readonly start: number
  readonly end: number
  readonly node: ObsidianTag
}

type SyntaxSpan = WikilinkSpan | InlineFieldNodeSpan | TagNodeSpan

type WikilinkParts = {
  readonly target: string
  readonly alias?: string
  readonly heading?: string
  readonly block?: string
}

export type RemarkObsidianOptions = Record<string, never>

export const remarkObsidian: Plugin<[RemarkObsidianOptions?], Node> = (): Transformer<Node> => (tree, file) => {
  visitTextNodes(tree, [], (text, ancestors) => {
    const parent = ancestors[ancestors.length - 1] as MutableParent | undefined
    if (parent === undefined) {
      return
    }

    const index = parent.children.indexOf(text)
    if (index === -1) {
      return
    }

    const wikilinks = scanWikilinks(text.value, text.position)
    const inlineFields = scanInlineFields(text.value).map((field) => inlineFieldNode(text.value, field, text.position))
    const tags = scanTags(text.value, text.position).filter(
      (tag) => !overlapsAny(relativeSpan(tag), wikilinks, inlineFields)
    )
    if (wikilinks.length === 0 && inlineFields.length === 0 && tags.length === 0) {
      return
    }

    attachSyntaxData(parent, wikilinks, inlineFields, tags)
    attachSyntaxData(text, wikilinks, inlineFields, tags)

    const listItem = nearestListItem(ancestors)
    if (listItem !== undefined) {
      attachSyntaxData(listItem, wikilinks, inlineFields, tags)
    }

    const replacements = replaceTextNode(text, wikilinks, inlineFields, tags)
    parent.children.splice(index, 1, ...replacements)
  })
  annotateTasks(tree, String(file.value ?? ""))
}

const visitTextNodes = (
  node: Node,
  ancestors: Node[],
  visitor: (text: Text, ancestors: readonly Node[]) => void
): void => {
  if (node.type === "text") {
    visitor(node as Text, ancestors)
    return
  }

  const children = (node as Partial<MutableParent>).children
  if (children === undefined) {
    return
  }

  ancestors.push(node)
  let index = 0
  while (index < children.length) {
    const child = children[index]
    if (child !== undefined) {
      visitTextNodes(child, ancestors, visitor)
    }
    index += 1
  }
  ancestors.pop()
}

const replaceTextNode = (
  text: Text,
  wikilinks: readonly ObsidianWikilink[],
  inlineFields: readonly ObsidianInlineField[],
  tags: readonly ObsidianTag[]
): Node[] => {
  const spans = syntaxSpans(wikilinks, inlineFields, tags)
  if (spans.length === 0) {
    return [text]
  }

  const replacements: Node[] = []
  let cursor = 0
  let spanIndex = 0

  while (spanIndex < spans.length) {
    const span = spans[spanIndex]
    if (span === undefined) {
      break
    }

    if (span.start < cursor) {
      spanIndex += 1
      continue
    }

    if (span.start > cursor) {
      replacements.push(
        textSegment(
          text.value.slice(cursor, span.start),
          relativePosition(text.value, text.position, { start: cursor, end: span.start })
        )
      )
    }

    replacements.push(span.node)
    cursor = span.end
    spanIndex += 1
  }

  if (cursor < text.value.length) {
    replacements.push(
      textSegment(
        text.value.slice(cursor),
        relativePosition(text.value, text.position, { start: cursor, end: text.value.length })
      )
    )
  }

  return replacements
}

const syntaxSpans = (
  wikilinks: readonly ObsidianWikilink[],
  inlineFields: readonly ObsidianInlineField[],
  tags: readonly ObsidianTag[]
): SyntaxSpan[] => {
  const spans: SyntaxSpan[] = []
  let wikilinkIndex = 0
  while (wikilinkIndex < wikilinks.length) {
    const wikilink = wikilinks[wikilinkIndex]
    const span = relativeSpan(wikilink)
    if (wikilink !== undefined && span !== undefined) {
      spans.push({ kind: "wikilink", start: span.start, end: span.end, node: wikilink })
    }
    wikilinkIndex += 1
  }

  let fieldIndex = 0
  while (fieldIndex < inlineFields.length) {
    const field = inlineFields[fieldIndex]
    const span = relativeSpan(field)
    if (field !== undefined && span !== undefined) {
      spans.push({ kind: "inlineField", start: span.start, end: span.end, node: field })
    }
    fieldIndex += 1
  }

  let tagIndex = 0
  while (tagIndex < tags.length) {
    const tag = tags[tagIndex]
    const span = relativeSpan(tag)
    if (tag !== undefined && span !== undefined) {
      spans.push({ kind: "tag", start: span.start, end: span.end, node: tag })
    }
    tagIndex += 1
  }

  spans.sort(compareSyntaxSpan)
  return spans
}

const compareSyntaxSpan = (left: SyntaxSpan, right: SyntaxSpan): number => {
  if (left.start !== right.start) {
    return left.start - right.start
  }
  if (left.kind === right.kind) {
    return right.end - left.end
  }
  return left.kind === "inlineField" ? -1 : right.kind === "inlineField" ? 1 : left.kind === "wikilink" ? -1 : 1
}

const textSegment = (value: string, position: Position | undefined): Text => ({
  type: "text",
  value,
  ...optionalPosition(position)
})

const scanWikilinks = (input: string, position: Position | undefined): ObsidianWikilink[] => {
  const wikilinks: ObsidianWikilink[] = []
  let cursor = 0

  while (cursor < input.length - 1) {
    if (input[cursor] !== "[" || input[cursor + 1] !== "[") {
      cursor += 1
      continue
    }

    const close = findWikilinkClose(input, cursor + 2)
    if (close === -1) {
      cursor += 2
      continue
    }

    const original = input.slice(cursor, close + 2)
    const inner = input.slice(cursor + 2, close)
    const parsed = parseWikilink(inner)
    if (parsed !== undefined && parsed.target.length > 0) {
      wikilinks.push(
        wikilinkNode(
          parsed,
          original,
          { start: cursor, end: close + 2 },
          relativePosition(input, position, { start: cursor, end: close + 2 })
        )
      )
    }

    cursor = close + 2
  }

  return wikilinks
}

const findWikilinkClose = (input: string, contentStart: number): number => {
  let index = contentStart
  let bracketDepth = 0

  while (index < input.length - 1) {
    const char = input[index]
    if (char === "[") {
      bracketDepth += 1
      index += 1
      continue
    }

    if (char === "]") {
      if (bracketDepth === 0 && input[index + 1] === "]") {
        return index
      }
      if (bracketDepth > 0) {
        bracketDepth -= 1
      }
    }

    index += 1
  }

  return -1
}

const parseWikilink = (inner: string): WikilinkParts | undefined => {
  const aliasAt = findTopLevelChar(inner, "|", 0)
  const targetPart = aliasAt === -1 ? inner : inner.slice(0, aliasAt)
  const aliasPart = aliasAt === -1 ? undefined : inner.slice(aliasAt + 1)
  const headingAt = findTopLevelChar(targetPart, "#", 0)
  const rawTarget = headingAt === -1 ? targetPart : targetPart.slice(0, headingAt)
  const rawFragment = headingAt === -1 ? undefined : targetPart.slice(headingAt + 1)
  const target = rawTarget.trim()

  if (target.length === 0 && (rawFragment === undefined || rawFragment.length === 0)) {
    return undefined
  }

  if (rawFragment === undefined) {
    return withOptionalAlias({ target }, aliasPart)
  }

  if (rawFragment[0] === "^") {
    return withOptionalAlias({ target, block: rawFragment.slice(1).trim() }, aliasPart)
  }

  return withOptionalAlias({ target, heading: rawFragment.trim() }, aliasPart)
}

const withOptionalAlias = (parts: WikilinkParts, alias: string | undefined): WikilinkParts => {
  if (alias === undefined) {
    return parts
  }
  return { ...parts, alias: alias.trim() }
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
  span: SourceSpan,
  position: Position | undefined
): ObsidianWikilink => {
  const value = parts.alias === undefined || parts.alias.length === 0 ? parts.target : parts.alias
  return {
    type: "obsidianWikilink",
    value,
    target: parts.target,
    ...optionalString("alias", parts.alias),
    ...optionalString("heading", parts.heading),
    ...optionalString("block", parts.block),
    original,
    ...withRelativeSpan(span),
    ...optionalPosition(position),
    data: {
      hName: "a",
      hProperties: {
        className: ["internal-link"],
        href: parts.target
      }
    }
  }
}

const inlineFieldNode = (
  input: string,
  field: InlineFieldSpan,
  basePosition: Position | undefined
): ObsidianInlineField => ({
  type: "obsidianInlineField",
  value: field.value,
  key: field.key,
  original: field.original,
  valueStart: field.valueStart,
  valueEnd: field.valueEnd,
  ...withRelativeSpan(field.span),
  ...optionalPosition(relativePosition(input, basePosition, field.span)),
  data: {
    hName: "span",
    hProperties: {
      className: ["dataview-inline-field"],
      dataKey: field.key
    }
  }
})

const tagPattern = /#[A-Za-z0-9/_-]+\b/g

const scanTags = (input: string, basePosition: Position | undefined): ObsidianTag[] => {
  const tags: ObsidianTag[] = []
  for (const match of input.matchAll(tagPattern)) {
    const start = match.index
    if (start === undefined) {
      continue
    }
    const original = match[0]
    tags.push({
      type: "obsidianTag",
      value: original,
      original,
      ...optionalPosition(relativePosition(input, basePosition, { start, end: start + original.length })),
      ...withRelativeSpan({ start, end: start + original.length }),
      data: {
        hName: "span",
        hProperties: {
          className: ["tag"]
        }
      }
    })
  }
  return tags
}

const relativeSpan = (node: unknown): SourceSpan | undefined => (node as WithRelativeSpan).span

const withRelativeSpan = (span: SourceSpan): { readonly span: SourceSpan } => ({ span })

const overlapsAny = (
  span: SourceSpan | undefined,
  wikilinks: readonly ObsidianWikilink[],
  inlineFields: readonly ObsidianInlineField[]
): boolean => {
  if (span === undefined) {
    return false
  }
  for (const wikilink of wikilinks) {
    if (overlaps(span, relativeSpan(wikilink))) {
      return true
    }
  }
  for (const inlineField of inlineFields) {
    if (overlaps(span, relativeSpan(inlineField))) {
      return true
    }
  }
  return false
}

const overlaps = (left: SourceSpan, right: SourceSpan | undefined): boolean =>
  right !== undefined && left.start < right.end && right.start < left.end

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

const annotateTasks = (tree: Node, markdown: string): void => {
  visitAll(tree, (node) => {
    if (node.type !== "listItem") {
      return
    }
    const item = node as MutableNode & { readonly checked?: boolean | null; readonly position?: Position }
    if (typeof item.checked !== "boolean") {
      return
    }
    const data = (item.data ?? {}) as ObsidianPluginData
    const rawText = firstSourceLine(markdown, item.position) || nodeText(item)
    data.obsidianTask = {
      done: item.checked,
      rawText,
      text: taskText(rawText),
      tags: data.obsidianTags ?? [],
      inlineFields: data.obsidianInlineFields ?? [],
      ...optionalPosition(item.position)
    }
    item.data = data
  })
}

const visitAll = (node: Node, visitor: (node: Node) => void): void => {
  visitor(node)
  const children = (node as Partial<MutableParent>).children
  if (children === undefined) {
    return
  }
  for (const child of children) {
    visitAll(child, visitor)
  }
}

const firstSourceLine = (markdown: string, position: Position | undefined): string => {
  const start = position?.start.offset
  if (start === undefined) {
    return ""
  }
  const lineEnd = markdown.indexOf("\n", start)
  return lineEnd === -1 ? markdown.slice(start) : markdown.slice(start, lineEnd)
}

const taskText = (rawText: string): string => rawText.replace(/^\s*[-*+]\s+\[[ xX]\]\s*/, "")

const nodeText = (node: Node): string => {
  const value = (node as { readonly value?: unknown }).value
  if (typeof value === "string") {
    return value
  }
  const children = (node as Partial<MutableParent>).children
  if (children === undefined) {
    return ""
  }
  let text = ""
  for (const child of children) {
    text = text + nodeText(child)
  }
  return text
}

const attachSyntaxData = (
  node: MutableNode,
  wikilinks: readonly ObsidianWikilink[],
  inlineFields: readonly ObsidianInlineField[],
  tags: readonly ObsidianTag[]
): void => {
  const data = (node.data ?? {}) as ObsidianPluginData
  if (wikilinks.length > 0) {
    data.obsidianWikilinks = appendAll(data.obsidianWikilinks, wikilinks)
  }
  if (inlineFields.length > 0) {
    data.obsidianInlineFields = appendAll(data.obsidianInlineFields, inlineFields)
  }
  if (tags.length > 0) {
    data.obsidianTags = appendAll(data.obsidianTags, tags)
  }
  node.data = data
}

const appendAll = <Value>(existing: readonly Value[] | undefined, next: readonly Value[]): Value[] => {
  if (existing === undefined) {
    return [...next]
  }
  return [...existing, ...next]
}

const nearestListItem = (ancestors: readonly Node[]): MutableNode | undefined => {
  let index = ancestors.length - 1
  while (index >= 0) {
    const ancestor = ancestors[index]
    if (ancestor !== undefined && ancestor.type === "listItem") {
      return ancestor as unknown as MutableNode
    }
    index -= 1
  }
  return undefined
}
