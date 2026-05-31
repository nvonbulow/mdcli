import { strict as assert } from "node:assert"
import type { Paragraph, Root } from "mdast"
import remarkParse from "remark-parse"
import remarkStringify from "remark-stringify"
import type { Node } from "unist"
import { visit } from "unist-util-visit"
import { unified } from "unified"
import { describe, it } from "vitest"
import { remarkWikilinks, type BlockAnchor, type Wikilink } from "../src"

const parse = (markdown: string): Root => {
  const processor = unified().use(remarkParse).use(remarkWikilinks)

  return processor.runSync(processor.parse(markdown)) as Root
}

const render = (markdown: string): string => {
  const processor = unified().use(remarkParse).use(remarkWikilinks).use(remarkStringify)

  return String(processor.stringify(processor.runSync(processor.parse(markdown)) as Root))
}

const collect = <Value extends Node>(tree: Node, type: string): Value[] => {
  const found: Value[] = []
  visit(tree, type, (node) => {
    found.push(node as Value)
  })
  return found
}

const firstParagraph = (tree: Root): Paragraph => tree.children[0] as Paragraph

describe("remarkWikilinks", () => {
  it("replaces wikilinks with wikilink nodes and preserves surrounding text", () => {
    const tree = parse("Before [[Target|Alias]] after")
    const paragraph = firstParagraph(tree)
    const link = collect<Wikilink>(tree, "wikilink")[0]

    assert.ok(link)
    assert.deepEqual(
      paragraph.children.map((child) => child.type),
      ["text", "wikilink", "text"]
    )
    assert.equal(link.target, "Target")
    assert.equal(link.alias, "Alias")
    assert.equal(link.value, "Alias")
    assert.equal(link.original, "[[Target|Alias]]")
    assert.deepEqual(link.position, {
      start: { line: 1, column: 8, offset: 7 },
      end: { line: 1, column: 24, offset: 23 }
    })
  })

  it("parses targets, headers, block references, aliases, local links, and embeds", () => {
    const tree = parse(
      "[[Target]] [[Target#Header]] [[#Header]] [[#^block-id]] [[Target#^block|Alias]] ![[Folder/Note.md#Header|Embed]]"
    )
    const links = collect<Wikilink>(tree, "wikilink")

    assert.equal(links.length, 6)
    assert.equal(links[0]?.target, "Target")
    assert.equal(links[0]?.value, "Target")
    assert.equal(links[1]?.target, "Target")
    assert.equal(links[1]?.header, "Header")
    assert.equal(links[2]?.target, "")
    assert.equal(links[2]?.header, "Header")
    assert.equal(links[2]?.value, "Header")
    assert.equal(links[3]?.target, "")
    assert.equal(links[3]?.block, "block-id")
    assert.equal(links[3]?.value, "block-id")
    assert.equal(links[4]?.target, "Target")
    assert.equal(links[4]?.block, "block")
    assert.equal(links[4]?.alias, "Alias")
    assert.equal(links[5]?.target, "Folder/Note.md")
    assert.equal(links[5]?.header, "Header")
    assert.equal(links[5]?.alias, "Embed")
    assert.equal(links[5]?.embed, true)
  })

  it("parses block anchor definitions as blockAnchor nodes", () => {
    const tree = parse("Task text ^block-id and more")
    const paragraph = firstParagraph(tree)
    const anchors = collect<BlockAnchor>(tree, "blockAnchor")

    assert.equal(anchors.length, 1)
    assert.deepEqual(
      paragraph.children.map((child) => child.type),
      ["text", "blockAnchor", "text"]
    )
    assert.equal(anchors[0]?.id, "block-id")
    assert.equal(anchors[0]?.value, "block-id")
    assert.equal(anchors[0]?.original, "^block-id")
    assert.deepEqual(anchors[0]?.position, {
      start: { line: 1, column: 11, offset: 10 },
      end: { line: 1, column: 20, offset: 19 }
    })
  })

  it("does not scan inline code or fenced code", () => {
    const tree = parse("`[[Nope]] ^nope`\n\n```md\n[[Nope]]\n^nope\n```\n\n[[Yep]] ^yep")
    const links = collect<Wikilink>(tree, "wikilink")
    const anchors = collect<BlockAnchor>(tree, "blockAnchor")

    assert.equal(links.length, 1)
    assert.equal(links[0]?.target, "Yep")
    assert.equal(anchors.length, 1)
    assert.equal(anchors[0]?.id, "yep")
  })

  it("does not parse markdown links or editor search-only wikilink forms", () => {
    const tree = parse("[text](target) [[## query]] [[^^block]] [[Valid]]")
    const links = collect<Wikilink>(tree, "wikilink")

    assert.equal(links.length, 1)
    assert.equal(links[0]?.target, "Valid")
  })

  it("stringifies wikilink and blockAnchor nodes back to wikilink markdown", () => {
    const output = render(
      "Before [[Target|Alias]] [[Target#Header]] [[#Header]] [[#^block-id]] [[Target#^block|Alias]] ![[Target]] ^anchor"
    )

    assert.match(output, /\[\[Target\|Alias\]\]/)
    assert.match(output, /\[\[Target#Header\]\]/)
    assert.match(output, /\[\[#Header\]\]/)
    assert.match(output, /\[\[#\^block-id\]\]/)
    assert.match(output, /\[\[Target#\^block\|Alias\]\]/)
    assert.match(output, /!\[\[Target\]\]/)
    assert.match(output, /\^anchor/)
  })

  it("round-trips parsed wikilink markdown through remark-stringify", () => {
    const input = "Before [[Target#Header|Alias]] and ![[Note#^block]] then ^anchor"
    const output = render(input)

    assert.match(output, /Before \[\[Target#Header\|Alias\]\] and !\[\[Note#\^block\]\] then \^anchor/)
  })
})
