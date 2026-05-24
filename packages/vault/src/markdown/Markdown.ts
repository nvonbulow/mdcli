import type { ObsidianListItem, ObsidianTag, ObsidianWikilink } from "@kb/remark-obsidian"
import type { Code, Heading, ListItem, Root, Yaml } from "mdast"
import { Chunk } from "effect"
import * as Effect from "effect/Effect"

import { MarkdownFile } from "./MarkdownModel"
import { MarkdownParser } from "./MarkdownParser"

export const Markdown = {
  parse: (markdown: string) =>
    Effect.gen(function* () {
      const parser = yield* MarkdownParser
      return yield* parser.parse(markdown)
    }),
  getFrontmatter: (file: MarkdownFile): Chunk.Chunk<Yaml> => Chunk.fromIterable(collectFrontmatter(rootOf(file))),
  getHeadings: (file: MarkdownFile): Chunk.Chunk<Heading> => Chunk.fromIterable(collectHeadings(rootOf(file))),
  getWikilinks: (file: MarkdownFile): Chunk.Chunk<ObsidianWikilink> =>
    Chunk.fromIterable(collectWikilinks(rootOf(file))),
  getListItems: (file: MarkdownFile): Chunk.Chunk<ListItem> => Chunk.fromIterable(collectListItems(rootOf(file))),
  getTasks: (file: MarkdownFile): Chunk.Chunk<ObsidianListItem> => Chunk.fromIterable(collectTasks(rootOf(file))),
  getTags: (file: MarkdownFile): Chunk.Chunk<ObsidianTag> => Chunk.fromIterable(collectTags(rootOf(file))),
  getFencedBlocks: (file: MarkdownFile): Chunk.Chunk<Code> => Chunk.fromIterable(collectFencedBlocks(rootOf(file))),
  headingText: (node: Heading): string => nodeText(node),
  listItemText: (node: ListItem): string => listItemText(node),
  fencedBlockLanguage: (node: Code): string | undefined => node.lang ?? undefined,
  fencedBlockMeta: (node: Code): string | undefined => node.meta ?? undefined
} as const

type MarkdownNode = {
  readonly type: string
  readonly children?: ReadonlyArray<MarkdownNode>
  readonly value?: unknown
  readonly data?: Record<string, unknown> & {
    readonly obsidianWikilinks?: ReadonlyArray<ObsidianWikilink>
    readonly obsidianInlineFields?: ReadonlyArray<unknown>
    readonly obsidianTags?: ReadonlyArray<ObsidianTag>
  }
}

type Visitor = (node: MarkdownNode) => void

const rootOf = (file: MarkdownFile): Root & MarkdownNode => file.mdast as Root & MarkdownNode

const collectFrontmatter = (root: Root & MarkdownNode): ReadonlyArray<Yaml> => {
  const frontmatter: Array<Yaml> = []
  visit(root, (node) => {
    if (node.type === "yaml") {
      frontmatter.push(node as Yaml)
    }
  })
  return frontmatter
}

const collectHeadings = (root: Root & MarkdownNode): ReadonlyArray<Heading> => {
  const headings: Array<Heading> = []
  visit(root, (node) => {
    if (node.type === "heading") {
      headings.push(node as unknown as Heading)
    }
  })
  return headings
}

const collectWikilinks = (root: Root & MarkdownNode): ReadonlyArray<ObsidianWikilink> => {
  const wikilinks: Array<ObsidianWikilink> = []
  const seen = new Set<string>()
  visit(root, (node) => {
    if (isWikilinkNode(node)) {
      pushWikilink(wikilinks, seen, node as unknown as ObsidianWikilink)
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

const collectListItems = (root: Root & MarkdownNode): ReadonlyArray<ListItem> => {
  const items: Array<ListItem> = []
  visit(root, (node) => {
    if (node.type === "listItem") {
      items.push(node as unknown as ListItem)
    }
  })
  return items
}

const collectTasks = (root: Root & MarkdownNode): ReadonlyArray<ObsidianListItem> => {
  const tasks: Array<ObsidianListItem> = []
  visit(root, (node) => {
    if (node.type === "listItem") {
      const item = node as unknown as ObsidianListItem
      if (item.data?.obsidianTask !== undefined) {
        tasks.push(item)
      }
    }
  })
  return tasks
}

const collectTags = (root: Root & MarkdownNode): ReadonlyArray<ObsidianTag> => collectTagsFromNode(root)

const collectFencedBlocks = (root: Root & MarkdownNode): ReadonlyArray<Code> => {
  const blocks: Array<Code> = []
  visit(root, (node) => {
    if (node.type === "code") {
      blocks.push(node as Code)
    }
  })
  return blocks
}

const collectTagsFromNode = (node: unknown): ReadonlyArray<ObsidianTag> => {
  const tags: Array<ObsidianTag> = []
  const seen = new Set<string>()
  visit(toMarkdownNode(node), (current) => {
    if (isTagNode(current)) {
      pushTag(tags, seen, current as unknown as ObsidianTag)
    }
    const dataTags = current.data?.obsidianTags
    if (dataTags !== undefined) {
      for (const tag of dataTags) {
        pushTag(tags, seen, tag)
      }
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

const pushWikilink = (wikilinks: Array<ObsidianWikilink>, seen: Set<string>, link: ObsidianWikilink): void => {
  const key = link.original + ":" + positionKey(link.position)
  if (seen.has(key)) {
    return
  }
  seen.add(key)
  wikilinks.push(link)
}

const pushTag = (tags: Array<ObsidianTag>, seen: Set<string>, tag: ObsidianTag): void => {
  const key = tag.original + ":" + positionKey(tag.position)
  if (seen.has(key)) {
    return
  }
  seen.add(key)
  tags.push(tag)
}

const isWikilinkNode = (node: MarkdownNode): boolean => node.type === "obsidianWikilink"
const isTagNode = (node: MarkdownNode): boolean => node.type === "obsidianTag"
const toMarkdownNode = (node: unknown): MarkdownNode => node as MarkdownNode

const positionKey = (
  position:
    | {
        readonly start: { readonly offset?: number | undefined }
        readonly end: { readonly offset?: number | undefined }
      }
    | undefined
): string => {
  const start = position?.start.offset
  const end = position?.end.offset
  return typeof start === "number" && typeof end === "number" ? String(start) + "-" + String(end) : "none"
}
