import { strict as assert } from "node:assert"
import { remarkObsidian } from "@kb/remark-obsidian"
import type { Root } from "mdast"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkStringify from "remark-stringify"
import { unified } from "unified"
import { describe, it } from "vitest"

import * as Markdown from "../src/markdown"

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkObsidian)
  .use(remarkStringify)

const parse = (source: string): Root => processor.runSync(processor.parse(source)) as Root

const findNode = (
  node: Markdown.MarkdownNode,
  predicate: (node: Markdown.MarkdownNode) => boolean
): Markdown.MarkdownNode | undefined => {
  if (predicate(node)) {
    return node
  }
  if (!Markdown.isParent(node)) {
    return undefined
  }
  for (const child of node.children) {
    const found = findNode(child, predicate)
    if (found !== undefined) {
      return found
    }
  }
  return undefined
}

describe("Markdown Schema codecs", () => {
  it("decodes mdast roots and children into Schema tagged classes with mdast type fields", () => {
    const root = Markdown.decodeMdast(parse("# Title\n\nalpha **bravo** [rating:: high]\n"))

    assert.ok(root instanceof Markdown.MarkdownRoot)
    assert.equal(root._tag, "Root")
    assert.equal(root.type, "root")

    const heading = root.children[0]
    assert.ok(heading)
    assert.ok(heading instanceof Markdown.MarkdownHeading)
    assert.equal(heading._tag, "Heading")
    assert.equal(heading.type, "heading")

    const paragraph = root.children[1]
    assert.ok(paragraph)
    assert.ok(paragraph instanceof Markdown.MarkdownParagraph)
    assert.equal(paragraph._tag, "Paragraph")
    assert.equal(paragraph.type, "paragraph")

    const strong = findNode(root, Markdown.MarkdownNode.$is("Strong"))
    assert.ok(strong)
    assert.ok(strong instanceof Markdown.MarkdownStrong)
    assert.equal(strong.type, "strong")
  })

  it("decodes Obsidian inline fields while preserving their stringify type", () => {
    const root = Markdown.decodeMdast(parse("alpha [rating:: high]\n"))
    const field = findNode(root, Markdown.MarkdownNode.$is("ObsidianInlineField"))

    assert.ok(field)
    assert.ok(field instanceof Markdown.MarkdownObsidianInlineField)
    assert.ok(Markdown.MarkdownNode.$is("ObsidianInlineField")(field))
    assert.equal(field._tag, "ObsidianInlineField")
    assert.equal(field.type, "obsidianInlineField")
    assert.equal(field.key, "rating")
    assert.equal(field.value, "high")
    assert.equal(field.original, "[rating:: high]")
  })

  it("omits undefined optional fields while preserving null values on decoded nodes", () => {
    const root = Markdown.decodeMdast({
      type: "root",
      children: [
        { type: "link", url: "https://example.com", children: [{ type: "text", value: "example" }] },
        { type: "image", url: "image.png", alt: null, title: null },
        { type: "table", align: undefined, children: [] }
      ]
    } as Root)

    const link = root.children[0]
    const image = root.children[1]
    const table = root.children[2]

    assert.ok(link)
    assert.ok(Markdown.MarkdownNode.$is("Link")(link))
    assert.equal("title" in link, false)

    assert.ok(image)
    assert.ok(Markdown.MarkdownNode.$is("Image")(image))
    assert.equal(image.alt, null)
    assert.equal(image.title, null)

    assert.ok(table)
    assert.ok(Markdown.MarkdownNode.$is("Table")(table))
    assert.equal("align" in table, false)
  })

  it("encodes tagged nodes without _tag and stringifies Obsidian inline fields", () => {
    const root = Markdown.MarkdownNode.Root({
      type: "root",
      children: [
        Markdown.MarkdownNode.Paragraph({
          type: "paragraph",
          children: [
            Markdown.MarkdownNode.Text({ type: "text", value: "Task " }),
            Markdown.MarkdownNode.ObsidianInlineField({
              type: "obsidianInlineField",
              key: "completed",
              value: "2026-05-26",
              original: "[completed:: 2026-05-26]",
              valueStart: 13,
              valueEnd: 23
            })
          ]
        })
      ]
    })

    const encoded = Markdown.encodeMdast(root)
    const paragraph = encoded.children[0]
    assert.ok(paragraph)
    assert.equal("_tag" in encoded, false)
    assert.equal("_tag" in paragraph, false)
    assert.equal(processor.stringify(encoded), "Task [completed:: 2026-05-26]\n")
  })

  it("round-trips decode to encode while preserving the markdown shape unified stringifies", () => {
    const encoded = Markdown.encodeMdast(Markdown.decodeMdast(parse("- [ ] Task [completed:: 2026-05-26]\n")))

    assert.equal("_tag" in encoded, false)
    assert.equal(encoded.type, "root")
    assert.equal(processor.stringify(encoded), "* [ ] Task [completed:: 2026-05-26]\n")
  })
})
