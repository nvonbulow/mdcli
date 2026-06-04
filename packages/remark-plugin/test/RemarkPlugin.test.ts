import { strict as assert } from "node:assert"
import type { Paragraph, Root } from "mdast"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkStringify from "remark-stringify"
import type { Node } from "unist"
import { visit } from "unist-util-visit"
import { unified } from "unified"
import { describe, it } from "vitest"

import { remarkPlugin, type BlockAnchor, type InlineDataField, type Wikilink } from "../src"

const parse = (markdown: string): Root => {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkPlugin)

  return processor.runSync(processor.parse(markdown)) as Root
}

const render = (markdown: string): string => {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkPlugin).use(remarkStringify, { bullet: "-" })

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

const fieldKey = (field: InlineDataField) => field.children[0]
const fieldValue = (field: InlineDataField) => field.children[1]

describe("remarkPlugin", () => {
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

  it("parses targets, headers, block references, aliases, local links, embeds, and nested brackets", () => {
    const tree = parse(
      "[[Target]] [[Target#Header]] [[#Header]] [[#^block-id]] [[Target#^block|Alias]] ![[Folder [Draft]/Note.md#Header|Embed [x]]]"
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
    assert.equal(links[5]?.target, "Folder [Draft]/Note.md")
    assert.equal(links[5]?.header, "Header")
    assert.equal(links[5]?.alias, "Embed [x]")
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

  it("parses inline data fields as distinct container nodes", () => {
    const tree = parse("Task [due:: 2022-04-05] and (priority:: high)")
    const paragraph = firstParagraph(tree)
    const fields = collect<InlineDataField>(tree, "inlineDataField")

    assert.equal(fields.length, 2)
    assert.deepEqual(
      paragraph.children.map((child) => child.type),
      ["text", "inlineDataField", "text", "inlineDataField"]
    )
    assert.equal(fields[0]?.delimiter, "square")
    assert.deepEqual(fields[0]?.children.map((child) => child.type), ["inlineDataFieldKey", "inlineDataFieldValue"])
    assert.deepEqual(fieldKey(fields[0]!).children.map((child) => child.type), ["text"])
    assert.deepEqual(fieldValue(fields[0]!).children.map((child) => child.type), ["text"])
    assert.equal((fieldKey(fields[0]!).children[0] as { value: string }).value, "due")
    assert.equal((fieldValue(fields[0]!).children[0] as { value: string }).value, "2022-04-05")
    assert.equal(fields[1]?.delimiter, "paren")
  })

  it("parses wikilinks inside inline data field values", () => {
    const tree = parse("[area:: [[Ops]]]")
    const field = collect<InlineDataField>(tree, "inlineDataField")[0]
    const link = field === undefined ? undefined : (fieldValue(field).children[0] as Wikilink | undefined)

    assert.ok(field)
    assert.equal(fieldValue(field).children.length, 1)
    assert.equal(link?.type, "wikilink")
    assert.equal(link?.target, "Ops")
    assert.equal(link?.value, "Ops")
  })

  it("parses block anchors inside inline data field values", () => {
    const tree = parse("[ref:: ^send-mail]")
    const field = collect<InlineDataField>(tree, "inlineDataField")[0]
    const anchor = field === undefined ? undefined : (fieldValue(field).children[0] as BlockAnchor | undefined)

    assert.ok(field)
    assert.equal(fieldValue(field).children.length, 1)
    assert.equal(anchor?.type, "blockAnchor")
    assert.equal(anchor?.id, "send-mail")
  })

  it("parses wikilinks inside inline data field keys", () => {
    const tree = parse("[[Key Note]]:: outside [ [[Key Note]]:: value]")
    const field = collect<InlineDataField>(tree, "inlineDataField")[0]
    const keyLink = field === undefined ? undefined : (fieldKey(field).children[0] as Wikilink | undefined)

    assert.ok(field)
    assert.equal(keyLink?.type, "wikilink")
    assert.equal(keyLink?.target, "Key Note")
  })

  it("leaves nested inline data fields as text", () => {
    const tree = parse("[a:: [b:: c]]")
    const fields = collect<InlineDataField>(tree, "inlineDataField")
    const paragraph = firstParagraph(tree)

    assert.equal(fields.length, 0)
    assert.deepEqual(paragraph.children.map((child) => child.type), ["text"])
    assert.equal((paragraph.children[0] as { value: string }).value, "[a:: [b:: c]]")
  })

  it("does not scan inline code or fenced code", () => {
    const tree = parse("`[[Nope]] ^nope [x:: y]`\n\n```md\n[[Nope]]\n^nope\n[x:: y]\n```\n\n[[Yep]] ^yep [ok:: yes]")
    const links = collect<Wikilink>(tree, "wikilink")
    const anchors = collect<BlockAnchor>(tree, "blockAnchor")
    const fields = collect<InlineDataField>(tree, "inlineDataField")

    assert.equal(links.length, 1)
    assert.equal(links[0]?.target, "Yep")
    assert.equal(anchors.length, 1)
    assert.equal(anchors[0]?.id, "yep")
    assert.equal(fields.length, 1)
  })

  it("copies exact source positions onto inline data fields and nested wikilinks", () => {
    const tree = parse("A [area:: [[Ops]]] Z")
    const field = collect<InlineDataField>(tree, "inlineDataField")[0]
    const link = field === undefined ? undefined : (fieldValue(field).children[0] as Wikilink | undefined)

    assert.ok(field)
    assert.deepEqual(field.position, {
      start: { line: 1, column: 3, offset: 2 },
      end: { line: 1, column: 19, offset: 18 }
    })
    assert.deepEqual(fieldKey(field).position, {
      start: { line: 1, column: 4, offset: 3 },
      end: { line: 1, column: 8, offset: 7 }
    })
    assert.deepEqual(fieldValue(field).position, {
      start: { line: 1, column: 11, offset: 10 },
      end: { line: 1, column: 18, offset: 17 }
    })
    assert.deepEqual(link?.position, {
      start: { line: 1, column: 11, offset: 10 },
      end: { line: 1, column: 18, offset: 17 }
    })
  })

  it("round-trips mixed custom syntax", () => {
    const input = "- [ ] Send mail [due:: 2022-04-05] [area:: [[Ops]]] ^send-mail"

    assert.equal(render(input), `${input}\n`)
  })

  it("round-trips parenthesis fields", () => {
    assert.equal(render("This will not show the (priority:: high)"), "This will not show the (priority:: high)\n")
  })

  it("supports UTF-8 and emoji keys in bracket syntax", () => {
    const tree = parse("[🎅:: a console game] [Noël:: Un jeu de console] [クリスマス:: 家庭用ゲーム機]")
    const fields = collect<InlineDataField>(tree, "inlineDataField")

    assert.equal(fields.length, 3)
    assert.deepEqual(
      fields.map((field) => (fieldKey(field).children[0] as { value: string }).value),
      ["🎅", "Noël", "クリスマス"]
    )
  })
})
