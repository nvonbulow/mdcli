import type { Code, Heading, Root, Yaml } from "mdast"
import { Chunk } from "effect"
import * as Effect from "effect/Effect"
import {
  MarkdownFencedBlock,
  MarkdownFile,
  MarkdownHeading,
  MarkdownInlineField,
  MarkdownListItem,
  MarkdownTag,
  MarkdownTask,
  MarkdownWikilink,
  RawFrontmatter,
  SourceSpan
} from "./MarkdownModel"
import { MarkdownParser } from "./MarkdownParser"

export const Markdown = {
  parse: (markdown: string) =>
    Effect.gen(function* () {
      const parser = yield* MarkdownParser
      return yield* parser.parse(markdown)
    }),
  getFrontmatter: (file: MarkdownFile): Chunk.Chunk<RawFrontmatter> =>
    Chunk.fromIterable(collectFrontmatter(rootOf(file))),
  getHeadings: (file: MarkdownFile): Chunk.Chunk<MarkdownHeading> => Chunk.fromIterable(collectHeadings(rootOf(file))),
  getWikilinks: (file: MarkdownFile): Chunk.Chunk<MarkdownWikilink> =>
    Chunk.fromIterable(collectWikilinks(rootOf(file))),
  getListItems: (file: MarkdownFile): Chunk.Chunk<MarkdownListItem> =>
    Chunk.fromIterable(collectListItems(rootOf(file))),
  getTasks: (file: MarkdownFile): Chunk.Chunk<MarkdownTask> => Chunk.fromIterable(collectTasks(rootOf(file))),
  getTags: (file: MarkdownFile): Chunk.Chunk<MarkdownTag> => Chunk.fromIterable(collectTags(rootOf(file))),
  getInlineFields: (file: MarkdownFile): Chunk.Chunk<MarkdownInlineField> =>
    Chunk.fromIterable(collectInlineFields(rootOf(file))),
  getFencedBlocks: (file: MarkdownFile): Chunk.Chunk<MarkdownFencedBlock> =>
    Chunk.fromIterable(collectFencedBlocks(rootOf(file)))
} as const

type MarkdownNode = {
  readonly type: string
  readonly children?: ReadonlyArray<MarkdownNode>
  readonly value?: unknown
  readonly data?: {
    readonly obsidianWikilinks?: ReadonlyArray<ObsidianWikilinkNode>
    readonly obsidianInlineFields?: ReadonlyArray<ObsidianInlineFieldNode>
  }
  readonly position?: {
    readonly start?: { readonly offset?: number }
    readonly end?: { readonly offset?: number }
  }
}

type ObsidianWikilinkNode = MarkdownNode & {
  readonly type: "obsidianWikilink"
  readonly value: string
  readonly target: string
  readonly original: string
  readonly alias?: string
  readonly heading?: string
  readonly block?: string
  readonly span?: { readonly start: number; readonly end: number }
}

type ObsidianInlineFieldNode = MarkdownNode & {
  readonly type: "obsidianInlineField"
  readonly key: string
  readonly value: string
  readonly original: string
  readonly valueStart: number
  readonly valueEnd: number
  readonly span: { readonly start: number; readonly end: number }
}

type Visitor = (node: MarkdownNode) => void

const rootOf = (file: MarkdownFile): Root & MarkdownNode => file.mdast as Root & MarkdownNode

const collectFrontmatter = (root: Root & MarkdownNode): ReadonlyArray<RawFrontmatter> => {
  const frontmatter: Array<RawFrontmatter> = []
  visit(root, (node) => {
    if (node.type === "yaml") {
      const yaml = node as Yaml
      frontmatter.push(
        new RawFrontmatter({
          value: yaml.value,
          language: "yaml",
          ...optionalSpan(nodeSpan(yaml))
        })
      )
    }
  })
  return frontmatter
}

const collectHeadings = (root: Root & MarkdownNode): ReadonlyArray<MarkdownHeading> => {
  const headings: Array<MarkdownHeading> = []
  visit(root, (node) => {
    if (node.type === "heading") {
      const heading = node as Heading
      headings.push(
        new MarkdownHeading({
          depth: heading.depth,
          text: nodeText(heading),
          ...optionalSpan(nodeSpan(heading))
        })
      )
    }
  })
  return headings
}

