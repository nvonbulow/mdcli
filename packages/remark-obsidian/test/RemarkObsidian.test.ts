import { strict as assert } from "node:assert"
import type { ListItem, Paragraph, Root } from "mdast"
import { toString } from "mdast-util-to-string"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import type { Node } from "unist"
import { visit } from "unist-util-visit"
import { unified } from "unified"
import { describe, it } from "vitest"
import { remarkObsidian, type ObsidianInlineField, type ObsidianWikilink } from "../src"

type DataNode = Node & {
  readonly data?: {
    readonly obsidianWikilinks?: readonly ObsidianWikilink[]
    readonly obsidianInlineFields?: readonly ObsidianInlineField[]
  }
}

const parse = (markdown: string): Root => {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ["yaml"]).use(remarkObsidian)

  return processor.runSync(processor.parse(markdown)) as Root
}

const collect = <Value extends Node>(tree: Node, type: string): Value[] => {
  const found: Value[] = []
  visit(tree, type, (node) => {
    found.push(node as Value)
  })
  return found
}

const firstParagraph = (tree: Root): Paragraph => tree.children[0] as Paragraph

describe("remarkObsidian", () => {
  it("replaces wikilinks with typed nodes and preserves surrounding text", () => {
    const tree = parse("Before [[Target|Alias]] after")
    const paragraph = firstParagraph(tree)
    const link = collect<ObsidianWikilink>(tree, "obsidianWikilink")[0]

    assert.ok(link)
    assert.deepEqual(
      paragraph.children.map((child) => child.type),
      ["text", "obsidianWikilink", "text"]
    )
    assert.equal(link.target, "Target")
    assert.equal(link.alias, "Alias")
    assert.equal(link.value, "Alias")
    assert.equal(link.original, "[[Target|Alias]]")
    assert.deepEqual(link.span, { start: 7, end: 23 })
    assert.equal(toString(paragraph), "Before Alias after")
  })

  it("parses headings, block references, and nested brackets in wikilinks", () => {
    const tree = parse("[[Target#Heading]] [[Target#^block-id]] [[Folder [Draft]/Note|Alias [x]]]")
    const links = collect<ObsidianWikilink>(tree, "obsidianWikilink")

    assert.equal(links.length, 3)
    assert.equal(links[0]?.target, "Target")
    assert.equal(links[0]?.heading, "Heading")
    assert.equal(links[1]?.target, "Target")
    assert.equal(links[1]?.block, "block-id")
    assert.equal(links[2]?.target, "Folder [Draft]/Note")
    assert.equal(links[2]?.alias, "Alias [x]")
  })

  it("creates inline field nodes and attaches metadata to parent nodes", () => {
    const tree = parse("Task [due:: 2026-05-24] and (priority:: high)")
    const paragraph = firstParagraph(tree) as DataNode & Paragraph
    const fields = collect<ObsidianInlineField>(tree, "obsidianInlineField")

    assert.equal(fields.length, 2)
    assert.equal(fields[0]?.key, "due")
    assert.equal(fields[0]?.value, "2026-05-24")
    assert.deepEqual(fields[0]?.span, { start: 5, end: 23 })
    assert.equal(fields[1]?.key, "priority")
    assert.equal(fields[1]?.value, "high")
    assert.equal(paragraph.data?.obsidianInlineFields?.length, 2)
    assert.equal(toString(paragraph), "Task 2026-05-24 and high")
  })

  it("attaches task inline fields to GFM checked list items without checkbox parsing", () => {
    const tree = parse("- [x] Ship [area:: [[Ops]]] [priority:: high]")
    const item = collect<ListItem & DataNode>(tree, "listItem")[0]
    const fields = collect<ObsidianInlineField>(tree, "obsidianInlineField")

    assert.ok(item)
    assert.equal(item.checked, true)
    assert.equal(item.data?.obsidianInlineFields?.length, 2)
    assert.equal(item.data?.obsidianWikilinks?.length, 1)
    assert.equal(item.data?.obsidianWikilinks?.[0]?.target, "Ops")
    assert.deepEqual(
      fields.map((field) => field.key),
      ["area", "priority"]
    )
  })

  it("copies source positions onto generated children and records text-relative spans", () => {
    const tree = parse("A [[Target]] Z")
    const paragraph = firstParagraph(tree)
    const originalPosition = paragraph.children[0]?.position
    const link = collect<ObsidianWikilink>(tree, "obsidianWikilink")[0]

    assert.ok(link)
    assert.deepEqual(link.span, { start: 2, end: 12 })
    assert.deepEqual(link.position, originalPosition)
  })

  it("does not scan inline code or fenced code", () => {
    const tree = parse("`[[Nope]]`\n\n```md\n[[Nope]]\n```\n\n[[Yep]]")
    const links = collect<ObsidianWikilink>(tree, "obsidianWikilink")

    assert.equal(links.length, 1)
    assert.equal(links[0]?.target, "Yep")
  })
})