const collectWikilinks = (root: Root & MarkdownNode): ReadonlyArray<MarkdownWikilink> => {
  const wikilinks: Array<MarkdownWikilink> = []
  const seen = new Set<string>()
  visit(root, (node) => {
    if (isWikilinkNode(node)) {
      pushWikilink(wikilinks, seen, node)
    }
    const dataLinks = node.data?.obsidianWikilinks
    if (dataLinks !== undefined) {
      for (const link of dataLinks) {
        pushWikilink(wikilinks, seen, link)
      }
    }
  })
  return wikilinks
}

const collectInlineFields = (root: Root & MarkdownNode): ReadonlyArray<MarkdownInlineField> => {
  const fields: Array<MarkdownInlineField> = []
  const seen = new Set<string>()
  visit(root, (node) => {
    if (isInlineFieldNode(node)) {
      pushInlineField(fields, seen, node)
    }
    const dataFields = node.data?.obsidianInlineFields
    if (dataFields !== undefined) {
      for (const field of dataFields) {
        pushInlineField(fields, seen, field)
      }
    }
  })
  return fields
}

const collectListItems = (root: Root & MarkdownNode): ReadonlyArray<MarkdownListItem> => {
  const items: Array<MarkdownListItem> = []
  visit(root, (node) => {
    if (node.type === "listItem") {
      const item = node as MarkdownNode & { readonly checked?: boolean | null }
      items.push(
        new MarkdownListItem({
          text: listItemText(item),
          ...optionalChecked(item.checked),
          ...optionalSpan(nodeSpan(item))
        })
      )
    }
  })
  return items
}

const collectTasks = (root: Root & MarkdownNode): ReadonlyArray<MarkdownTask> => {
  const tasks: Array<MarkdownTask> = []
  visit(root, (node) => {
    if (node.type === "listItem") {
      const item = node as MarkdownNode & { readonly checked?: boolean | null }
      if (typeof item.checked === "boolean") {
        tasks.push(
          new MarkdownTask({
            done: item.checked,
            text: listItemText(item),
            fields: Chunk.fromIterable(collectInlineFieldsFromNode(item)),
            tags: Chunk.fromIterable(collectTagsFromNode(item)),
            ...optionalSpan(nodeSpan(item))
          })
        )
      }
    }
  })
  return tasks
}

const collectTags = (root: Root & MarkdownNode): ReadonlyArray<MarkdownTag> => collectTagsFromNode(root)

const collectFencedBlocks = (root: Root & MarkdownNode): ReadonlyArray<MarkdownFencedBlock> => {
  const blocks: Array<MarkdownFencedBlock> = []
  visit(root, (node) => {
    if (node.type === "code") {
      const code = node as Code
      blocks.push(
        new MarkdownFencedBlock({
          value: code.value,
          ...optionalString("language", code.lang ?? undefined),
          ...optionalString("meta", code.meta ?? undefined),
          ...optionalSpan(nodeSpan(code))
        })
      )
    }
  })
  return blocks
}

const collectInlineFieldsFromNode = (node: unknown): ReadonlyArray<MarkdownInlineField> => {
  const fields: Array<MarkdownInlineField> = []
  const seen = new Set<string>()
  visit(toMarkdownNode(node), (current) => {
    if (isInlineFieldNode(current)) {
      pushInlineField(fields, seen, current)
    }
    const dataFields = current.data?.obsidianInlineFields
    if (dataFields !== undefined) {
      for (const field of dataFields) {
        pushInlineField(fields, seen, field)
      }
    }
  })
  return fields
}

const collectTagsFromNode = (node: unknown): ReadonlyArray<MarkdownTag> => {
  const tags: Array<MarkdownTag> = []
  visit(toMarkdownNode(node), (current) => {
    if (current.type === "text") {
      pushTextTags(tags, current)
    }
  })
  return tags
}

const visit = (node: MarkdownNode, visitor: Visitor): void => {
  visitor(node)
  const children = node.children
  if (children === undefined) {
    return
  }
  for (const child of children) {
    visit(child, visitor)
  }
}

const nodeText = (node: unknown): string => {
  const markdownNode = toMarkdownNode(node)
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
  const markdownNode = toMarkdownNode(node)
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
  const markdownNode = toMarkdownNode(node)
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

const tagPattern = /#[A-Za-z0-9/_-]+/g

const pushTextTags = (tags: Array<MarkdownTag>, node: MarkdownNode): void => {
  if (typeof node.value !== "string") {
    return
  }
  const baseSpan = nodeSpan(node)
  const baseStart = baseSpan?.start ?? 0
  for (const match of node.value.matchAll(tagPattern)) {
    const index = match.index
    if (index !== undefined) {
      tags.push(
        new MarkdownTag({
          value: match[0],
          span: new SourceSpan({ start: baseStart + index, end: baseStart + index + match[0].length })
        })
      )
    }
  }
}

const pushWikilink = (wikilinks: Array<MarkdownWikilink>, seen: Set<string>, link: ObsidianWikilinkNode): void => {
  const span = syntaxSpan(link)
  const key = link.original + ":" + spanKey(span)
  if (seen.has(key)) {
    return
  }
  seen.add(key)
  wikilinks.push(
    new MarkdownWikilink({
      target: link.target,
      value: link.value,
      original: link.original,
      ...optionalString("alias", link.alias),
      ...optionalString("heading", link.heading),
      ...optionalString("block", link.block),
      ...optionalSpan(span)
    })
  )
}

const pushInlineField = (
  fields: Array<MarkdownInlineField>,
  seen: Set<string>,
  field: ObsidianInlineFieldNode
): void => {
  const span = syntaxSpan(field)
  const key = field.original + ":" + spanKey(span)
  if (seen.has(key)) {
    return
  }
  seen.add(key)
  fields.push(
    new MarkdownInlineField({
      key: field.key,
      value: field.value,
      original: field.original,
      valueStart: field.valueStart,
      valueEnd: field.valueEnd,
      span: span ?? new SourceSpan({ start: field.valueStart, end: field.valueEnd })
    })
  )
}

const isWikilinkNode = (node: MarkdownNode): node is ObsidianWikilinkNode => node.type === "obsidianWikilink"

const isInlineFieldNode = (node: MarkdownNode): node is ObsidianInlineFieldNode => node.type === "obsidianInlineField"

const nodeSpan = (node: unknown): SourceSpan | undefined => {
  const position = toMarkdownNode(node).position
  const start = position?.start?.offset
  const end = position?.end?.offset
  if (typeof start === "number" && typeof end === "number") {
    return new SourceSpan({ start, end })
  }
  return undefined
}

const sourceSpan = (span: { readonly start: number; readonly end: number } | undefined): SourceSpan | undefined => {
  if (span === undefined) {
    return undefined
  }
  return new SourceSpan({ start: span.start, end: span.end })
}
const toMarkdownNode = (node: unknown): MarkdownNode => node as MarkdownNode
const syntaxSpan = (
  node: MarkdownNode & { readonly span?: { readonly start: number; readonly end: number } }
): SourceSpan | undefined => {
  if (node.span === undefined) {
    return undefined
  }
  const baseSpan = nodeSpan(node)
  if (baseSpan === undefined) {
    return sourceSpan(node.span)
  }
  return new SourceSpan({ start: baseSpan.start + node.span.start, end: baseSpan.start + node.span.end })
}

const optionalSpan = (span: SourceSpan | undefined): { readonly span?: SourceSpan } => {
  if (span === undefined) {
    return {}
  }
  return { span }
}

const optionalChecked = (checked: boolean | null | undefined): { readonly checked?: boolean } => {
  if (typeof checked === "boolean") {
    return { checked }
  }
  return {}
}

const optionalString = <Key extends string>(key: Key, value: string | undefined): Partial<Record<Key, string>> => {
  if (value === undefined || value.length === 0) {
    return {}
  }
  return { [key]: value } as Partial<Record<Key, string>>
}

const spanKey = (span: { readonly start: number; readonly end: number } | undefined): string => {
  if (span === undefined) {
    return "none"
  }
  return String(span.start) + "-" + String(span.end)
}
